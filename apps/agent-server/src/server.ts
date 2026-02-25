import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { PantherEyesMcpToolHost } from './mcp/toolHost';
import { AgentRuntime } from './runtime';
import type { Logger } from './logging';
import type { ChatRequest } from './types';

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    throw new Error('Request body is empty');
  }

  return JSON.parse(raw) as T;
}

function isAgentTarget(value: unknown): value is 'web' | 'mobile' {
  return value === 'web' || value === 'mobile';
}

function assertChatRequest(payload: unknown): asserts payload is ChatRequest {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid payload: expected object');
  }

  const candidate = payload as Record<string, unknown>;
  if (typeof candidate.message !== 'string' || candidate.message.trim().length === 0) {
    throw new Error('Invalid payload: message is required');
  }

  if (candidate.intent !== undefined && typeof candidate.intent !== 'string') {
    throw new Error('Invalid payload: intent must be a string');
  }

  if (candidate.context !== undefined) {
    if (!candidate.context || typeof candidate.context !== 'object') {
      throw new Error('Invalid payload: context must be an object');
    }
    const ctx = candidate.context as Record<string, unknown>;
    if (ctx.env !== undefined && typeof ctx.env !== 'string') {
      throw new Error('Invalid payload: context.env must be a string');
    }
    if (ctx.rootDir !== undefined && typeof ctx.rootDir !== 'string') {
      throw new Error('Invalid payload: context.rootDir must be a string');
    }
    if (ctx.target !== undefined && !isAgentTarget(ctx.target)) {
      throw new Error('Invalid payload: context.target must be web or mobile');
    }
  }
}

export function createAgentHttpServer(runtime: AgentRuntime, logger: Logger): Server {
  const mcpToolHost = new PantherEyesMcpToolHost(logger.child({ component: 'http.tools' }));

  return createServer(async (req, res) => {
    const requestLogger = logger.child({ method: req.method, url: req.url });

    if (req.url === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, service: 'panthereyes-agent-server' });
      return;
    }

    if (req.url === '/chat') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed', allowed: ['POST'] });
        return;
      }

      try {
        const payload = await readJsonBody<unknown>(req);
        assertChatRequest(payload);
        requestLogger.info('http.chat.received', {
          message: payload.message,
          requestedIntent: payload.intent,
          context: payload.context,
        });

        const response = await runtime.handleChat(payload);
        sendJson(res, 200, response);
      } catch (error) {
        const err = error as Error;
        requestLogger.error('http.chat.error', { error: err });
        sendJson(res, 400, { error: err.message });
      }

      return;
    }

    if (req.url === '/tools/list') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed', allowed: ['GET'] });
        return;
      }

      try {
        sendJson(res, 200, { tools: mcpToolHost.listTools() });
      } catch (error) {
        const err = error as Error;
        requestLogger.error('http.tools.list.error', { error: err });
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (req.url === '/tools/schema') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'Method not allowed', allowed: ['GET'] });
        return;
      }

      try {
        const tools = mcpToolHost.listTools();
        sendJson(res, 200, {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          endpoints: {
            list: '/tools/list',
            call: '/tools/call',
            schema: '/tools/schema',
          },
          tools,
        });
      } catch (error) {
        const err = error as Error;
        requestLogger.error('http.tools.schema.error', { error: err });
        sendJson(res, 500, { error: err.message });
      }
      return;
    }

    if (req.url === '/tools/call') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Method not allowed', allowed: ['POST'] });
        return;
      }

      try {
        const payload = await readJsonBody<unknown>(req);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Invalid payload: expected object');
        }
        const body = payload as Record<string, unknown>;
        if (typeof body.name !== 'string' || body.name.trim() === '') {
          throw new Error('Invalid payload: name is required');
        }
        if (body.arguments !== undefined && (typeof body.arguments !== 'object' || body.arguments === null || Array.isArray(body.arguments))) {
          throw new Error('Invalid payload: arguments must be an object');
        }

        requestLogger.info('http.tools.call.received', {
          name: body.name,
        });

        const result = await mcpToolHost.callTool({
          name: body.name,
          arguments: body.arguments,
        });
        sendJson(res, 200, result);
      } catch (error) {
        const err = error as Error;
        requestLogger.error('http.tools.call.error', { error: err });
        sendJson(res, 400, { error: err.message });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });
}
