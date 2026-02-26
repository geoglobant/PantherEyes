import * as vscode from 'vscode';
import { PantherEyesChatPanel } from '../chat/chatPanel';
import { PantherEyesAgentClient, PantherEyesAgentClientError } from '../services/agentClient';
import { PantherEyesAgentRuntimeManager } from '../services/agentRuntimeManager';
import { PantherEyesSecretStore, type LlmProvider } from '../services/secretStore';
import { getAgentServerUrl, getConfiguredEnv, getConfiguredTarget, getPrimaryWorkspacePath } from '../util/workspace';

interface RegisterCommandDeps {
  context: vscode.ExtensionContext;
  secretStore: PantherEyesSecretStore;
  agentRuntime: PantherEyesAgentRuntimeManager;
}

async function pickTarget(defaultTarget: 'web' | 'mobile'): Promise<'web' | 'mobile' | undefined> {
  return vscode.window.showQuickPick(['web', 'mobile'], {
    title: 'PantherEyes Target',
    placeHolder: defaultTarget,
  }) as Promise<'web' | 'mobile' | undefined>;
}

async function pickEnv(title: string, defaultEnv: string): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'dev', description: 'Local/developer environment' },
      { label: 'staging', description: 'Pre-production validation environment' },
      { label: 'prod', description: 'Production policy baseline' },
    ],
    {
      title,
      placeHolder: defaultEnv,
    },
  );
  return picked?.label;
}

async function pickProvider(current: LlmProvider): Promise<LlmProvider | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      { label: 'none', description: 'Disable provider (deterministic mode only)' },
      { label: 'openai', description: 'Prepare OpenAI BYOK secret (stub only)' },
      { label: 'claude', description: 'Prepare Claude BYOK secret (stub only)' },
    ],
    {
      title: `PantherEyes LLM Provider (current: ${current})`,
      placeHolder: 'Choose provider',
    },
  );

  if (!picked) {
    return undefined;
  }

  if (picked.label === 'openai' || picked.label === 'claude' || picked.label === 'none') {
    return picked.label;
  }

  return undefined;
}

export function registerCommands(deps: RegisterCommandDeps): vscode.Disposable[] {
  const { context, secretStore, agentRuntime } = deps;

  const showPanel = (draft?: { message?: string; intent?: string; env?: string; target?: 'web' | 'mobile'; autoSend?: boolean }) =>
    PantherEyesChatPanel.createOrShow(context, { secretStore, agentRuntime }, draft);

  const askAgent = vscode.commands.registerCommand('panthereyes.askAgent', async () => {
    void agentRuntime.ensureAgentReady({ interactive: false, reason: 'askAgent-command' });
    showPanel();
  });

  const validateSecurityConfig = vscode.commands.registerCommand(
    'panthereyes.validateSecurityConfig',
    async () => {
      const ready = await agentRuntime.ensureAgentReady({ interactive: true, reason: 'validateSecurityConfig-command' });
      if (!ready) {
        return;
      }

      const workspacePath = getPrimaryWorkspacePath();
      if (!workspacePath) {
        await vscode.window.showErrorMessage('Open a workspace folder before validating PantherEyes config.');
        return;
      }

      const client = new PantherEyesAgentClient(getAgentServerUrl());
      try {
        const result = await client.callTool('panthereyes.validate_security_config', {
          rootDir: workspacePath,
        });
        const structured = (result.structuredContent ?? {}) as {
          valid?: boolean;
          counts?: { environments?: number; rules?: number; exceptions?: number };
          warnings?: string[];
        };
        const warnings = Array.isArray(structured.warnings) ? structured.warnings.length : 0;
        const counts = structured.counts ?? {};
        const message = `PantherEyes config ${structured.valid === false ? 'invalid' : 'validated'}: envs=${counts.environments ?? 0}, rules=${counts.rules ?? 0}, exceptions=${counts.exceptions ?? 0}, warnings=${warnings}`;
        void vscode.window.showInformationMessage(message, 'Open Chat').then((choice) => {
          if (choice === 'Open Chat') {
            const env = getConfiguredEnv();
            const target = getConfiguredTarget();
            showPanel({
              message: `Validate security config and summarize warnings for ${env}/${target}`,
              intent: 'generate_policy_tests',
              env,
              target,
              autoSend: true,
            });
          }
        });
      } catch (error) {
        const err = error as Error;
        const details = error instanceof PantherEyesAgentClientError ? error.body : undefined;
        const selected = await vscode.window.showErrorMessage(
          `PantherEyes config validation failed: ${err.message}`,
          'Fallback to Chat',
        );
        if (selected === 'Fallback to Chat') {
          const env = getConfiguredEnv();
          const target = getConfiguredTarget();
          showPanel({
            message: `Validate security config and summarize warnings for ${env}/${target}`,
            intent: 'generate_policy_tests',
            env,
            target,
            autoSend: true,
          });
        }
        if (details) {
          const channel = vscode.window.createOutputChannel('PantherEyes Agent');
          channel.appendLine(details);
          channel.show(true);
        }
      }
    },
  );

  const runScan = vscode.commands.registerCommand('panthereyes.runScan', async () => {
    const workspacePath = getPrimaryWorkspacePath();
    if (!workspacePath) {
      await vscode.window.showErrorMessage('Open a workspace folder before running PantherEyes scan.');
      return;
    }

    const target = (await pickTarget(getConfiguredTarget())) ?? getConfiguredTarget();
    const ready = await agentRuntime.ensureAgentReady({ interactive: true, reason: 'runScan-command' });
    if (!ready) {
      return;
    }

    const client = new PantherEyesAgentClient(getAgentServerUrl());
    try {
      const result = await client.callTool('panthereyes.scan_gate_report', {
        rootDir: workspacePath,
        target,
        phase: 'static',
        failOn: ['block'],
        format: 'both',
      });
      const panel = showPanel({ env: getConfiguredEnv(), target });
      panel.showToolResult({
        toolName: 'panthereyes.scan_gate_report',
        endpoint: getAgentServerUrl(),
        request: {
          rootDir: workspacePath,
          target,
          phase: 'static',
          failOn: ['block'],
          format: 'both',
        },
        response: result,
      });
      void vscode.window.showInformationMessage(`PantherEyes scan report loaded in the PantherEyes panel.`);
    } catch (error) {
      const err = error as Error;
      const choice = await vscode.window.showErrorMessage(
        `PantherEyes scan via tools bridge failed: ${err.message}`,
        'Run in Terminal',
      );
      if (choice !== 'Run in Terminal') {
        return;
      }
      const terminal = vscode.window.createTerminal({ name: 'PantherEyes Scan', cwd: workspacePath });
      terminal.show(true);
      terminal.sendText(`cargo run -p panthereyes-cli -- scan --target ${target} "${workspacePath}"`);
      void vscode.window.showInformationMessage(`PantherEyes scan started in terminal for target ${target}.`);
    }
  });

  const previewPolicyDiff = vscode.commands.registerCommand('panthereyes.previewPolicyDiff', async () => {
    const workspacePath = getPrimaryWorkspacePath();
    if (!workspacePath) {
      await vscode.window.showErrorMessage('Open a workspace folder before previewing PantherEyes policy diff.');
      return;
    }

    const target = (await pickTarget(getConfiguredTarget())) ?? getConfiguredTarget();
    const defaultEnv = getConfiguredEnv();
    const baseEnv = (await pickEnv('PantherEyes Base Environment', defaultEnv === 'prod' ? 'dev' : defaultEnv)) ?? 'dev';
    const compareEnv = (await pickEnv('PantherEyes Compare Environment', defaultEnv)) ?? defaultEnv;

    const ready = await agentRuntime.ensureAgentReady({ interactive: true, reason: 'previewPolicyDiff-command' });
    if (!ready) {
      return;
    }

    const client = new PantherEyesAgentClient(getAgentServerUrl());
    try {
      const result = await client.callTool('panthereyes.compare_policy_envs_report', {
        rootDir: workspacePath,
        target,
        baseEnv,
        compareEnv,
        format: 'both',
      });
      const panel = showPanel({ env: compareEnv, target });
      panel.showToolResult({
        toolName: 'panthereyes.compare_policy_envs_report',
        endpoint: getAgentServerUrl(),
        request: {
          rootDir: workspacePath,
          target,
          baseEnv,
          compareEnv,
          format: 'both',
        },
        response: result,
      });
      void vscode.window.showInformationMessage(`PantherEyes policy diff loaded in the PantherEyes panel.`);
    } catch (error) {
      const err = error as Error;
      const selected = await vscode.window.showErrorMessage(
        `PantherEyes policy diff failed: ${err.message}`,
        'Open Chat',
      );
      if (selected === 'Open Chat') {
        showPanel({
          message: `compare policy ${baseEnv} vs ${compareEnv} for ${target}`,
          intent: 'compare_policy_envs',
          env: compareEnv,
          target,
          autoSend: true,
        });
      }
    }
  });

  const showToolsSchema = vscode.commands.registerCommand('panthereyes.showToolsSchema', async () => {
    const ready = await agentRuntime.ensureAgentReady({ interactive: true, reason: 'showToolsSchema-command' });
    if (!ready) {
      return;
    }

    const client = new PantherEyesAgentClient(getAgentServerUrl());
    try {
      const schema = await client.getToolsSchema();
      const panel = showPanel({ env: getConfiguredEnv(), target: getConfiguredTarget() });
      panel.showToolResult({
        toolName: 'panthereyes.tools_schema',
        endpoint: getAgentServerUrl(),
        request: {},
        response: {
          content: [
            {
              type: 'text',
              text: `Loaded tools schema v${schema.schemaVersion} with ${schema.tools.length} tool(s).`,
            },
            { type: 'json', json: schema },
          ],
          structuredContent: schema,
        },
      });
      void vscode.window.showInformationMessage('PantherEyes tools schema loaded in the PantherEyes panel.');
    } catch (error) {
      const err = error as Error;
      await vscode.window.showErrorMessage(`PantherEyes tools schema failed: ${err.message}`);
    }
  });

  const setLlmProvider = vscode.commands.registerCommand('panthereyes.setLlmProvider', async () => {
    const current = secretStore.getProvider();
    const picked = await pickProvider(current);
    if (!picked) {
      return;
    }

    await secretStore.setProvider(picked);

    if (picked === 'none') {
      await vscode.window.showInformationMessage('PantherEyes LLM provider set to none (deterministic mode).');
      return;
    }

    const apiKey = await vscode.window.showInputBox({
      title: `Store ${picked} API key (BYOK placeholder)` ,
      prompt: `SecretStorage is ready. Optionally store a ${picked} API key for future provider integration.`,
      ignoreFocusOut: true,
      password: true,
      placeHolder: 'sk-... (optional)',
    });

    if (apiKey && apiKey.trim()) {
      await secretStore.storeApiKey(picked, apiKey.trim());
      await vscode.window.showInformationMessage(`Stored ${picked} API key in SecretStorage (provider integration not enabled yet).`);
      return;
    }

    await vscode.window.showInformationMessage(`PantherEyes provider set to ${picked}. No API key stored yet.`);
  });

  const agentStatus = vscode.commands.registerCommand('panthereyes.agentStatus', async () => {
    await agentRuntime.showStatusActions();
  });

  return [askAgent, validateSecurityConfig, runScan, previewPolicyDiff, showToolsSchema, setLlmProvider, agentStatus];
}
