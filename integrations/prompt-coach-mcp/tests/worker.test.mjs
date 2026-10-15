import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import worker, { handleRequest } from '../worker.mjs'
import { MAX_BODY_BYTES, VERSION } from '../mcp-core.mjs'
import { COACH_UI_URI } from '../coach-session.mjs'

const endpoint = new URL('https://prompt-coach.example/mcp')
const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }
const toolMessage = (name, args, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
const request = (body, options = {}) => new Request(endpoint, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body), ...options })

async function connect(t, name = 'worker-integration', responses = []) {
  const client = new Client({ name, version: '1.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch: async (input, init) => {
      const response = await worker.fetch(new Request(input, init))
      responses.push({ method: init?.method ?? 'GET', status: response.status, headers: new Headers(response.headers) })
      return response
    },
  })
  t.after(() => client.close())
  await client.connect(transport)
  return { client, transport }
}

function data(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result.content))
  assert.deepEqual(JSON.parse(result.content.find(part => part.type === 'text').text), result.structuredContent)
  return result.structuredContent
}

test('Workers handler completes the actual SDK initialize, tools, prompts and resources flow', async t => {
  const responses = []
  const { client, transport } = await connect(t, 'worker-discovery', responses)
  assert.equal(client.getServerVersion().version, VERSION)
  assert.equal(transport.sessionId, undefined)
  assert.match(client.getInstructions(), /한 번에 질문 하나/)
  const tools = (await client.listTools()).tools
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['assemble_prompt', 'get_prompt_coaching_guide', 'open_prompt_coach', 'review_prompt_brief', 'show_prompt_coach', 'submit_prompt_coach_input'])
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint))
  for (const medium of ['image', 'video', 'web']) {
    assert.equal(data(await client.callTool({ name: 'get_prompt_coaching_guide', arguments: { medium } })).medium, medium)
  }
  const review = data(await client.callTool({ name: 'review_prompt_brief', arguments: { medium: 'image', idea: '고요한 정원', deferred: ['style'] } }))
  assert.equal(review.reviewType, 'field_presence_only')
  assert.equal(review.candidates.some(item => item.field === 'style'), false)
  const final = data(await client.callTool({ name: 'assemble_prompt', arguments: { medium: 'image', idea: '처음 빨간 꽃', confirmedScene: '나중에 확정한 파란 꽃', userConfirmed: true } }))
  assert.match(final.prompt, /나중에 확정한 파란 꽃/)
  assert.equal(final.prompt.includes('처음 빨간 꽃'), false)
  assert.equal(final.originalIdea, '처음 빨간 꽃')
  assert.deepEqual((await client.listPrompts()).prompts.map(prompt => prompt.name), ['coach-scene'])
  const prompt = await client.getPrompt({ name: 'coach-scene', arguments: {} })
  assert.match(prompt.messages[0].content.text, /① 2D 이미지/)
  assert.deepEqual((await client.listResources()).resources.map(resource => resource.uri), [COACH_UI_URI])
  const successfulPosts = responses.filter(response => response.method === 'POST' && response.status === 200)
  assert.ok(successfulPosts.length >= 10)
  assert.ok(successfulPosts.every(response => response.headers.get('Content-Type').startsWith('application/json')))
  assert.ok(responses.every(response => response.headers.get('Cache-Control') === 'no-store'))
  assert.ok(responses.every(response => !response.headers.has('Mcp-Session-Id')))
})

test('Workers uses the same validation rules, including explicit final-scene confirmation', async t => {
  const { client } = await connect(t, 'worker-validation')
  for (const [name, args, pattern] of [
    ['get_prompt_coaching_guide', { medium: 'audio' }, /medium|Invalid|validation/i],
    ['review_prompt_brief', { medium: 'image', idea: ' ' }, /장면|idea|validation/i],
    ['review_prompt_brief', { medium: 'image', idea: '정원', unwanted: true }, /unwanted|unrecognized|validation/i],
    ['review_prompt_brief', { medium: 'image', idea: '정원', subject: 'x'.repeat(5001) }, /5000|subject|validation/i],
    ['assemble_prompt', { medium: 'image', idea: '정원', confirmedScene: '정원' }, /userConfirmed|validation/i],
    ['assemble_prompt', { medium: 'image', idea: '정원', userConfirmed: true }, /confirmedScene|validation/i],
  ]) {
    const result = await client.callTool({ name, arguments: args })
    assert.equal(result.isError, true)
    assert.match(JSON.stringify(result.content), pattern)
    assert.equal(result.structuredContent?.prompt, undefined)
  }
})

test('Workers exposes a short service page and health; rejects unsupported requests without CORS', async () => {
  for (const path of ['/', '/health']) {
    const response = await handleRequest(new Request(new URL(path, endpoint)))
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.modelApiCalls, false)
    assert.equal(body.storesConversations, false)
  }
  const cases = [
    [new Request(endpoint), 405],
    [new Request(endpoint, { method: 'DELETE' }), 405],
    [new Request(endpoint, { method: 'OPTIONS' }), 405],
    [new Request(new URL('/unknown', endpoint)), 404],
    [request('{}', { headers: { ...headers, Origin: 'https://student.example' } }), 403],
    [request('{}', { headers: { ...headers, Origin: 'null' } }), 403],
    [request('{}', { headers: { 'Content-Type': 'text/plain' } }), 415],
    [request('{'), 400],
    [request('{}', { headers: { ...headers, 'Content-Length': String(MAX_BODY_BYTES + 1) } }), 413],
  ]
  for (const [req, expected] of cases) {
    const response = await handleRequest(req)
    assert.equal(response.status, expected)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    if (expected === 405) assert.equal(response.headers.get('Allow'), 'POST')
  }
})

test('Workers stops an oversized chunked body even when Content-Length understates its size', async () => {
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream({
    pull(controller) {
      pulls += 1
      controller.enqueue(new Uint8Array(1024).fill(32))
    },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  const response = await handleRequest(new Request(endpoint, {
    method: 'POST', headers: { ...headers, 'Content-Length': '1' }, body: stream, duplex: 'half',
  }))
  assert.equal(response.status, 413)
  assert.equal(cancelled, true)
  assert.equal(pulls, MAX_BODY_BYTES / 1024 + 1)
})

test('Workers permits exactly 96 KiB and preserves split UTF-8 input', async () => {
  const prefix = '{"jsonrpc":"2.0","id":1,"method":"ping","params":{"padding":"'
  const suffix = '"}}'
  const exact = prefix + 'x'.repeat(MAX_BODY_BYTES - prefix.length - suffix.length) + suffix
  assert.equal(new TextEncoder().encode(exact).byteLength, MAX_BODY_BYTES)
  assert.equal((await handleRequest(request(exact))).status, 200)

  const scene = '보라빛 정원 🌷\n회전하는 행성'
  const bytes = new TextEncoder().encode(JSON.stringify(toolMessage('assemble_prompt', { medium: 'web', idea: scene, confirmedScene: scene, userConfirmed: true })))
  let position = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (position === bytes.length) return controller.close()
      controller.enqueue(bytes.slice(position, ++position))
    },
  })
  const response = await handleRequest(new Request(endpoint, { method: 'POST', headers, body: stream, duplex: 'half' }))
  assert.equal(response.status, 200)
  const result = data((await response.json()).result)
  assert.equal(result.originalIdea, scene)
  assert.ok(result.prompt.includes(scene))
})

test('Workers rejects unreadable streams and invalid UTF-8 without echoing user input', async () => {
  const broken = new ReadableStream({ pull(controller) { controller.error(new Error('private student text')) } })
  const brokenResponse = await handleRequest(new Request(endpoint, { method: 'POST', headers, body: broken, duplex: 'half' }))
  assert.equal(brokenResponse.status, 400)
  assert.equal((await brokenResponse.text()).includes('private student text'), false)
  const response = await handleRequest(new Request(endpoint, { method: 'POST', headers, body: new Uint8Array([123, 34, 255, 34, 125]) }))
  assert.equal(response.status, 400)
})

test('independent clients cannot inherit text and do not make outbound AI or storage calls', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected outbound network call') })
  const forbiddenBindings = new Proxy({}, { get() { throw new Error('Unexpected storage or secret binding access') } })
  const health = await worker.fetch(new Request(new URL('/health', endpoint)), forbiddenBindings)
  assert.equal(health.status, 200)
  const [{ client: a }, { client: b }] = await Promise.all([connect(t, 'student-a'), connect(t, 'student-b')])
  const [first, second] = await Promise.all([
    a.callTool({ name: 'assemble_prompt', arguments: { medium: 'image', idea: 'A학생의_비밀정원', confirmedScene: 'A학생의_비밀정원', style: 'A학생의_흑백사진', userConfirmed: true } }),
    b.callTool({ name: 'assemble_prompt', arguments: { medium: 'video', idea: 'B학생의_우주선', confirmedScene: 'B학생의_우주선', userConfirmed: true } }),
  ])
  assert.equal(JSON.stringify(data(first)).includes('B학생의_우주선'), false)
  assert.equal(JSON.stringify(data(second)).includes('A학생의'), false)
  assert.equal(data(second).prompt.includes('[분위기와 표현]'), false)
})

test('MCP Apps discovery and real tool transitions expose an offline UI and preserve user confirmation', async t => {
  const { client } = await connect(t, 'app-integration');
  assert.deepEqual(client.getServerCapabilities().extensions['io.modelcontextprotocol/ui'].mimeTypes, ['text/html;profile=mcp-app']);
  const opened = await client.callTool({ name: 'open_prompt_coach', arguments: {} });
  assert.equal(opened._meta.ui.resourceUri, COACH_UI_URI);
  const tools = (await client.listTools()).tools;
  const find = name => tools.find(x => x.name === name);
  assert.equal(find('open_prompt_coach')._meta.ui.resourceUri, COACH_UI_URI);
  assert.deepEqual(find('submit_prompt_coach_input')._meta.ui.visibility, ['app']);
  assert.equal(find('submit_prompt_coach_input')._meta.ui.resourceUri, undefined);
  assert.deepEqual(find('show_prompt_coach')._meta.ui.visibility, ['model']);
  const resource = (await client.readResource({ uri: COACH_UI_URI })).contents[0];
  assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
  assert.match(COACH_UI_URI, /^ui:\/\/prompt-coach\/coach-[a-f0-9]{16}\.html$/);
  assert.equal(COACH_UI_URI, `ui://prompt-coach/coach-${createHash('sha256').update(resource.text).digest('hex').slice(0, 16)}.html`);
  assert.match(resource.text, /<main id="app">/);
  assert.match(resource.text, /<script type="module">/);
  assert.doesNotMatch(resource.text, /<script[^>]+src=/);
  assert.deepEqual(resource._meta.ui.csp.connectDomains, []);
  const legacy = (await client.readResource({ uri: 'ui://prompt-coach/coach-v1.html' })).contents[0];
  assert.equal(legacy.uri, 'ui://prompt-coach/coach-v1.html');
  assert.equal(legacy.text, resource.text);
  assert.equal(legacy.mimeType, resource.mimeType);
  const menu = (await client.listPrompts()).prompts.find(x => x.name === 'coach-scene');
  assert.match(menu.title, /코칭 시작하기/);
  assert.deepEqual(menu.arguments ?? [], [], 'starter has no fields to fill in');
  assert.deepEqual((await client.listResources()).resources.map(resource => resource.uri), [COACH_UI_URI]);
  let current = data(await client.callTool({ name: 'open_prompt_coach', arguments: {} }));
  assert.equal(current.coach.medium, null);
  current = data(await client.callTool({ name: 'submit_prompt_coach_input', arguments: { state: current.state, action: 'start', medium: 'image', idea: '꽃과 유리구' } }));
  current = data(await client.callTool({ name: 'show_prompt_coach', arguments: { state: current.state, kind: 'question', question: '시선의 중심은?', why: '중심을 정해요.' } }));
  current = data(await client.callTool({ name: 'submit_prompt_coach_input', arguments: { state: current.state, action: 'review' } }));
  current = data(await client.callTool({ name: 'show_prompt_coach', arguments: { state: current.state, kind: 'review', prompt: '꽃과 유리구' } }));
  assert.equal(current.coach.finalPrompt, null);
  current = data(await client.callTool({ name: 'submit_prompt_coach_input', arguments: { state: current.state, action: 'confirm', prompt: '사용자가 수정한 꽃과 유리구' } }));
  assert.equal(current.coach.finalPrompt, '사용자가 수정한 꽃과 유리구');
  assert.equal(current.hostRequest, undefined);
});

test('previous UI hashes resolve current HTML without listing aliases or accepting arbitrary paths', async t => {
  const { client } = await connect(t, 'ui-resource-compatibility');
  const listed = (await client.listResources()).resources.filter(resource => resource.uri.startsWith('ui://'));
  assert.deepEqual(listed.map(resource => resource.uri), [COACH_UI_URI]);
  const current = (await client.readResource({ uri: COACH_UI_URI })).contents[0];
  for (const uri of ['ui://prompt-coach/coach-v1.html', 'ui://prompt-coach/coach-0123456789abcdef.html', 'ui://prompt-coach/coach-a79b5aa3e6157e80.html']) {
    const previous = (await client.readResource({ uri })).contents[0];
    assert.equal(previous.uri, uri);
    assert.equal(previous.text, current.text);
    assert.equal(previous.mimeType, current.mimeType);
    assert.deepEqual(previous._meta, current._meta);
  }
  for (const uri of [
    'ui://prompt-coach/coach-short.html',
    'ui://prompt-coach/coach-0123456789abcdef0.html',
    'ui://prompt-coach/coach-0123456789abcdeg.html',
    'ui://prompt-coach/coach-0123456789ABCDEF.html',
    'ui://prompt-coach/coach-%30123456789abcdef.html',
    'ui://prompt-coach/coach-0123456789abcdef.html?extra=1',
    'ui://prompt-coach/coach-0123456789abcdef.html/extra',
    'ui://another-coach/coach-0123456789abcdef.html',
  ]) {
    await assert.rejects(client.readResource({ uri }), error => error.code === -32602);
  }
});


test('connector menus offer coaching start without an attachable rules document or hidden help template', async t => {
  const { client } = await connect(t, 'coaching-start-menu');
  const prompts = (await client.listPrompts()).prompts;
  assert.deepEqual(prompts.map(prompt => prompt.name), ['coach-scene']);
  assert.deepEqual(prompts[0].arguments ?? [], [], 'no Medium or Idea form is advertised');
  const start = await client.getPrompt({ name: 'coach-scene', arguments: {} });
  assert.match(start.messages[0].content.text, /① 2D 이미지/);
  assert.match(start.messages[0].content.text, /② 3D 웹/);
  assert.match(start.messages[0].content.text, /이미 정한 내용은 다시 입력하거나 선택하게 하지 마세요/);
  assert.match(start.messages[0].content.text, /시작 메뉴나 갈림길을 제안하지 마세요/);
  const resources = (await client.listResources()).resources;
  assert.deepEqual(resources.map(resource => resource.uri), [COACH_UI_URI]);
  const templates = (await client.listResourceTemplates()).resourceTemplates;
  assert.ok(templates.every(template => template.uriTemplate.startsWith('ui://prompt-coach/')));
  assert.equal(JSON.stringify([...resources, ...templates]).includes('coaching-rules'), false);
  await assert.rejects(() => client.readResource({ uri: 'prompt-coach://rules' }), /not found/);
});
