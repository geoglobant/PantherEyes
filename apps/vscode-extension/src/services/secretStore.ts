import * as vscode from 'vscode';

export type LlmProvider = 'none' | 'openai' | 'claude';

const PROVIDER_KEY = 'panthereyes.llmProvider';
const SECRET_KEYS: Record<Exclude<LlmProvider, 'none'>, string> = {
  openai: 'panthereyes.openai.apiKey',
  claude: 'panthereyes.claude.apiKey',
};

export class PantherEyesSecretStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getProvider(): LlmProvider {
    return this.context.globalState.get<LlmProvider>(PROVIDER_KEY, 'none');
  }

  async setProvider(provider: LlmProvider): Promise<void> {
    await this.context.globalState.update(PROVIDER_KEY, provider);
  }

  async storeApiKey(provider: Exclude<LlmProvider, 'none'>, apiKey: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEYS[provider], apiKey);
  }

  async getApiKey(provider: Exclude<LlmProvider, 'none'>): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEYS[provider]);
  }

  async deleteApiKey(provider: Exclude<LlmProvider, 'none'>): Promise<void> {
    await this.context.secrets.delete(SECRET_KEYS[provider]);
  }
}
