import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { PantherEyesAgentRuntimeManager } from './services/agentRuntimeManager';
import { PantherEyesSecretStore } from './services/secretStore';

export function activate(context: vscode.ExtensionContext): void {
  const secretStore = new PantherEyesSecretStore(context);
  const agentRuntime = new PantherEyesAgentRuntimeManager(context);
  const disposables = registerCommands({ context, secretStore, agentRuntime });
  context.subscriptions.push(...disposables);
  context.subscriptions.push(agentRuntime);

  // Try to make first use frictionless by checking local agent health in the background.
  void agentRuntime.ensureAgentReady({ interactive: false, reason: 'activation' });
}

export function deactivate(): void {
  // no-op
}
