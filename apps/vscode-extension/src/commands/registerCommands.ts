import * as vscode from 'vscode';
import { PantherEyesChatPanel } from '../chat/chatPanel';
import { PantherEyesSecretStore, type LlmProvider } from '../services/secretStore';
import { getConfiguredEnv, getConfiguredTarget, getPrimaryWorkspacePath } from '../util/workspace';

interface RegisterCommandDeps {
  context: vscode.ExtensionContext;
  secretStore: PantherEyesSecretStore;
}

async function pickTarget(defaultTarget: 'web' | 'mobile'): Promise<'web' | 'mobile' | undefined> {
  return vscode.window.showQuickPick(['web', 'mobile'], {
    title: 'PantherEyes Target',
    placeHolder: defaultTarget,
  }) as Promise<'web' | 'mobile' | undefined>;
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
  const { context, secretStore } = deps;

  const showPanel = (draft?: { message?: string; intent?: string; env?: string; target?: 'web' | 'mobile'; autoSend?: boolean }) =>
    PantherEyesChatPanel.createOrShow(context, { secretStore }, draft);

  const askAgent = vscode.commands.registerCommand('panthereyes.askAgent', async () => {
    showPanel();
  });

  const validateSecurityConfig = vscode.commands.registerCommand(
    'panthereyes.validateSecurityConfig',
    async () => {
      const env = getConfiguredEnv();
      const target = getConfiguredTarget();
      showPanel({
        message: `Validate security config and summarize warnings for ${env}/${target}`,
        intent: 'generate_policy_tests',
        env,
        target,
        autoSend: true,
      });
    },
  );

  const runScan = vscode.commands.registerCommand('panthereyes.runScan', async () => {
    const workspacePath = getPrimaryWorkspacePath();
    if (!workspacePath) {
      await vscode.window.showErrorMessage('Open a workspace folder before running PantherEyes scan.');
      return;
    }

    const target = (await pickTarget(getConfiguredTarget())) ?? getConfiguredTarget();
    const terminal = vscode.window.createTerminal({ name: 'PantherEyes Scan', cwd: workspacePath });
    terminal.show(true);
    terminal.sendText(`cargo run -p panthereyes-cli -- scan --target ${target} "${workspacePath}"`);
    void vscode.window.showInformationMessage(`PantherEyes scan started in terminal for target ${target}.`);
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

  return [askAgent, validateSecurityConfig, runScan, setLlmProvider];
}
