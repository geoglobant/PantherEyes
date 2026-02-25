import * as http from 'node:http';
import * as https from 'node:https';
import { URL } from 'node:url';
import type {
  PantherEyesChatRequest,
  PantherEyesChatResponse,
  PantherEyesToolCallResponse,
  PantherEyesToolDefinition,
} from '../types/agent';

export class PantherEyesAgentClientError extends Error {
  constructor(message: string, public readonly statusCode?: number, public readonly body?: string) {
    super(message);
    this.name = 'PantherEyesAgentClientError';
  }
}

export class PantherEyesAgentClient {
  constructor(private readonly endpoint: string) {}

  async chat(payload: PantherEyesChatRequest): Promise<PantherEyesChatResponse> {
    const response = await requestJson('POST', this.endpoint, payload);
    return response as PantherEyesChatResponse;
  }

  async listTools(): Promise<{ tools: PantherEyesToolDefinition[] }> {
    const response = await requestJson('GET', this.resolveToolsUrl('/tools/list'));
    return response as { tools: PantherEyesToolDefinition[] };
  }

  async getToolsSchema(): Promise<{
    schemaVersion: number;
    generatedAt: string;
    endpoints: { list: string; call: string; schema: string };
    tools: PantherEyesToolDefinition[];
  }> {
    const response = await requestJson('GET', this.resolveToolsUrl('/tools/schema'));
    return response as {
      schemaVersion: number;
      generatedAt: string;
      endpoints: { list: string; call: string; schema: string };
      tools: PantherEyesToolDefinition[];
    };
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<PantherEyesToolCallResponse> {
    const response = await requestJson('POST', this.resolveToolsUrl('/tools/call'), {
      name,
      arguments: args,
    });
    return response as PantherEyesToolCallResponse;
  }

  private resolveToolsUrl(pathname: '/tools/list' | '/tools/call' | '/tools/schema'): string {
    let url: URL;
    try {
      url = new URL(this.endpoint);
    } catch {
      throw new PantherEyesAgentClientError(`Invalid PantherEyes agent URL: ${this.endpoint}`);
    }
    url.pathname = pathname;
    url.search = '';
    return url.toString();
  }
}

function requestJson(method: 'GET' | 'POST', urlString: string, payload?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      reject(new PantherEyesAgentClientError(`Invalid PantherEyes agent URL: ${urlString}`));
      return;
    }

    const body = payload === undefined ? '' : JSON.stringify(payload);
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80,
        method,
        path: `${url.pathname}${url.search}`,
        headers:
          method === 'POST'
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
              }
            : undefined,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) < 200 || (res.statusCode ?? 500) >= 300) {
            reject(
              new PantherEyesAgentClientError(
                `Agent request failed (${res.statusCode ?? 'unknown'}).`,
                res.statusCode,
                text,
              ),
            );
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new PantherEyesAgentClientError('Agent response is not valid JSON.', res.statusCode, text));
          }
        });
      },
    );

    req.on('error', (error) => {
      reject(new PantherEyesAgentClientError(`Could not reach PantherEyes agent at ${urlString}: ${error.message}`));
    });

    if (method === 'POST') {
      req.write(body);
    }
    req.end();
  });
}
