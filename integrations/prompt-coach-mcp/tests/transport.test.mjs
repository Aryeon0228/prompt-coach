import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer, MAX_BODY_BYTES, VERSION } from '../server.mjs';

const SERVER_PATH = fileURLToPath(new URL('../server.mjs', import.meta.url));
const EXPECTED_TOOLS = ['assemble_prompt', 'get_image_coaching_guide', 'get_prompt_coaching_guide', 'open_prompt_coach', 'review_prompt_brief', 'show_prompt_coach', 'submit_prompt_coach_input'];
const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

function makeClient(name) {
  return new Client({ name, version: '1.0.0' }, { capabilities: {} });
}

function resultData(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.ok(result.structuredContent, 'successful tools expose structured results');
  const text = result.content.find((item) => item.type === 'text');
  assert.ok(text, 'successful tools expose readable text too');
  assert.deepEqual(JSON.parse(text.text), result.structuredContent);
  return result.structuredContent;
}

async function rejectsTool(client, name, args, pattern) {
  let result;
  try {
    result = await client.callTool({ name, arguments: args });
  } catch (error) {
    assert.match(String(error), pattern);
    return;
  }
  assert.equal(result.isError, true, 'invalid input must not produce a successful tool result');
  assert.match(JSON.stringify(result.content), pattern);
  assert.equal(result.structuredContent?.prompt, undefined);
}

async function startHttp(t, options) {
  const server = createHttpServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    const closed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  return new URL(`http://127.0.0.1:${server.address().port}/mcp`);
}

async function connectHttp(t, url, name, responses = []) {
  const client = makeClient(name);
  const transport = new StreamableHTTPClientTransport(url, {
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      responses.push({ method: init?.method ?? 'GET', status: response.status, type: response.headers.get('content-type'), cache: response.headers.get('cache-control') });
      return response;
    },
  });
  t.after(() => client.close());
  await client.connect(transport);
  return { client, transport };
}

function rawRequest(url, { method = 'POST', headers = JSON_HEADERS, body = '', chunks, pauseBetweenChunks = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method, headers }, (res) => {
      const received = [];
      res.on('data', (chunk) => received.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(received).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('test request timed out')));
    if (!chunks) {
      req.end(body);
      return;
    }
    void (async () => {
      for (const chunk of chunks) {
        if (!req.write(chunk)) await once(req, 'drain');
        if (pauseBetweenChunks) await delay(pauseBetweenChunks);
      }
      req.end();
    })().catch((error) => { req.destroy(error); });
  });
}

function toolMessage(name, args, id = 1) {
  return { jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } };
}

test('stdio SDK initializes, lists and executes tools, prompts and resources', { timeout: 15000 }, async (t) => {
  const client = makeClient('stdio-integration');
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_PATH, '--stdio'], stderr: 'pipe' });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal(client.getServerVersion().name, 'studio-penumbra-prompt-coach');
  assert.equal(client.getServerVersion().version, VERSION);
  assert.match(client.getInstructions(), /한 번에 질문 하나/);
  assert.match(client.getInstructions(), /open_prompt_coach/);
  assert.match(client.getInstructions(), /시작 메뉴나 갈림길을 제안하지 마세요/);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);
  assert.ok(tools.every(({ annotations }) => annotations?.readOnlyHint && !annotations.destructiveHint));

  const guide = resultData(await client.callTool({ name: 'get_prompt_coaching_guide', arguments: { medium: 'video' } }));
  assert.equal(guide.medium, 'video');
  assert.match(guide.focus.join(' '), /카메라/);
  const review = resultData(await client.callTool({ name: 'review_prompt_brief', arguments: { medium: 'image', idea: '보라빛 창가의 화분', subject: '화분 하나', deferred: ['style'] } }));
  assert.equal(review.reviewType, 'field_presence_only');
  assert.equal(review.checklist.find(({ field }) => field === 'subject').filled, true);
  assert.equal(review.candidates.some(({ field }) => field === 'style'), false);

  const final = resultData(await client.callTool({ name: 'assemble_prompt', arguments: { medium: 'image', idea: '처음에는 빨간 화분', confirmedScene: '최종적으로 파란 화분 하나', subject: '파란 화분 하나', userConfirmed: true } }));
  assert.match(final.prompt, /최종적으로 파란 화분 하나/);
  assert.equal(final.prompt.includes('처음에는 빨간 화분'), false);
  assert.equal(final.originalIdea, '처음에는 빨간 화분');

  const { prompts } = await client.listPrompts();
  assert.deepEqual(prompts.map(({ name }) => name), ['coach-scene', 'coach-image']);
  const prompt = await client.getPrompt({ name: 'coach-scene', arguments: {} });
  assert.match(prompt.messages[0].content.text, /② 3D 웹/);
  assert.match(prompt.messages[0].content.text, /get_prompt_coaching_guide/);
  const { resources } = await client.listResources();
  assert.ok(resources.every(({ uri }) => uri.startsWith('ui://prompt-coach/')), 'Only app display resources remain; no attachable help document');
  await assert.rejects(() => client.readResource({ uri: 'prompt-coach://rules' }), /not found/);
  assert.equal(stderr, '', 'stdio server keeps diagnostics and stdout protocol clean');
});

test('HTTP SDK supports stateless initialize, discovery and tool calls with JSON responses', { timeout: 15000 }, async (t) => {
  const url = await startHttp(t);
  const responses = [];
  const { client, transport } = await connectHttp(t, url, 'http-integration', responses);
  assert.equal(client.getServerVersion().name, 'studio-penumbra-prompt-coach');
  assert.equal(transport.sessionId, undefined, 'HTTP does not allocate shared server-side user sessions');
  assert.deepEqual((await client.listTools()).tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);
  const guide = resultData(await client.callTool({ name: 'get_prompt_coaching_guide', arguments: { medium: 'web' } }));
  assert.match(guide.focus.join(' '), /클릭·드래그/);
  const review = resultData(await client.callTool({ name: 'review_prompt_brief', arguments: { medium: 'web', idea: '회전하는 작품', details: '드래그로 회전' } }));
  assert.equal(review.checklist.find(({ field }) => field === 'details').filled, true);
  const successfulPosts = responses.filter(({ method, status }) => method === 'POST' && status === 200);
  assert.ok(successfulPosts.length >= 4, 'initialize, discovery and calls were round-tripped');
  assert.ok(successfulPosts.every(({ type }) => type?.startsWith('application/json')));
  assert.ok(successfulPosts.every(({ cache }) => cache === 'no-store'));
});

test('transport schemas reject bad media, unknown fields, oversized text and unconfirmed final assembly', { timeout: 15000 }, async (t) => {
  const url = await startHttp(t);
  const { client } = await connectHttp(t, url, 'validation-integration');
  await rejectsTool(client, 'get_prompt_coaching_guide', { medium: 'audio' }, /medium|Invalid|validation/i);
  await rejectsTool(client, 'review_prompt_brief', { medium: 'image', idea: ' ' }, /idea|장면|validation/i);
  await rejectsTool(client, 'review_prompt_brief', { medium: 'image', idea: '정원', inventedField: '숨긴 조건' }, /inventedField|unrecognized|validation/i);
  await rejectsTool(client, 'review_prompt_brief', { medium: 'image', idea: '정원', subject: 'x'.repeat(5001) }, /subject|5000|validation/i);
  await rejectsTool(client, 'review_prompt_brief', { medium: 'image', idea: '정원', deferred: ['idea'] }, /deferred|Invalid|validation/i);
  const brief = { medium: 'image', idea: '최초 아이디어', confirmedScene: '확정한 장면' };
  await rejectsTool(client, 'assemble_prompt', brief, /userConfirmed|true|validation/i);
  await rejectsTool(client, 'assemble_prompt', { ...brief, userConfirmed: false }, /userConfirmed|true|validation/i);
  await rejectsTool(client, 'assemble_prompt', { medium: 'image', idea: '최초 아이디어', userConfirmed: true }, /confirmedScene|validation/i);
  const accepted = resultData(await client.callTool({ name: 'assemble_prompt', arguments: { ...brief, userConfirmed: true } }));
  assert.match(accepted.prompt, /확정한 장면/);
});

test('two independent HTTP clients cannot inherit another user’s supplied text', { timeout: 15000 }, async (t) => {
  const url = await startHttp(t);
  const [{ client: first }, { client: second }] = await Promise.all([
    connectHttp(t, url, 'user-a'), connectHttp(t, url, 'user-b'),
  ]);
  const aMarker = '사용자A만의_보라색_비밀정원';
  const bMarker = '사용자B만의_노란색_우주선';
  const [a, b] = await Promise.all([
    first.callTool({ name: 'assemble_prompt', arguments: { medium: 'image', idea: aMarker, confirmedScene: aMarker, style: 'A의_전용_스타일', userConfirmed: true } }),
    second.callTool({ name: 'assemble_prompt', arguments: { medium: 'video', idea: bMarker, confirmedScene: bMarker, userConfirmed: true } }),
  ]);
  assert.match(resultData(a).prompt, new RegExp(aMarker));
  assert.match(resultData(b).prompt, new RegExp(bMarker));
  assert.equal(JSON.stringify(a).includes(bMarker), false);
  assert.equal(JSON.stringify(b).includes(aMarker), false);
  assert.equal(JSON.stringify(b).includes('A의_전용_스타일'), false);
  const clean = resultData(await first.callTool({ name: 'assemble_prompt', arguments: { medium: 'image', idea: '새 장면', confirmedScene: '새 장면', userConfirmed: true } }));
  assert.equal(JSON.stringify(clean).includes(aMarker), false, 'even the same client has no implicit stored conversation');
  assert.equal(JSON.stringify(clean).includes('A의_전용_스타일'), false);
});

test('HTTP rejects untrusted hosts and browser origins before serving requests', { timeout: 10000 }, async (t) => {
  const url = await startHttp(t);
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const badHost = await rawRequest(url, { body, headers: { ...JSON_HEADERS, Host: 'untrusted.example' } });
  assert.equal(badHost.status, 403);
  assert.match(badHost.text, /Host not allowed/);
  const badOrigin = await rawRequest(url, { body, headers: { ...JSON_HEADERS, Origin: 'https://untrusted.example' } });
  assert.equal(badOrigin.status, 403);
  const sameOrigin = await rawRequest(url, { body, headers: { ...JSON_HEADERS, Origin: url.origin } });
  assert.equal(sameOrigin.status, 403, 'no browser-origin access is advertised');
  assert.equal(sameOrigin.headers['access-control-allow-origin'], undefined);
  const health = await rawRequest(new URL('/health', url), { method: 'GET', headers: {} });
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.text).storesConversations, false);
  assert.equal(JSON.parse(health.text).modelApiCalls, false);
});

test('HTTP rejects malformed JSON, unsupported content and endpoint methods', { timeout: 10000 }, async (t) => {
  const url = await startHttp(t);
  const invalid = await rawRequest(url, { body: '{"jsonrpc":' });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.text).error.code, -32700);
  const wrongType = await rawRequest(url, { body: '{}', headers: { ...JSON_HEADERS, 'Content-Type': 'text/plain' } });
  assert.equal(wrongType.status, 415);
  const get = await rawRequest(url, { method: 'GET', headers: {} });
  assert.equal(get.status, 405);
  assert.equal(get.headers.allow, 'POST');
  const missing = await rawRequest(new URL('/not-an-endpoint', url), { method: 'GET', headers: {} });
  assert.equal(missing.status, 404);
});

test('HTTP enforces byte limits for both declared and chunked request bodies', { timeout: 10000 }, async (t) => {
  const url = await startHttp(t);
  const oversized = Buffer.alloc(MAX_BODY_BYTES + 1, 0x20);
  const declared = await rawRequest(url, { body: oversized, headers: { ...JSON_HEADERS, 'Content-Length': String(oversized.length) } });
  assert.equal(declared.status, 413);
  const streamed = await rawRequest(url, { chunks: [oversized.subarray(0, MAX_BODY_BYTES), oversized.subarray(MAX_BODY_BYTES)] });
  assert.equal(streamed.status, 413);
  assert.match(streamed.text, /too large/);
});

test('HTTP preserves Korean and emoji split across real UTF-8 network chunks', { timeout: 10000 }, async (t) => {
  const url = await startHttp(t);
  const original = '  첫 아이디어: 바닷속 🌊 도서관\n유리 창문  ';
  const confirmed = '  최종 장면: 보라빛 고래 🐋 한 마리\n글자는 “고래”만  ';
  const body = Buffer.from(JSON.stringify(toolMessage('assemble_prompt', { medium: 'image', idea: original, confirmedScene: confirmed, userConfirmed: true })));
  const koreanStart = body.indexOf(Buffer.from('첫'));
  const whaleStart = body.indexOf(Buffer.from('🐋'));
  assert.ok(koreanStart > 0 && whaleStart > koreanStart);
  const cuts = [0, koreanStart + 1, koreanStart + 2, whaleStart + 1, whaleStart + 2, whaleStart + 3, body.length];
  const chunks = cuts.slice(1).map((end, index) => body.subarray(cuts[index], end));
  const response = await rawRequest(url, { chunks, pauseBetweenChunks: 8 });
  assert.equal(response.status, 200, response.text);
  assert.match(response.headers['content-type'], /^application\/json/);
  const payload = JSON.parse(response.text);
  assert.equal(payload.id, 1);
  const output = resultData(payload.result);
  assert.equal(output.originalIdea, original);
  assert.ok(output.prompt.includes(confirmed), 'exact confirmed Unicode and whitespace survive chunk boundaries');
  assert.equal(response.text.includes('\uFFFD'), false, 'no replacement character from partial decoding');
});
