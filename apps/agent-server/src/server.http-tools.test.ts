import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createLogger } from './logging';
import { AgentRuntime } from './runtime';
import { createAgentHttpServer } from './server';

async function startEphemeralServer() {
  const logger = createLogger({ test: 'http-tools-bridge' });
  const runtime = new AgentRuntime(logger);
  const server = createAgentHttpServer(runtime, logger);

  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
  } catch (error) {
    server.close();
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Unable to resolve ephemeral server address');
  }

  return { server, port: address.port };
}

async function httpJson<T>(port: number, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ statusCode: number; json: T }> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers:
          payload === undefined
            ? undefined
            : {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(payload),
              },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            resolve({
              statusCode: res.statusCode ?? 0,
              json: JSON.parse(raw) as T,
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

test('http tools bridge lists MCP tools', async (t) => {
  let started: Awaited<ReturnType<typeof startEphemeralServer>>;
  try {
    started = await startEphemeralServer();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      t.skip(`Local socket bind blocked in this environment: ${err.code}`);
      return;
    }
    throw error;
  }

  try {
    const response = await httpJson<{ tools: Array<{ name: string }> }>(started.port, 'GET', '/tools/list');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.tools.some((tool) => tool.name === 'panthereyes.scan_gate'), true);
    assert.equal(response.json.tools.some((tool) => tool.name === 'panthereyes.create_policy_exception'), true);
  } finally {
    started.server.close();
  }
});

test('http tools bridge exposes schema snapshot', async (t) => {
  let started: Awaited<ReturnType<typeof startEphemeralServer>>;
  try {
    started = await startEphemeralServer();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      t.skip(`Local socket bind blocked in this environment: ${err.code}`);
      return;
    }
    throw error;
  }

  try {
    const response = await httpJson<{
      schemaVersion: number;
      endpoints: { schema: string; list: string; call: string };
      tools: Array<{ name: string }>;
    }>(started.port, 'GET', '/tools/schema');
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.schemaVersion, 1);
    assert.equal(response.json.endpoints.schema, '/tools/schema');
    assert.equal(response.json.tools.some((tool) => tool.name === 'panthereyes.scan_gate_report'), true);
  } finally {
    started.server.close();
  }
});

test('http tools bridge can call scan_gate tool', async (t) => {
  let started: Awaited<ReturnType<typeof startEphemeralServer>>;
  try {
    started = await startEphemeralServer();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      t.skip(`Local socket bind blocked in this environment: ${err.code}`);
      return;
    }
    throw error;
  }

  try {
    const response = await httpJson<{
      structuredContent: { reportType: string; gate: { shouldFail: boolean } };
    }>(started.port, 'POST', '/tools/call', {
      name: 'panthereyes.scan_gate',
      arguments: {
        rootDir: 'samples/ios-panthereyes-demo',
        target: 'mobile',
        phase: 'static',
        failOn: ['block'],
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json.structuredContent.reportType, 'panthereyes.scan_gate');
    assert.equal(typeof response.json.structuredContent.gate.shouldFail, 'boolean');
  } finally {
    started.server.close();
  }
});

test('http tools bridge validates payload shape', async (t) => {
  let started: Awaited<ReturnType<typeof startEphemeralServer>>;
  try {
    started = await startEphemeralServer();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EACCES') {
      t.skip(`Local socket bind blocked in this environment: ${err.code}`);
      return;
    }
    throw error;
  }

  try {
    const response = await httpJson<{ error: string }>(started.port, 'POST', '/tools/call', {
      arguments: {},
    });
    assert.equal(response.statusCode, 400);
    assert.match(response.json.error, /name is required/);
  } finally {
    started.server.close();
  }
});
