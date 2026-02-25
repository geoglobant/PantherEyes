import assert from 'node:assert/strict';
import test from 'node:test';
import { parseContentLength, StdioJsonRpcProtocol } from './protocol';
import type { JsonRpcRequest } from './types';

test('parseContentLength parses valid header', () => {
  assert.equal(parseContentLength('Content-Length: 42\r\nX-Test: ok'), 42);
});

test('parseContentLength throws for invalid header', () => {
  assert.throws(() => parseContentLength('X-Test: ok'), /Content-Length/);
});

test('protocol ingests split framed message and dispatches request', async () => {
  const requests: JsonRpcRequest[] = [];
  const protocol = new StdioJsonRpcProtocol({
    onRequest: async (request) => {
      requests.push(request);
    },
    onProtocolError: (error) => {
      throw error;
    },
    output: { write: () => true },
  });

  const body = Buffer.from(
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ping',
      params: {},
    }),
    'utf8',
  );
  const frame = Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8'), body]);

  protocol.ingestChunk(frame.subarray(0, 10));
  protocol.ingestChunk(frame.subarray(10));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, 'ping');
});

test('protocol writeResult emits framed JSON-RPC response', () => {
  const writes: Buffer[] = [];
  const protocol = new StdioJsonRpcProtocol({
    onRequest: () => undefined,
    output: {
      write: (chunk) => {
        writes.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
    },
  });

  protocol.writeResult(1, { ok: true });

  assert.equal(writes.length, 1);
  const payload = writes[0].toString('utf8');
  assert.match(payload, /^Content-Length: \d+\r\n\r\n/);
  assert.match(payload, /"jsonrpc":"2\.0"/);
  assert.match(payload, /"result":\{"ok":true\}/);
});

