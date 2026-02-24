import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { PantherEyesSecretStore } from './services/secretStore';

export function activate(context: vscode.ExtensionContext): void {
  const secretStore = new PantherEyesSecretStore(context);
  const disposables = registerCommands({ context, secretStore });
  context.subscriptions.push(...disposables);

  void vscode.window.showInformationMessage('PantherEyes extension activated. Use "PantherEyes: Ask Agent".');
}

export function deactivate(): void {
  // no-op
}
