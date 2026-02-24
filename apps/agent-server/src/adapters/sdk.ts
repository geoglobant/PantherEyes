import { PantherEyesClient } from '@panthereyes/sdk-ts';

export interface SdkAdapter {
  scoreDemoFinding(target: 'web' | 'mobile'): {
    score: number;
    status: 'pass' | 'warn' | 'fail';
  };
}

export class PantherEyesSdkAdapter implements SdkAdapter {
  private readonly client = new PantherEyesClient({ appName: 'agent-server' });

  scoreDemoFinding(target: 'web' | 'mobile') {
    const result = this.client.evaluate({
      target,
      findings: [],
    });

    return {
      score: result.score,
      status: result.status,
    };
  }
}
