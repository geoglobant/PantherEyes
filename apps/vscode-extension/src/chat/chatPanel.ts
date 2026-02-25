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
  private previewedChangeSetFingerprint: string | undefined;
  private cachedToolsSchema:
    | {
        schemaVersion: number;
        generatedAt: string;
        endpoints: { list: string; call: string; schema: string };
        tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
      }
    | undefined;

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
    this.previewedChangeSetFingerprint = undefined;
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
      void this.handleRequestToolsSchema();
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

    if (msg.type === 'reviewAndApplyChangeSet') {
      await this.handleReviewAndApplyChangeSet();
      return;
    }

    if (msg.type === 'previewChangeSetDiff') {
      await this.handlePreviewChangeSetDiff();
      return;
    }

    if (msg.type === 'runTool') {
      await this.handleRunTool(msg);
      return;
    }
  }

  private async handleRequestToolsSchema(): Promise<void> {
    if (this.cachedToolsSchema) {
      this.postToWebview({ type: 'toolsSchema', schema: this.cachedToolsSchema });
      return;
    }

    const endpoint = getAgentServerUrl();
    const ready = await this.services.agentRuntime.ensureAgentReady({ interactive: false, reason: 'tools-schema' });
    if (!ready) {
      return;
    }

    try {
      const client = new PantherEyesAgentClient(endpoint);
      const schema = await client.getToolsSchema();
      this.cachedToolsSchema = schema;
      this.postToWebview({ type: 'toolsSchema', schema });
    } catch (error) {
      const err = error as Error;
      this.postToWebview({ type: 'toolsSchemaError', error: err.message });
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
      this.previewedChangeSetFingerprint = undefined;
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

    const fingerprint = changeSetFingerprint(changeSet);
    if (this.previewedChangeSetFingerprint !== fingerprint) {
      const choice = await vscode.window.showWarningMessage(
        'Preview ChangeSet diff before applying?',
        { modal: true },
        'Preview Diff',
        'Apply Anyway',
      );
      if (choice === 'Preview Diff') {
        await this.handlePreviewChangeSetDiff();
        return;
      }
      if (choice !== 'Apply Anyway') {
        return;
      }
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

  private async handlePreviewChangeSetDiff(): Promise<void> {
    const changeSet = this.currentChangeSet;
    const rootDir = this.currentChangeSetRootDir ?? getPrimaryWorkspacePath();
    if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
      this.postToWebview({ type: 'agentError', error: 'No ChangeSet available to preview.' });
      return;
    }
    if (!rootDir) {
      this.postToWebview({ type: 'agentError', error: 'No workspace root available to preview the ChangeSet.' });
      return;
    }

    const pick = await vscode.window.showQuickPick(
      changeSet.changes.map((change, index) => ({
        label: `${String(change.kind).toUpperCase()} ${change.path}`,
        description: change.reason,
        index,
      })),
      {
        title: 'Preview PantherEyes ChangeSet Diff',
        placeHolder: 'Select a file change to preview',
      },
    );
    if (!pick) {
      return;
    }

    const change = changeSet.changes[pick.index];
    if (!change) {
      return;
    }

    await previewSingleChangeDiff(change, rootDir);
    this.previewedChangeSetFingerprint = changeSetFingerprint(changeSet);
    this.postToWebview({ type: 'changeSetPreviewed', message: `Previewed diff for ${change.path}` });
  }

  private async handleReviewAndApplyChangeSet(): Promise<void> {
    const changeSet = this.currentChangeSet;
    const rootDir = this.currentChangeSetRootDir ?? getPrimaryWorkspacePath();
    if (!changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0) {
      this.postToWebview({ type: 'agentError', error: 'No ChangeSet available to review.' });
      return;
    }
    if (!rootDir) {
      this.postToWebview({ type: 'agentError', error: 'No workspace root available to review/apply the ChangeSet.' });
      return;
    }

    const selectedChanges: PantherEyesChangeSet['changes'] = [];

    for (let i = 0; i < changeSet.changes.length; i += 1) {
      const change = changeSet.changes[i];
      if (!change) {
        continue;
      }

      await previewSingleChangeDiff(change, rootDir);
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Apply This File', value: 'apply', description: `${i + 1}/${changeSet.changes.length}` },
          { label: 'Skip This File', value: 'skip' },
          { label: 'Cancel Review', value: 'cancel' },
        ],
        {
          title: `PantherEyes ChangeSet Review: ${change.path}`,
          placeHolder: 'Decide what to do with this file change',
        },
      );

      if (!choice || choice.value === 'cancel') {
        this.postToWebview({ type: 'changesetReviewCanceled', message: 'ChangeSet review canceled.' });
        return;
      }
      if (choice.value === 'apply') {
        selectedChanges.push(change);
      }
    }

    if (selectedChanges.length === 0) {
      this.postToWebview({ type: 'changesetReviewCanceled', message: 'No file changes selected for apply.' });
      return;
    }

    const reviewedChangeSet: PantherEyesChangeSet = {
      dryRun: changeSet.dryRun,
      summary: `${changeSet.summary} (reviewed selection: ${selectedChanges.length}/${changeSet.changes.length})`,
      changes: selectedChanges,
    };

    const confirm = await vscode.window.showWarningMessage(
      `Apply ${selectedChanges.length} reviewed ChangeSet file(s)?`,
      { modal: true },
      'Apply Selected',
    );
    if (confirm !== 'Apply Selected') {
      return;
    }

    await applyChangeSetToWorkspace(reviewedChangeSet, rootDir);
    this.previewedChangeSetFingerprint = changeSetFingerprint(reviewedChangeSet);
    this.postToWebview({
      type: 'changesApplied',
      message: `Applied ${selectedChanges.length} reviewed change(s) to ${rootDir}.`,
    });
    void vscode.window.showInformationMessage(`PantherEyes applied ${selectedChanges.length} reviewed ChangeSet file(s).`);
  }

  private async handleRunTool(msg: Record<string, unknown>): Promise<void> {
    const toolName = typeof msg.toolName === 'string' ? msg.toolName.trim() : '';
    const argsRaw = typeof msg.toolArgs === 'string' ? msg.toolArgs.trim() : '';
    if (!toolName) {
      this.postToWebview({ type: 'agentError', error: 'Tool name is required.' });
      return;
    }

    let args: Record<string, unknown> | undefined;
    if (argsRaw) {
      try {
        const parsed = JSON.parse(argsRaw) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Tool arguments JSON must be an object');
        }
        args = parsed as Record<string, unknown>;
      } catch (error) {
        const err = error as Error;
        this.postToWebview({ type: 'agentError', error: `Invalid tool args JSON: ${err.message}` });
        return;
      }
    }

    const endpoint = getAgentServerUrl();
    const ready = await this.services.agentRuntime.ensureAgentReady({ interactive: false, reason: 'tool-run' });
    if (!ready) {
      this.postToWebview({
        type: 'agentError',
        error: 'PantherEyes agent is offline. The extension could not start/connect to the local agent.',
        endpoint,
      });
      return;
    }

    const client = new PantherEyesAgentClient(endpoint);
    this.postToWebview({ type: 'toolLoading', toolName, endpoint, request: { name: toolName, arguments: args ?? {} } });
    try {
      const response = await client.callTool(toolName, args);
      this.showToolResult({
        toolName,
        endpoint,
        request: args ?? {},
        response,
      });
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
        defaultToolName: 'panthereyes.scan_gate_report',
        defaultToolArgs: JSON.stringify(
          {
            rootDir: getPrimaryWorkspacePath() ?? '',
            target: draft?.target ?? getConfiguredTarget(),
            phase: 'static',
            failOn: ['block'],
            format: 'both',
          },
          null,
          2,
        ),
      },
    });
  }

  private postToWebview(payload: unknown): void {
    void this.panel.webview.postMessage(payload);
  }

  private getHtml(): string {
    const nonce = String(Date.now());
    const logoUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'panther-logo.png'),
    );
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
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
    .brand { display: flex; gap: 10px; align-items: center; }
    .brand-logo-wrap {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: #000;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255,255,255,0.12);
      overflow: hidden;
      flex-shrink: 0;
    }
    .brand-logo { width: 100%; height: 100%; object-fit: cover; display: block; }
    .brand-copy { display: grid; gap: 2px; }
    .brand-copy strong { font-size: 13px; line-height: 1.1; }
    .brand-copy span { color: var(--muted); font-size: 11px; line-height: 1.1; }
    .history { display: grid; gap: 6px; max-height: 180px; overflow: auto; }
    .history-item { border: 1px solid var(--border); border-radius: 6px; padding: 8px; }
    .history-item strong { display: block; font-size: 12px; }
    .schema-fields { display: grid; gap: 8px; margin-top: 8px; }
    .schema-field { border: 1px dashed var(--border); border-radius: 8px; padding: 8px; }
    .schema-field label { display: grid; gap: 6px; }
    .schema-toolbar { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-top: 8px; }
    .schema-actions { display: flex; gap: 8px; }
    .inline-note { font-size: 11px; color: var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="brand">
            <div class="brand-logo-wrap">
              <img class="brand-logo" src="${logoUri}" alt="PantherEyes logo" />
            </div>
            <div class="brand-copy">
              <strong>PantherEyes Agent</strong>
              <span>Security Copilot Console</span>
            </div>
          </div>
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
          <strong>Run Tool...</strong>
        </div>
        <span id="toolsSchemaStatus" class="muted"></span>
      </div>
      <div class="row">
        <label>Tool Name
          <input id="toolName" placeholder="panthereyes.scan_gate_report" />
        </label>
        <label>Quick Tool
          <select id="toolPreset">
            <option value="">(select preset)</option>
            <option value="panthereyes.validate_security_config">validate_security_config</option>
            <option value="panthereyes.scan_gate_report">scan_gate_report</option>
            <option value="panthereyes.compare_policy_envs_report">compare_policy_envs_report</option>
            <option value="panthereyes.create_policy_exception">create_policy_exception</option>
            <option value="panthereyes.explain_finding">explain_finding</option>
          </select>
        </label>
      </div>
      <label style="margin-top:8px;">Tool Args (JSON object)
        <textarea id="toolArgs" placeholder="{ }" style="min-height:120px;"></textarea>
      </label>
      <div class="schema-toolbar">
        <label style="flex:1;">Schema Helper
          <select id="schemaTool">
            <option value="">(loading tools schema...)</option>
          </select>
        </label>
        <div class="schema-actions">
          <button id="applyFormToArgs" type="button">Sync Form -> JSON</button>
          <button id="loadArgsToForm" type="button">Load JSON -> Form</button>
        </div>
      </div>
      <div id="schemaFields" class="schema-fields"></div>
      <div style="margin-top:8px; display:flex; gap:8px;">
        <button id="runTool">Run Tool</button>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <strong>ChangeSet Preview</strong>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="previewChanges" disabled>Preview Diff</button>
          <button id="reviewApplyChanges" disabled>Review &amp; Apply</button>
          <button id="applyChanges" disabled>Apply ChangeSet</button>
        </div>
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

    <div class="card">
      <div class="toolbar">
        <div class="toolbar-left">
          <strong>History</strong>
        </div>
        <button id="clearHistory">Clear</button>
      </div>
      <div id="history" class="history" style="margin-top:10px;"></div>
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
      toolName: document.getElementById('toolName'),
      toolPreset: document.getElementById('toolPreset'),
      toolArgs: document.getElementById('toolArgs'),
      schemaTool: document.getElementById('schemaTool'),
      schemaFields: document.getElementById('schemaFields'),
      toolsSchemaStatus: document.getElementById('toolsSchemaStatus'),
      applyFormToArgs: document.getElementById('applyFormToArgs'),
      loadArgsToForm: document.getElementById('loadArgsToForm'),
      runTool: document.getElementById('runTool'),
      previewChanges: document.getElementById('previewChanges'),
      reviewApplyChanges: document.getElementById('reviewApplyChanges'),
      applyChanges: document.getElementById('applyChanges'),
      clearHistory: document.getElementById('clearHistory'),
      status: document.getElementById('status'),
      changes: document.getElementById('changes'),
      response: document.getElementById('response'),
      resultTitle: document.getElementById('resultTitle'),
      history: document.getElementById('history')
    };

    let initialized = false;
    const persisted = (typeof vscode.getState === 'function' ? (vscode.getState() || {}) : {}) || {};
    const history = Array.isArray(persisted.history) ? persisted.history.slice(0, 20) : [];
    let toolsSchema = Array.isArray(persisted.toolsSchema) ? persisted.toolsSchema : [];
    let schemaFormValues = persisted.schemaFormValues && typeof persisted.schemaFormValues === 'object'
      ? persisted.schemaFormValues
      : {};
    let pendingPersistTimer = undefined;

    function schedulePersistState() {
      if (pendingPersistTimer) {
        clearTimeout(pendingPersistTimer);
      }
      pendingPersistTimer = setTimeout(() => {
        pendingPersistTimer = undefined;
        vscode.setState({
          history: history.slice(0, 20),
          toolsSchema,
          schemaFormValues,
          ui: {
            intent: els.intent.value,
            env: els.env.value,
            target: els.target.value,
            prompt: els.prompt.value,
            toolName: els.toolName.value,
            toolPreset: els.toolPreset.value,
            toolArgs: els.toolArgs.value,
            schemaTool: els.schemaTool.value
          }
        });
      }, 50);
    }

    function safeParseJsonObject(text) {
      if (!text || !String(text).trim()) {
        return {};
      }
      const parsed = JSON.parse(String(text));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('JSON must be an object');
      }
      return parsed;
    }

    function setStatus(text, isError = false) {
      els.status.textContent = text || '';
      els.status.style.color = isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)';
    }

    function renderChanges(changeSet) {
      els.changes.innerHTML = '';
      els.applyChanges.disabled = !changeSet || !Array.isArray(changeSet.changes) || changeSet.changes.length === 0;
      els.reviewApplyChanges.disabled = els.applyChanges.disabled;
      els.previewChanges.disabled = els.applyChanges.disabled;
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

    function pushHistory(kind, title, detail) {
      history.unshift({
        ts: new Date().toLocaleTimeString(),
        kind,
        title,
        detail
      });
      if (history.length > 20) {
        history.length = 20;
      }
      renderHistory();
      schedulePersistState();
    }

    function renderHistory() {
      els.history.innerHTML = '';
      if (history.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'No activity yet.';
        els.history.appendChild(empty);
        return;
      }
      for (const item of history) {
        const row = document.createElement('div');
        row.className = 'history-item';
        const title = document.createElement('strong');
        title.textContent = '[' + item.ts + '] ' + item.title;
        const meta = document.createElement('div');
        meta.className = 'muted';
        meta.textContent = item.kind + (item.detail ? ' · ' + item.detail : '');
        row.appendChild(title);
        row.appendChild(meta);
        els.history.appendChild(row);
      }
    }

    function getSelectedSchemaTool() {
      const name = els.schemaTool.value || els.toolName.value || '';
      return toolsSchema.find((tool) => tool && tool.name === name);
    }

    function getPropertyType(propertySchema) {
      if (!propertySchema || typeof propertySchema !== 'object') return '';
      if (Array.isArray(propertySchema.type)) {
        return propertySchema.type.find((t) => typeof t === 'string') || '';
      }
      return typeof propertySchema.type === 'string' ? propertySchema.type : '';
    }

    function schemaFieldKey(toolName, propName) {
      return String(toolName || '') + '::' + String(propName || '');
    }

    function readFormValueForProperty(container, propertySchema) {
      const type = getPropertyType(propertySchema);
      if (type === 'boolean') {
        const checkbox = container.querySelector('input[type="checkbox"]');
        return checkbox ? Boolean(checkbox.checked) : false;
      }

      const select = container.querySelector('select[data-role="enum"]');
      if (select) {
        return select.value;
      }

      const input = container.querySelector('input[data-role="value"], textarea[data-role="value"]');
      if (!input) {
        return undefined;
      }

      const raw = String(input.value ?? '');
      if (raw === '') {
        return undefined;
      }

      if (type === 'integer') {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : raw;
      }
      if (type === 'number') {
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : raw;
      }
      if (type === 'array') {
        return raw
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      }
      return raw;
    }

    function writeFormValueForProperty(container, propertySchema, value) {
      const type = getPropertyType(propertySchema);
      if (type === 'boolean') {
        const checkbox = container.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = Boolean(value);
        return;
      }
      const select = container.querySelector('select[data-role="enum"]');
      if (select) {
        select.value = value == null ? '' : String(value);
        return;
      }
      const input = container.querySelector('input[data-role="value"], textarea[data-role="value"]');
      if (!input) {
        return;
      }
      if (Array.isArray(value)) {
        input.value = value.join(', ');
        return;
      }
      input.value = value == null ? '' : String(value);
    }

    function syncToolArgsFromSchemaForm() {
      const tool = getSelectedSchemaTool();
      if (!tool || !tool.inputSchema || typeof tool.inputSchema !== 'object') {
        return;
      }
      const schema = tool.inputSchema;
      const props = schema && typeof schema.properties === 'object' && schema.properties ? schema.properties : {};
      const next = {};
      const fieldNodes = els.schemaFields.querySelectorAll('[data-prop-name]');
      for (const node of fieldNodes) {
        const propName = node.getAttribute('data-prop-name');
        if (!propName) continue;
        const propertySchema = props[propName];
        const value = readFormValueForProperty(node, propertySchema);
        if (value !== undefined) {
          next[propName] = value;
          schemaFormValues[schemaFieldKey(tool.name, propName)] = value;
        } else {
          delete schemaFormValues[schemaFieldKey(tool.name, propName)];
        }
      }
      els.toolArgs.value = JSON.stringify(next, null, 2);
      schedulePersistState();
    }

    function loadSchemaFormFromToolArgs(showError = true) {
      const tool = getSelectedSchemaTool();
      if (!tool) {
        return;
      }
      let parsed = {};
      try {
        parsed = safeParseJsonObject(els.toolArgs.value);
      } catch (error) {
        if (showError) {
          setStatus('Tool Args JSON invalido para preencher o formulario: ' + error.message, true);
        }
        return;
      }
      const props = tool.inputSchema && typeof tool.inputSchema === 'object' && tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object'
        ? tool.inputSchema.properties
        : {};
      const fieldNodes = els.schemaFields.querySelectorAll('[data-prop-name]');
      for (const node of fieldNodes) {
        const propName = node.getAttribute('data-prop-name');
        if (!propName) continue;
        const propertySchema = props[propName];
        writeFormValueForProperty(node, propertySchema, parsed[propName]);
        if (parsed[propName] !== undefined) {
          schemaFormValues[schemaFieldKey(tool.name, propName)] = parsed[propName];
        }
      }
      schedulePersistState();
    }

    function renderSchemaFieldsForSelectedTool() {
      els.schemaFields.innerHTML = '';
      const tool = getSelectedSchemaTool();
      if (!tool) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'Select a tool with schema support to generate a guided form.';
        els.schemaFields.appendChild(empty);
        return;
      }

      const schema = tool.inputSchema;
      const props = schema && typeof schema === 'object' && schema.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};
      const required = Array.isArray(schema && schema.required) ? schema.required : [];
      const propNames = Object.keys(props);

      if (propNames.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'muted';
        empty.textContent = 'This tool does not expose object properties in /tools/schema.';
        els.schemaFields.appendChild(empty);
        return;
      }

      for (const propName of propNames) {
        const propertySchema = props[propName];
        const wrapper = document.createElement('div');
        wrapper.className = 'schema-field';
        wrapper.setAttribute('data-prop-name', propName);

        const label = document.createElement('label');
        const title = document.createElement('span');
        const type = getPropertyType(propertySchema);
        const isRequired = required.includes(propName);
        title.textContent = propName + (isRequired ? ' *' : '') + (type ? ' (' + type + ')' : '');
        label.appendChild(title);

        const enumValues = Array.isArray(propertySchema && propertySchema.enum) ? propertySchema.enum : undefined;
        if (type === 'boolean') {
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = Boolean(propertySchema && propertySchema.default);
          checkbox.addEventListener('change', syncToolArgsFromSchemaForm);
          label.appendChild(checkbox);
        } else if (enumValues && enumValues.length > 0) {
          const select = document.createElement('select');
          select.setAttribute('data-role', 'enum');
          const emptyOption = document.createElement('option');
          emptyOption.value = '';
          emptyOption.textContent = '(select)';
          select.appendChild(emptyOption);
          for (const optionValue of enumValues) {
            const option = document.createElement('option');
            option.value = String(optionValue);
            option.textContent = String(optionValue);
            select.appendChild(option);
          }
          select.addEventListener('change', syncToolArgsFromSchemaForm);
          label.appendChild(select);
        } else {
          const isLong = typeof propertySchema?.description === 'string' && propertySchema.description.length > 80;
          const input = isLong ? document.createElement('textarea') : document.createElement('input');
          input.setAttribute('data-role', 'value');
          input.placeholder = propertySchema && propertySchema.default != null ? String(propertySchema.default) : '';
          if ((type === 'integer' || type === 'number') && input.tagName === 'INPUT') {
            input.type = 'number';
          } else if (type === 'array') {
            input.placeholder = 'comma,separated,values';
          }
          input.addEventListener('input', syncToolArgsFromSchemaForm);
          label.appendChild(input);
        }

        if (propertySchema && typeof propertySchema.description === 'string' && propertySchema.description.trim()) {
          const note = document.createElement('div');
          note.className = 'inline-note';
          note.textContent = propertySchema.description.trim();
          label.appendChild(note);
        }

        wrapper.appendChild(label);
        els.schemaFields.appendChild(wrapper);

        const cachedValue = schemaFormValues[schemaFieldKey(tool.name, propName)];
        const defaultValue = propertySchema && Object.prototype.hasOwnProperty.call(propertySchema, 'default') ? propertySchema.default : undefined;
        if (cachedValue !== undefined) {
          writeFormValueForProperty(wrapper, propertySchema, cachedValue);
        } else if (defaultValue !== undefined) {
          writeFormValueForProperty(wrapper, propertySchema, defaultValue);
        }
      }

      try {
        loadSchemaFormFromToolArgs(false);
      } catch {
        // ignore; manual JSON may be incomplete while user types
      }
    }

    function setToolsSchema(toolEntries) {
      toolsSchema = Array.isArray(toolEntries) ? toolEntries : [];
      els.schemaTool.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = toolsSchema.length ? '(select tool schema)' : '(schema unavailable)';
      els.schemaTool.appendChild(placeholder);
      for (const tool of toolsSchema) {
        const option = document.createElement('option');
        option.value = tool.name;
        option.textContent = tool.name;
        els.schemaTool.appendChild(option);
      }

      const preferred = els.toolName.value && toolsSchema.some((tool) => tool.name === els.toolName.value)
        ? els.toolName.value
        : (persisted.ui && persisted.ui.schemaTool && toolsSchema.some((tool) => tool.name === persisted.ui.schemaTool)
            ? persisted.ui.schemaTool
            : '');
      els.schemaTool.value = preferred;
      if (!els.schemaTool.value && els.toolPreset.value && toolsSchema.some((tool) => tool.name === els.toolPreset.value)) {
        els.schemaTool.value = els.toolPreset.value;
      }
      els.toolsSchemaStatus.textContent = toolsSchema.length ? (toolsSchema.length + ' tools loaded') : 'Schema unavailable';
      renderSchemaFieldsForSelectedTool();
      schedulePersistState();
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
    els.runTool.addEventListener('click', () => {
      vscode.postMessage({
        type: 'runTool',
        toolName: els.toolName.value.trim(),
        toolArgs: els.toolArgs.value
      });
    });
    els.toolPreset.addEventListener('change', () => {
      if (els.toolPreset.value) {
        els.toolName.value = els.toolPreset.value;
        if (Array.isArray(toolsSchema) && toolsSchema.some((tool) => tool.name === els.toolPreset.value)) {
          els.schemaTool.value = els.toolPreset.value;
          renderSchemaFieldsForSelectedTool();
        }
      }
      schedulePersistState();
    });
    els.toolName.addEventListener('input', () => {
      if (Array.isArray(toolsSchema) && toolsSchema.some((tool) => tool.name === els.toolName.value.trim())) {
        els.schemaTool.value = els.toolName.value.trim();
        renderSchemaFieldsForSelectedTool();
      }
      schedulePersistState();
    });
    els.schemaTool.addEventListener('change', () => {
      if (els.schemaTool.value) {
        els.toolName.value = els.schemaTool.value;
      }
      renderSchemaFieldsForSelectedTool();
      syncToolArgsFromSchemaForm();
      schedulePersistState();
    });
    els.applyFormToArgs.addEventListener('click', () => {
      syncToolArgsFromSchemaForm();
      setStatus('Schema helper synced form values to Tool Args JSON.');
    });
    els.loadArgsToForm.addEventListener('click', () => {
      loadSchemaFormFromToolArgs(true);
      setStatus('Schema helper loaded values from Tool Args JSON.');
    });
    els.toolArgs.addEventListener('blur', () => {
      loadSchemaFormFromToolArgs(false);
      schedulePersistState();
    });
    els.previewChanges.addEventListener('click', () => {
      vscode.postMessage({ type: 'previewChangeSetDiff' });
    });
    els.reviewApplyChanges.addEventListener('click', () => {
      vscode.postMessage({ type: 'reviewAndApplyChangeSet' });
    });
    els.applyChanges.addEventListener('click', () => {
      vscode.postMessage({ type: 'applyChangeSet' });
    });
    els.clearHistory.addEventListener('click', () => {
      history.length = 0;
      renderHistory();
      schedulePersistState();
    });
    [els.intent, els.env, els.target, els.prompt].forEach((el) => {
      el.addEventListener('input', schedulePersistState);
      el.addEventListener('change', schedulePersistState);
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
        if (state.defaultToolName) {
          els.toolName.value = state.defaultToolName;
        }
        if (state.defaultToolArgs) {
          els.toolArgs.value = state.defaultToolArgs;
        }
        const ui = persisted.ui && typeof persisted.ui === 'object' ? persisted.ui : {};
        if (!state.autoSend) {
          if (typeof ui.intent === 'string') els.intent.value = ui.intent;
          if (typeof ui.env === 'string') els.env.value = ui.env;
          if (typeof ui.target === 'string') els.target.value = ui.target;
          if (typeof ui.prompt === 'string') els.prompt.value = ui.prompt;
        }
        if (typeof ui.toolName === 'string') els.toolName.value = ui.toolName;
        if (typeof ui.toolPreset === 'string') els.toolPreset.value = ui.toolPreset;
        if (typeof ui.toolArgs === 'string') els.toolArgs.value = ui.toolArgs;
        if (state.autoSend && state.draftPrompt && !initialized) {
          initialized = true;
          submit();
          return;
        }
        initialized = true;
        schedulePersistState();
        return;
      }

      if (msg.type === 'toolsSchema') {
        setToolsSchema(msg.schema?.tools || []);
        setStatus('Tools schema loaded.');
        pushHistory('tool', 'Tools schema loaded', String((msg.schema?.tools || []).length) + ' tools');
        return;
      }

      if (msg.type === 'toolsSchemaError') {
        els.toolsSchemaStatus.textContent = 'Schema unavailable';
        setStatus('Failed to load /tools/schema: ' + (msg.error || 'Unknown error'), true);
        pushHistory('error', 'Tools schema error', msg.error || 'Unknown error');
        return;
      }

      if (msg.type === 'agentLoading') {
        els.resultTitle.textContent = 'Agent Response';
        setStatus('Sending request to ' + msg.endpoint + '...');
        pushHistory('agent', 'Sending chat request', msg.request?.intent || msg.request?.message || 'chat');
        return;
      }

      if (msg.type === 'toolLoading') {
        els.resultTitle.textContent = 'Tool Result';
        setStatus('Running tool ' + (msg.toolName || 'unknown') + '...');
        pushHistory('tool', 'Running tool', msg.toolName || 'unknown');
        return;
      }

      if (msg.type === 'agentError') {
        setStatus(msg.error || 'Unknown error', true);
        els.response.textContent = JSON.stringify(msg, null, 2);
        pushHistory('error', 'Error', msg.error || 'Unknown error');
        return;
      }

      if (msg.type === 'agentResponse') {
        els.resultTitle.textContent = 'Agent Response';
        setStatus('Agent response received.');
        const response = msg.response || {};
        renderChanges(response?.planner?.changeSet);
        els.response.textContent = JSON.stringify(response, null, 2);
        pushHistory('agent', 'Agent response', response?.planner?.plannerId || response?.intent?.resolvedIntent || 'chat');
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
        pushHistory('tool', 'Tool result', msg.toolName || 'tool');
        return;
      }

      if (msg.type === 'changesApplied') {
        setStatus(msg.message || 'ChangeSet applied.');
        pushHistory('changeset', 'ChangeSet applied', msg.message || '');
        return;
      }

      if (msg.type === 'changesetReviewCanceled') {
        setStatus(msg.message || 'ChangeSet review canceled.');
        pushHistory('changeset', 'ChangeSet review canceled', msg.message || '');
        return;
      }

      if (msg.type === 'changeSetPreviewed') {
        setStatus(msg.message || 'ChangeSet diff previewed.');
        pushHistory('changeset', 'ChangeSet diff previewed', msg.message || '');
        return;
      }
    });

    renderHistory();
    if (Array.isArray(toolsSchema) && toolsSchema.length > 0) {
      setToolsSchema(toolsSchema);
    } else {
      renderSchemaFieldsForSelectedTool();
    }
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

async function previewSingleChangeDiff(change: PantherEyesChangeSet['changes'][number], rootDir: string): Promise<void> {
  const normalizedRoot = path.resolve(rootDir);
  const targetPath = path.resolve(normalizedRoot, change.path);
  if (!targetPath.startsWith(normalizedRoot + path.sep) && targetPath !== normalizedRoot) {
    throw new Error(`Refusing to preview outside workspace root: ${change.path}`);
  }

  const targetUri = vscode.Uri.file(targetPath);
  const exists = await fileExists(targetUri);
  const languageHint = inferLanguageId(change);
  const leftDoc = exists
    ? await vscode.workspace.openTextDocument(targetUri)
    : await vscode.workspace.openTextDocument({
        language: languageHint,
        content: '',
      });
  const rightDoc = await vscode.workspace.openTextDocument({
    language: languageHint,
    content: change.content,
  });

  await vscode.commands.executeCommand(
    'vscode.diff',
    leftDoc.uri,
    rightDoc.uri,
    `PantherEyes Preview: ${String(change.kind).toUpperCase()} ${change.path}`,
    { preview: true },
  );
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function inferLanguageId(change: PantherEyesChangeSet['changes'][number]): string | undefined {
  if (change.language) {
    if (change.language === 'ts') return 'typescript';
    if (change.language === 'md') return 'markdown';
    if (change.language === 'json') return 'json';
    if (change.language === 'yaml' || change.language === 'yml') return 'yaml';
    return change.language;
  }

  const ext = path.extname(change.path).toLowerCase();
  if (ext === '.ts') return 'typescript';
  if (ext === '.js') return 'javascript';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return undefined;
}

function changeSetFingerprint(changeSet: PantherEyesChangeSet): string {
  const stable = {
    summary: changeSet.summary,
    changes: changeSet.changes.map((change) => ({
      kind: change.kind,
      path: change.path,
      reason: change.reason,
      contentLength: change.content.length,
    })),
  };
  return JSON.stringify(stable);
}
