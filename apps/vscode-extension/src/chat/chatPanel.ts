import * as vscode from 'vscode';
import * as path from 'node:path';
import { PantherEyesAgentClient, PantherEyesAgentClientError } from '../services/agentClient';
import { PantherEyesAgentRuntimeManager } from '../services/agentRuntimeManager';
import { PantherEyesSecretStore } from '../services/secretStore';
import type {
  PantherEyesChangeSet,
  PantherEyesChatRequest,
  PantherEyesChatResponse,
  PantherEyesTarget,
  PantherEyesToolCallResponse,
} from '../types/agent';
import { getAgentServerUrl, getConfiguredEnv, getConfiguredTarget, getPrimaryWorkspacePath } from '../util/workspace';

interface ChatPanelDraft {
  message?: string;
  intent?: string;
  env?: string;
  target?: PantherEyesTarget;
  autoSend?: boolean;
}

interface ChatPanelServices {
  secretStore: PantherEyesSecretStore;
  agentRuntime: PantherEyesAgentRuntimeManager;
}

interface ToolPanelResultInput {
  toolName: string;
  endpoint?: string;
  request?: Record<string, unknown>;
  response: PantherEyesToolCallResponse | Record<string, unknown>;
}

export class PantherEyesChatPanel {
  private static current: PantherEyesChatPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private currentChangeSet: PantherEyesChangeSet | undefined;
  private currentChangeSetRootDir: string | undefined;

  static createOrShow(context: vscode.ExtensionContext, services: ChatPanelServices, draft?: ChatPanelDraft): PantherEyesChatPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (PantherEyesChatPanel.current) {
      PantherEyesChatPanel.current.panel.reveal(column);
      PantherEyesChatPanel.current.postInitState(draft);
      return PantherEyesChatPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      'panthereyesChat',
      'PantherEyes Chat',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    PantherEyesChatPanel.current = new PantherEyesChatPanel(panel, context, services);
    PantherEyesChatPanel.current.postInitState(draft);
    return PantherEyesChatPanel.current;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly context: vscode.ExtensionContext,
    private readonly services: ChatPanelServices,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => {
      PantherEyesChatPanel.current = undefined;
    });

    this.panel.webview.onDidReceiveMessage(async (message: unknown) => {
      await this.handleMessage(message);
    });
  }

  async submitPromptFromCommand(draft: Required<Pick<ChatPanelDraft, 'message'>> & ChatPanelDraft): Promise<void> {
    this.postInitState({ ...draft, autoSend: true });
  }

  showToolResult(input: ToolPanelResultInput): void {
    const changeSet = extractChangeSet(input.response);
    this.currentChangeSet = changeSet;
    this.currentChangeSetRootDir =
      (typeof input.request?.rootDir === 'string' && input.request.rootDir) || getPrimaryWorkspacePath() || undefined;
    this.postToWebview({
      type: 'toolResponse',
      toolName: input.toolName,
      endpoint: input.endpoint,
      request: input.request,
      response: input.response,
      changeSet,
    });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }
    const msg = message as Record<string, unknown>;

    if (msg.type === 'requestState') {
      this.postInitState();
      return;
    }

    if (msg.type === 'submitPrompt') {
      await this.handleSubmitPrompt(msg);
      return;
    }

    if (msg.type === 'applyChangeSet') {
      await this.handleApplyChangeSet();
      return;
    }
  }

  private async handleSubmitPrompt(msg: Record<string, unknown>): Promise<void> {
    const prompt = typeof msg.prompt === 'string' ? msg.prompt.trim() : '';
    const env = typeof msg.env === 'string' && msg.env.trim() ? msg.env.trim() : getConfiguredEnv();
    const target = msg.target === 'mobile' ? 'mobile' : 'web';
    const intent = typeof msg.intent === 'string' && msg.intent.trim() ? msg.intent.trim() : undefined;

    if (!prompt) {
      this.postToWebview({ type: 'agentError', error: 'Prompt is empty.' });
      return;
    }

    const rootDir = getPrimaryWorkspacePath();
    const request: PantherEyesChatRequest = {
      message: prompt,
      intent,
      context: {
        env,
        target,
        rootDir,
      },
    };

    const endpoint = getAgentServerUrl();
    const ready = await this.services.agentRuntime.ensureAgentReady({ interactive: false, reason: 'chat-submit' });
    if (!ready) {
      this.postToWebview({
        type: 'agentError',
        error: 'PantherEyes agent is offline. The extension could not start/connect to the local agent.',
        endpoint,
      });
      return;
    }
    const client = new PantherEyesAgentClient(endpoint);
    this.postToWebview({ type: 'agentLoading', endpoint, request });

    try {
      const response = await client.chat(request);
      this.currentChangeSet = response.planner?.changeSet;
      this.currentChangeSetRootDir = rootDir ?? undefined;
      this.postToWebview({ type: 'agentResponse', endpoint, request, response });
    } catch (error) {
      const err = error as Error;
      const details = error instanceof PantherEyesAgentClientError ? error.body : undefined;
      this.postToWebview({
        type: 'agentError',
        error: err.message,
        details,
        endpoint,
      });
    }
  }

  private async handleApplyChangeSet(): Promise<void> {
    const changeSet = this.currentChangeSet;
    const rootDir = this.currentChangeSetRootDir ?? getPrimaryWorkspacePath();
    if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
      this.postToWebview({ type: 'agentError', error: 'No ChangeSet available to apply.' });
      return;
    }
    if (!rootDir) {
      this.postToWebview({ type: 'agentError', error: 'No workspace root available to apply the ChangeSet.' });
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Apply ChangeSet with ${changeSet.changes.length} change(s) to workspace?`,
      { modal: true },
      'Apply',
    );
    if (confirm !== 'Apply') {
      return;
    }

    try {
      await applyChangeSetToWorkspace(changeSet, rootDir);
      this.postToWebview({
        type: 'changesApplied',
        message: `Applied ${changeSet.changes.length} change(s) to ${rootDir}.`,
      });
      void vscode.window.showInformationMessage(`PantherEyes applied ${changeSet.changes.length} ChangeSet file(s).`);
    } catch (error) {
      const err = error as Error;
      this.postToWebview({ type: 'agentError', error: `Apply ChangeSet failed: ${err.message}` });
    }
  }

  private postInitState(draft?: ChatPanelDraft): void {
    const provider = this.services.secretStore.getProvider();
    this.postToWebview({
      type: 'initState',
      state: {
        endpoint: getAgentServerUrl(),
        defaultEnv: draft?.env ?? getConfiguredEnv(),
        defaultTarget: draft?.target ?? getConfiguredTarget(),
        defaultIntent: draft?.intent ?? '',
        workspacePath: getPrimaryWorkspacePath() ?? '',
        provider,
        draftPrompt: draft?.message ?? '',
        autoSend: draft?.autoSend ?? false,
      },
    });
  }

  private postToWebview(payload: unknown): void {
    void this.panel.webview.postMessage(payload);
  }

  private getHtml(): string {
    const nonce = String(Date.now());
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PantherEyes Chat</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
    }
    body { font-family: var(--vscode-font-family); margin: 0; background: var(--bg); color: var(--fg); }
    .wrap { padding: 14px; display: grid; gap: 12px; }
    .card { border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
    .row { display: grid; gap: 8px; grid-template-columns: 1fr 1fr; }
    .row3 { display: grid; gap: 8px; grid-template-columns: 2fr 1fr 1fr; }
    label { font-size: 12px; color: var(--muted); display: grid; gap: 4px; }
    input, select, textarea, button {
      font: inherit;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--input-bg);
      color: var(--input-fg);
      padding: 8px;
    }
    textarea { min-height: 92px; resize: vertical; }
    button.primary { background: var(--accent); color: var(--accent-fg); border: none; cursor: pointer; }
    .muted { color: var(--muted); font-size: 12px; }
    .status { font-weight: 600; }
    pre { white-space: pre-wrap; word-break: break-word; border: 1px solid var(--border); border-radius: 8px; padding: 10px; overflow: auto; }
    .changes { display: grid; gap: 8px; }
    .change { border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
    .change h4 { margin: 0 0 6px 0; font-size: 13px; }
    .toolbar { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
    .toolbar-left { display: flex; gap: 8px; align-items: center; }
    .toolbar button { padding: 4px 8px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <strong>PantherEyes Agent Chat</strong>
        </div>
        <span id="provider" class="muted"></span>
      </div>
      <div class="muted" id="endpoint"></div>
      <div class="muted" id="workspace"></div>
    </div>

    <div class="card">
      <div class="row3">
        <label>Intent
          <input id="intent" placeholder="generate_policy_tests (optional)" />
        </label>
        <label>Env
          <input id="env" value="dev" />
        </label>
        <label>Target
          <select id="target">
            <option value="web">web</option>
            <option value="mobile">mobile</option>
          </select>
        </label>
      </div>
      <label style="margin-top:8px;">Prompt
        <textarea id="prompt" placeholder="Ask PantherEyes agent to generate policy tests..."></textarea>
      </label>
      <div style="margin-top:8px;">
        <button id="send" class="primary">Send to Agent</button>
      </div>
      <div id="status" class="muted" style="margin-top:8px;"></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <strong>ChangeSet Preview</strong>
        </div>
        <button id="applyChanges" disabled>Apply ChangeSet</button>
      </div>
      <div id="changes" class="changes" style="margin-top:10px;"></div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <strong id="resultTitle">Agent Response</strong>
        </div>
      </div>
      <pre id="response">No response yet.</pre>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const els = {
      endpoint: document.getElementById('endpoint'),
      workspace: document.getElementById('workspace'),
      provider: document.getElementById('provider'),
      intent: document.getElementById('intent'),
      env: document.getElementById('env'),
      target: document.getElementById('target'),
      prompt: document.getElementById('prompt'),
      send: document.getElementById('send'),
      applyChanges: document.getElementById('applyChanges'),
      status: document.getElementById('status'),
      changes: document.getElementById('changes'),
      response: document.getElementById('response'),
      resultTitle: document.getElementById('resultTitle')
    };

    let initialized = false;

    function setStatus(text, isError = false) {
      els.status.textContent = text || '';
      els.status.style.color = isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)';
    }

    function renderChanges(changeSet) {
      els.changes.innerHTML = '';
      els.applyChanges.disabled = !changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0;
      if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No ChangeSet available.';
        els.changes.appendChild(empty);
        return;
      }

      const summary = document.createElement('div');
      summary.className = 'muted';
      summary.textContent = changeSet.summary || '';
      els.changes.appendChild(summary);

      for (const change of changeSet.changes) {
        const card = document.createElement('div');
        card.className = 'change';
        const title = document.createElement('h4');
        title.textContent = String(change.kind || '').toUpperCase() + ' ' + String(change.path || '');
        const reason = document.createElement('div');
        reason.className = 'muted';
        reason.textContent = change.reason || '';
        const preview = document.createElement('pre');
        preview.textContent = String(change.content || '').slice(0, 1200);
        card.appendChild(title);
        card.appendChild(reason);
        card.appendChild(preview);
        els.changes.appendChild(card);
      }
    }

    function submit() {
      const prompt = els.prompt.value.trim();
      if (!prompt) {
        setStatus('Prompt is empty.', true);
        return;
      }
      vscode.postMessage({
        type: 'submitPrompt',
        prompt,
        intent: els.intent.value.trim(),
        env: els.env.value.trim(),
        target: els.target.value
      });
    }

    els.send.addEventListener('click', submit);
    els.applyChanges.addEventListener('click', () => {
      vscode.postMessage({ type: 'applyChangeSet' });
    });

    window.addEventListener('message', (event) => {
      const msg = event.data || {};

      if (msg.type === 'initState') {
        const state = msg.state || {};
        els.endpoint.textContent = 'Endpoint: ' + (state.endpoint || '');
        els.workspace.textContent = state.workspacePath ? ('Workspace: ' + state.workspacePath) : 'Workspace: (none)';
        els.provider.textContent = 'LLM provider: ' + (state.provider || 'none') + ' (BYOK ready)';
        els.env.value = state.defaultEnv || 'dev';
        els.target.value = state.defaultTarget || 'web';
        els.intent.value = state.defaultIntent || '';
        if (state.draftPrompt) {
          els.prompt.value = state.draftPrompt;
        }
        if (state.autoSend && state.draftPrompt && !initialized) {
          initialized = true;
          submit();
          return;
        }
        initialized = true;
        return;
      }

      if (msg.type === 'agentLoading') {
        els.resultTitle.textContent = 'Agent Response';
        setStatus('Sending request to ' + msg.endpoint + '...');
        return;
      }

      if (msg.type === 'agentError') {
        setStatus(msg.error || 'Unknown error', true);
        els.response.textContent = JSON.stringify(msg, null, 2);
        return;
      }

      if (msg.type === 'agentResponse') {
        els.resultTitle.textContent = 'Agent Response';
        setStatus('Agent response received.');
        const response = msg.response || {};
        renderChanges(response?.planner?.changeSet);
        els.response.textContent = JSON.stringify(response, null, 2);
        return;
      }

      if (msg.type === 'toolResponse') {
        els.resultTitle.textContent = 'Tool Result';
        setStatus((msg.toolName || 'tool') + ' response received.');
        renderChanges(msg.changeSet);
        const response = msg.response || {};
        const textContent =
          Array.isArray(response.content)
            ? response.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')?.text
            : undefined;
        els.response.textContent = (textContent ? (textContent + '\\n\\n') : '') + JSON.stringify({
          toolName: msg.toolName,
          endpoint: msg.endpoint,
          request: msg.request,
          response
        }, null, 2);
        return;
      }

      if (msg.type === 'changesApplied') {
        setStatus(msg.message || 'ChangeSet applied.');
        return;
      }
    });

    vscode.postMessage({ type: 'requestState' });
  </script>
</body>
</html>`;
  }
}

function extractChangeSet(payload: unknown): PantherEyesChangeSet | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const direct = tryAsChangeSet(payload);
  if (direct) {
    return direct;
  }

  const record = payload as Record<string, unknown>;
  const planner = record.planner;
  if (planner && typeof planner === 'object') {
    const plannerChangeSet = tryAsChangeSet((planner as Record<string, unknown>).changeSet);
    if (plannerChangeSet) {
      return plannerChangeSet;
    }
  }

  const structured = record.structuredContent;
  if (structured && typeof structured === 'object') {
    const structuredRecord = structured as Record<string, unknown>;
    const structuredDirect = tryAsChangeSet(structuredRecord.changeSet);
    if (structuredDirect) {
      return structuredDirect;
    }
    const structuredPlanner = structuredRecord.planner;
    if (structuredPlanner && typeof structuredPlanner === 'object') {
      return tryAsChangeSet((structuredPlanner as Record<string, unknown>).changeSet);
    }
  }

  return undefined;
}

function tryAsChangeSet(value: unknown): PantherEyesChangeSet | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.summary !== 'string' || !Array.isArray(candidate.changes)) {
    return undefined;
  }
  return value as PantherEyesChangeSet;
}

async function applyChangeSetToWorkspace(changeSet: PantherEyesChangeSet, rootDir: string): Promise<void> {
  const encoder = new TextEncoder();
  const normalizedRoot = path.resolve(rootDir);

  for (const change of changeSet.changes) {
    const targetPath = path.resolve(normalizedRoot, change.path);
    if (!targetPath.startsWith(normalizedRoot + path.sep) && targetPath !== normalizedRoot) {
      throw new Error(`Refusing to write outside workspace root: ${change.path}`);
    }

    await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetPath)));
    await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), encoder.encode(change.content));
  }
}
