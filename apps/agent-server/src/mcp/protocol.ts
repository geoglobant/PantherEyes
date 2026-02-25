import type { JsonRpcFailure, JsonRpcRequest, JsonRpcResponse, JsonRpcSuccess } from './types';

interface ProtocolHandlers {
  onRequest: (message: JsonRpcRequest) => Promise<void> | void;
  onProtocolError?: (error: Error) => void;
  output?: {
    write: (chunk: Uint8Array | string) => unknown;
  };
}

export class StdioJsonRpcProtocol {
  private buffer = Buffer.alloc(0);

  constructor(private readonly handlers: ProtocolHandlers) {}

  attach(): void {
    process.stdin.on('data', (chunk) => {
      try {
        this.ingestChunk(chunk);
      } catch (error) {
        this.handlers.onProtocolError?.(error as Error);
      }
    });
  }

  ingestChunk(chunk: Buffer | string | Uint8Array): void {
    const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = Buffer.concat([this.buffer, next]);
    this.consumeBuffer();
  }

  async dispatchMessage(raw: unknown): Promise<void> {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid JSON-RPC payload: expected object');
    }

    const msg = raw as Record<string, unknown>;
    if (msg.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC payload: jsonrpc must be 2.0');
    }
    if (typeof msg.method !== 'string' || msg.method.trim() === '') {
      throw new Error('Invalid JSON-RPC payload: method is required');
    }

    await this.handlers.onRequest(msg as unknown as JsonRpcRequest);
  }

  writeResult(id: string | number | null, result: unknown): void {
    const payload: JsonRpcSuccess = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.writeMessage(payload);
  }

  writeError(id: string | number | null, code: number, message: string, data?: unknown): void {
    const payload: JsonRpcFailure = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.writeMessage(payload);
  }

  private writeMessage(payload: JsonRpcResponse): void {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    const output = this.handlers.output ?? process.stdout;
    output.write(Buffer.concat([header, body]));
  }

  private consumeBuffer(): void {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        return;
      }

      const headerText = this.buffer.subarray(0, headerEnd).toString('utf8');
      const contentLength = parseContentLength(headerText);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.buffer.length < messageEnd) {
        return;
      }

      const body = this.buffer.subarray(messageStart, messageEnd).toString('utf8');
      this.buffer = this.buffer.subarray(messageEnd);

      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch (error) {
        this.handlers.onProtocolError?.(new Error(`Invalid JSON body: ${(error as Error).message}`));
        continue;
      }

      void this.dispatchMessage(parsed).catch((error) => {
        this.handlers.onProtocolError?.(error as Error);
      });
    }
  }
}

export function parseContentLength(headerText: string): number {
  const lines = headerText.split('\r\n');
  for (const line of lines) {
    const [name, value] = line.split(':', 2);
    if (name?.toLowerCase() === 'content-length') {
      const parsed = Number(value?.trim());
      if (!Number.isFinite(parsed) || parsed < 0) {
        break;
      }
      return parsed;
    }
  }
  throw new Error('Missing or invalid Content-Length header');
}
