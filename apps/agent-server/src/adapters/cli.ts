export interface CliCommandPreview {
  command: string[];
  description: string;
}

export interface CliAdapter {
  previewScanCommand(input: { env: string; target: 'web' | 'mobile'; rootDir: string }): CliCommandPreview;
}

export class PantherEyesCliAdapter implements CliAdapter {
  previewScanCommand(input: { env: string; target: 'web' | 'mobile'; rootDir: string }): CliCommandPreview {
    return {
      command: ['cargo', 'run', '-p', 'panthereyes-cli', '--', 'scan', '--target', input.target, input.rootDir],
      description: `Preview command for ${input.target} scan in env ${input.env}`,
    };
  }
}
