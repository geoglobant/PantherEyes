import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import * as vscode from 'vscode';
import { getAgentServerUrl, getConfiguredAutoStartLocalAgent, getPrimaryWorkspacePath } from '../util/workspace';

type AgentRuntimeStatus = 'idle' | 'starting' | 'online' | 'offline' | 'error';

interface EnsureOptions {
  reason?: string;
  interactive?: boolean;
}

export class PantherEyesAgentRuntimeManager implements vscode.Disposable {
  private child: cp.ChildProcess | undefined;
  private startupPromise: Promise<boolean> | undefined;
  private status: AgentRuntimeStatus = 'idle';
  private lastError: string | undefined;
  private readonly output = vscode.window.createOutputChannel('PantherEyes Agent');
  private readonly statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  private readonly statusEmitter = new vscode.EventEmitter<AgentRuntimeStatus>();
  private readonly configWatcher: vscode.Disposable;

  readonly onDidChangeStatus = this.statusEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBar.command = 'panthereyes.agentStatus';
    this.statusBar.name = 'PantherEyes Agent Status';
    this.statusBar.show();
    this.updateStatusBar();

    this.configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('panthereyes.agentServerUrl') || event.affectsConfiguration('panthereyes.autoStartLocalAgent')) {
        this.updateStatusBar();
      }
    });
  }

  getStatus(): AgentRuntimeStatus {
    return this.status;
  }

  getStatusSummary(): string {
    const endpoint = getAgentServerUrl();
    const suffix = this.lastError ? ` (${this.lastError})` : '';
    return `${this.status.toUpperCase()} -> ${endpoint}${suffix}`;
  }

  async ensureAgentReady(options: EnsureOptions = {}): Promise<boolean> {
    const endpoint = getAgentServerUrl();
    if (await this.isHealthy(endpoint)) {
      this.setStatus('online');
      return true;
    }

    this.setStatus('offline', 'Agent not reachable');

    if (!getConfiguredAutoStartLocalAgent()) {
      if (options.interactive !== false) {
        void vscode.window.showWarningMessage('PantherEyes agent is offline and auto-start is disabled. Start it manually or enable auto-start.');
      }
      return false;
    }

    if (!isLocalhostAgentEndpoint(endpoint)) {
      if (options.interactive !== false) {
        void vscode.window.showWarningMessage('PantherEyes auto-start only supports localhost endpoints. Update panthereyes.agentServerUrl or start the remote agent manually.');
      }
      return false;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    this.startupPromise = this.startLocalAgent(options)
      .catch((error) => {
        this.setStatus('error', error instanceof Error ? error.message : String(error));
        if (options.interactive !== false) {
          void vscode.window.showErrorMessage(`Failed to start PantherEyes agent: ${this.lastError ?? 'unknown error'}`);
        }
        return false;
      })
      .finally(() => {
        this.startupPromise = undefined;
      });

    return this.startupPromise;
  }

  async restartAgent(interactive = true): Promise<boolean> {
    this.stopAgent();
    return this.ensureAgentReady({ interactive, reason: 'restart' });
  }

  async showStatusActions(): Promise<void> {
    const pick = await vscode.window.showQuickPick(
      [
        { label: 'Check Agent Health', value: 'check', detail: this.getStatusSummary() },
        { label: 'Restart Local Agent', value: 'restart', detail: 'Stops local child process and starts it again (localhost only).' },
        { label: 'Show Agent Logs', value: 'logs', detail: 'Opens PantherEyes Agent output channel.' },
      ],
      {
        title: 'PantherEyes Agent',
        placeHolder: this.getStatusSummary(),
      },
    );

    if (!pick) {
      return;
    }

    if (pick.value === 'logs') {
      this.output.show(true);
      return;
    }

    if (pick.value === 'check') {
      const ok = await this.ensureAgentReady({ interactive: false, reason: 'status-check' });
      if (ok) {
        void vscode.window.showInformationMessage(`PantherEyes agent is online at ${getAgentServerUrl()}.`);
      } else {
        void vscode.window.showWarningMessage(`PantherEyes agent is offline. ${getConfiguredAutoStartLocalAgent() ? 'Auto-start attempted.' : 'Auto-start is disabled.'}`);
      }
      return;
    }

    if (pick.value === 'restart') {
      await this.restartAgent(true);
    }
  }

  dispose(): void {
    this.configWatcher.dispose();
    this.stopAgent();
    this.statusBar.dispose();
    this.output.dispose();
    this.statusEmitter.dispose();
  }

  private async startLocalAgent(options: EnsureOptions): Promise<boolean> {
    const endpoint = getAgentServerUrl();
    const healthUrl = toHealthUrl(endpoint);
    const workspacePath = getPrimaryWorkspacePath();

    if (!workspacePath) {
      throw new Error('Open the PantherEyes workspace root to auto-start the local agent.');
    }

    if (!looksLikePantherEyesRepo(workspacePath)) {
      throw new Error('Workspace does not look like the PantherEyes monorepo (missing apps/agent-server).');
    }

    this.output.appendLine(`[PantherEyes] Starting local agent (${options.reason ?? 'on-demand'}) in ${workspacePath}`);
    this.output.appendLine(`[PantherEyes] Endpoint: ${endpoint}`);
    this.setStatus('starting');

    const hasBuiltAgent = fs.existsSync(`${workspacePath}/apps/agent-server/dist/index.js`);
    const command = hasBuiltAgent
      ? {
          executable: process.execPath,
          args: ['apps/agent-server/dist/index.js'],
          shell: false,
          label: `node apps/agent-server/dist/index.js (PORT=${new URL(endpoint).port || '4711'})`,
        }
      : {
          executable: 'corepack',
          args: ['pnpm', 'agent:up'],
          shell: false,
          label: 'corepack pnpm agent:up',
        };

    const env = { ...process.env, PORT: String(new URL(endpoint).port || 4711) };
    const child = cp.spawn(command.executable, command.args, {
      cwd: workspacePath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: command.shell,
    });

    this.child = child;
    this.output.appendLine(`[PantherEyes] Spawned: ${command.label}`);

    child.stdout?.on('data', (chunk) => {
      this.output.append(chunk.toString());
    });
    child.stderr?.on('data', (chunk) => {
      this.output.append(chunk.toString());
    });

    child.on('error', (error) => {
      this.output.appendLine(`[PantherEyes] Process error: ${error.message}`);
      this.setStatus('error', error.message);
    });

    child.on('exit', (code, signal) => {
      this.output.appendLine(`[PantherEyes] Agent process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`);
      this.child = undefined;
      if (this.status !== 'online') {
        this.setStatus('error', `Process exited before healthcheck (${code ?? signal ?? 'unknown'})`);
      } else {
        this.setStatus('offline', `Process exited (${code ?? signal ?? 'unknown'})`);
      }
    });

    const ready = await waitForHealth(healthUrl, 30_000, 500);
    if (!ready) {
      this.output.appendLine(`[PantherEyes] Healthcheck timed out: ${healthUrl}`);
      this.setStatus('error', 'Agent startup timed out');
      return false;
    }

    this.output.appendLine(`[PantherEyes] Agent online: ${healthUrl}`);
    this.setStatus('online');
    return true;
  }

  private stopAgent(): void {
    if (!this.child) {
      return;
    }
    try {
      this.output.appendLine('[PantherEyes] Stopping local agent process');
      this.child.kill();
    } catch (error) {
      this.output.appendLine(`[PantherEyes] Failed to stop process: ${(error as Error).message}`);
    } finally {
      this.child = undefined;
    }
  }

  private async isHealthy(endpoint: string): Promise<boolean> {
    try {
      const result = await getJson(toHealthUrl(endpoint));
      return Boolean(result && typeof result === 'object' && (result as Record<string, unknown>).ok === true);
    } catch {
      return false;
    }
  }

  private setStatus(next: AgentRuntimeStatus, errorMessage?: string): void {
    this.status = next;
    this.lastError = errorMessage;
    this.updateStatusBar();
    this.statusEmitter.fire(next);
  }

  private updateStatusBar(): void {
    const endpoint = getAgentServerUrl();
    const icon =
      this.status === 'online'
        ? 'check'
        : this.status === 'starting'
          ? 'sync~spin'
          : this.status === 'error'
            ? 'warning'
            : 'circle-slash';
    const label =
      this.status === 'online'
        ? 'Connected'
        : this.status === 'starting'
          ? 'Starting'
          : this.status === 'error'
            ? 'Error'
            : 'Offline';

    this.statusBar.text = `$(shield) PantherEyes: $(${icon}) ${label}`;
    this.statusBar.tooltip = new vscode.MarkdownString(
      [
        `**PantherEyes Agent**`,
        ``,
        `Status: \`${this.status}\``,
        `Endpoint: \`${endpoint}\``,
        `Auto-start local agent: \`${getConfiguredAutoStartLocalAgent()}\``,
        this.lastError ? `Last error: \`${this.lastError}\`` : '',
        '',
        `Click for actions (healthcheck, restart, logs).`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
}

function isLocalhostAgentEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

function toHealthUrl(endpoint: string): string {
  const url = new URL(endpoint);
  url.pathname = '/health';
  url.search = '';
  return url.toString();
}

function looksLikePantherEyesRepo(rootDir: string): boolean {
  return fs.existsSync(`${rootDir}/apps/agent-server`) && fs.existsSync(`${rootDir}/package.json`);
}

async function waitForHealth(healthUrl: string, timeoutMs: number, intervalMs: number): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const payload = await getJson(healthUrl);
      if (payload && typeof payload === 'object' && (payload as Record<string, unknown>).ok === true) {
        return true;
      }
    } catch {
      // ignore until timeout
    }
    await delay(intervalMs);
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(urlString: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
            reject(new Error(`HTTP ${res.statusCode ?? 500}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON'));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}
