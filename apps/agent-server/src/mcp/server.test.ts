import assert from 'node:assert/strict';
import test from 'node:test';
import { createMcpLogger } from './logger';
import { PantherEyesMcpServer } from './server';

class FakeProtocol {
  public readonly writes: Array<
    | { kind: 'result'; id: string | number | null; result: unknown }
    | { kind: 'error'; id: string | number | null; code: number; message: string; data?: unknown }
  > = [];

  attach(): void {
    // no-op for tests
  }

  writeResult(id: string | number | null, result: unknown): void {
    this.writes.push({ kind: 'result', id, result });
  }

  writeError(id: string | number | null, code: number, message: string, data?: unknown): void {
    this.writes.push({ kind: 'error', id, code, message, data });
  }
}

test('mcp server initialize returns capabilities', async () => {
  const protocol = new FakeProtocol();
  const server = new PantherEyesMcpServer(createMcpLogger({ test: 'mcp-server-init' }), { protocol });

  await server.dispatchRequestForTest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {},
  });

  assert.equal(protocol.writes.length, 1);
  const write = protocol.writes[0];
  assert.equal(write?.kind, 'result');
  assert.equal(write?.id, 1);
  const result = (write as { kind: 'result'; result: { serverInfo: { name: string } } }).result;
  assert.equal(result.serverInfo.name, 'panthereyes-agent-mcp');
});

test('mcp server tools/list returns PantherEyes tools', async () => {
  const protocol = new FakeProtocol();
  const server = new PantherEyesMcpServer(createMcpLogger({ test: 'mcp-server-tools-list' }), { protocol });

  await server.dispatchRequestForTest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  const write = protocol.writes[0];
  assert.equal(write?.kind, 'result');
  const result = (write as { kind: 'result'; result: { tools: Array<{ name: string }> } }).result;
  assert.equal(result.tools.some((tool) => tool.name === 'panthereyes.scan'), true);
  assert.equal(result.tools.some((tool) => tool.name === 'panthereyes.create_policy_exception'), true);
});

test('mcp server returns invalid params error for malformed tools/call', async () => {
  const protocol = new FakeProtocol();
  const server = new PantherEyesMcpServer(createMcpLogger({ test: 'mcp-server-invalid-params' }), { protocol });

  await server.dispatchRequestForTest({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { arguments: {} },
  });

  const write = protocol.writes[0];
  assert.equal(write?.kind, 'error');
  const errorWrite = write as { kind: 'error'; code: number; message: string };
  assert.equal(errorWrite.code, -32602);
  assert.match(errorWrite.message, /tools\/call\.params\.name/);
});

test('mcp server returns method not found for unknown method', async () => {
  const protocol = new FakeProtocol();
  const server = new PantherEyesMcpServer(createMcpLogger({ test: 'mcp-server-method-not-found' }), { protocol });

  await server.dispatchRequestForTest({
    jsonrpc: '2.0',
    id: 4,
    method: 'unknown/method',
    params: {},
  });

  const write = protocol.writes[0];
  assert.equal(write?.kind, 'error');
  const errorWrite = write as { kind: 'error'; code: number; message: string };
  assert.equal(errorWrite.code, -32601);
  assert.match(errorWrite.message, /Method not found/);
});

