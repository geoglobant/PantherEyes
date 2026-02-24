import * as vscode from 'vscode';

export function getPrimaryWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.workspaceFolders?.[0];
}

export function getPrimaryWorkspacePath(): string | undefined {
  return getPrimaryWorkspaceFolder()?.uri.fsPath;
}

export function getConfiguredTarget(): 'web' | 'mobile' {
  const value = vscode.workspace.getConfiguration('panthereyes').get<string>('defaultTarget', 'web');
  return value === 'mobile' ? 'mobile' : 'web';
}

export function getConfiguredEnv(): string {
  return vscode.workspace.getConfiguration('panthereyes').get<string>('defaultEnv', 'dev');
}

export function getAgentServerUrl(): string {
  return vscode.workspace
    .getConfiguration('panthereyes')
    .get<string>('agentServerUrl', 'http://localhost:4711/chat');
}
