import type { Logger } from '../logging';
import { StdioJsonRpcProtocol } from './protocol';
import { PantherEyesMcpToolHost } from './toolHost';
import type { JsonRpcRequest } from './types';

const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;

export class PantherEyesMcpServer {
  private readonly tools: PantherEyesMcpToolHost;
  private readonly protocol: StdioJsonRpcProtocol;

  constructor(private readonly logger: Logger) {
    this.tools = new PantherEyesMcpToolHost(logger.child({ component: 'mcp.tools' }));
    this.protocol = new StdioJsonRpcProtocol({
      onRequest: (message) => this.handleRequest(message),
      onProtocolError: (error) => this.logger.error('mcp.protocol.error', { error }),
    });
  }

  start(): void {
    this.logger.info('mcp.server.start', { transport: 'stdio' });
    this.protocol.attach();
    process.stdin.resume();
  }

  private async handleRequest(message: JsonRpcRequest): Promise<void> {
    const reqLogger = this.logger.child({ method: message.method, id: message.id ?? null });
    reqLogger.debug('mcp.request.received');

    if (message.method === 'notifications/initialized') {
      return;
    }

    if (message.id === undefined) {
      reqLogger.debug('mcp.notification.ignored');
      return;
    }

    try {
      switch (message.method) {
        case 'initialize':
          this.protocol.writeResult(message.id, {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: 'panthereyes-agent-mcp',
              version: '0.1.0',
            },
          });
          return;

        case 'ping':
          this.protocol.writeResult(message.id, {});
          return;

        case 'tools/list':
          this.protocol.writeResult(message.id, {
            tools: this.tools.listTools(),
          });
          return;

        case 'tools/call': {
          const params = asRecord(message.params, 'tools/call.params');
          const name = params.name;
          if (typeof name !== 'string' || name.trim() === '') {
            throw invalidParams('tools/call.params.name must be a non-empty string');
          }
          const result = await this.tools.callTool({
            name,
            arguments: params.arguments,
          });
          this.protocol.writeResult(message.id, result);
          return;
        }

        default:
          this.protocol.writeError(message.id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${message.method}`);
          return;
      }
    } catch (error) {
      const err = error as Error;
      reqLogger.error('mcp.request.error', { error: err });
      if (err.name === 'McpInvalidParamsError') {
        this.protocol.writeError(message.id, JSON_RPC_INVALID_PARAMS, err.message);
        return;
      }
      this.protocol.writeError(message.id, JSON_RPC_INTERNAL_ERROR, err.message);
    }
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidParams(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function invalidParams(message: string): Error {
  const error = new Error(message);
  error.name = 'McpInvalidParamsError';
  return error;
}
