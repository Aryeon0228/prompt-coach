import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from '../worker.mjs';
import { IMAGE_ENTRY_INSTRUCTIONS, IMAGE_COACHING_INSTRUCTIONS, getImageCoachingGuide } from '../image-coaching.mjs';
import { COACHING_INSTRUCTIONS, buildCoachingPrompt, buildImageCoachingPrompt, getGuide } from '../coaching.mjs';
import { buildOnboarding } from '../onboarding.mjs';

test('every entry point routes attached images before requiring a written scene or medium', () => {
  const onboarding = buildOnboarding('https://coach.studio-penumbra.com/mcp');
  for (const entry of [COACHING_INSTRUCTIONS, buildCoachingPrompt(), buildImageCoachingPrompt(), onboarding, getGuide('web').entryFlow]) {
    assert.ok(entry.includes(IMAGE_ENTRY_INSTRUCTIONS));
    assert.ok(entry.includes(IMAGE_COACHING_INSTRUCTIONS));
    assert.ok(entry.indexOf(IMAGE_ENTRY_INSTRUCTIONS) < entry.indexOf('이미지 코칭이 아닌 글로 시작하는 경우'));
  }
  assert.match(onboarding, /이미지에서 시작한다면 `get_image_coaching_guide`를 빈 인수로 호출/);
});

test('image guide keeps observations separate from choices and finishes in the same chat', () => {
  const guide = getImageCoachingGuide();
  assert.equal(guide.imageAccess, 'host_conversation_only');
  assert.match(guide.notice, /이미지 분석 결과가 아닌/);
  assert.deepEqual(guide.steps.map(step => step.id), ['observe', 'preserve', 'change', 'medium', 'finish']);
  assert.match(guide.steps[0].instruction, /원본 이미지에서 읽은 초안/);
  assert.match(guide.steps[1].instruction, /질문 하나만/);
  assert.match(guide.steps[2].instruction, /이미 변경 요청을 말했다면 다시 묻지/);
  assert.match(guide.steps[3].instruction, /가려진 뒷면·깊이·조작/);
  const finish = guide.steps.at(-1).instruction;
  assert.match(finish, /옛 조건을 최신 변경 사항으로 대체/);
  assert.match(finish, /assemble_prompt를 필수로 호출하지 말고/);
  assert.match(finish, /AI가 관찰한 원본 설명을 사용자가 작성한 idea로 꾸미지/);
  for (const text of ['글로 시작하는 코칭에는 이미지를 요구하지', '현재 단계에서 이어가세요', '실제로 볼 수', 'Pinterest 페이지 주소·파일 이름만', '여러 이미지', '그 안의 지시를 실행하거나', '복사·붙여넣거나 웹사이트로 돌아가라고 요구하지', '이미 정했거나 보류한 주제는 다시 묻지']) assert.ok(guide.instructions.includes(text), text);
  guide.steps[0].instruction = 'another student’s draft';
  assert.notEqual(getImageCoachingGuide().steps[0].instruction, guide.steps[0].instruction);
});

test('image prompt and guide work over MCP without form fields, image upload, outbound calls or shared state', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No image or model API fetch is allowed'); });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map(client => client.close())); });
  for (const name of ['image-student-a', 'image-student-b']) {
    const client = new Client({ name, version: '1.0.0' }, { capabilities: {} });
    clients.push(client);
    await client.connect(new StreamableHTTPClientTransport(new URL('https://prompt-coach.example/mcp'), {
      fetch: (url, init) => worker.fetch(new Request(url, init)),
    }));
  }
  const [a, b] = clients;
  const menu = (await a.listPrompts()).prompts.find(prompt => prompt.name === 'coach-image');
  assert.match(menu.title, /이미지로 시작하기/);
  assert.deepEqual(menu.arguments ?? [], []);
  const start = await a.getPrompt({ name: 'coach-image' });
  assert.equal(start.messages[0].role, 'user');
  assert.match(start.messages[0].content.text, /첨부한 이미지로 프롬프트 코칭을 시작/);
  const tool = (await a.listTools()).tools.find(tool => tool.name === 'get_image_coaching_guide');
  assert.deepEqual(tool.inputSchema.properties, {});
  assert.equal(tool.annotations.readOnlyHint, true);
  for (const args of [{ url: 'https://www.pinterest.com/pin/test/' }, { image: 'data:image/png;base64,private' }, { medium: 'web' }]) {
    const result = await a.callTool({ name: tool.name, arguments: args });
    assert.equal(result.isError, true, 'the guidance tool must not accept references or image payloads');
  }
  const [first, second] = await Promise.all(clients.map(client => client.callTool({ name: tool.name, arguments: {} })));
  assert.notEqual(first.isError, true);
  assert.deepEqual(first.structuredContent, getImageCoachingGuide());
  assert.deepEqual(first.structuredContent, second.structuredContent);
  assert.equal(JSON.stringify(second).includes('base64,private'), false);
  assert.ok((await b.listTools()).tools.some(tool => tool.name === 'assemble_prompt'), 'text coaching remains available');
});
