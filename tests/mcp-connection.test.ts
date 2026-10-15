import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMcpSetup, buildMcpStarter, loadCoachConnection, parseCoachConnectionConfig, validateMcpEndpoint } from '../src/lib/mcp-connection.ts'
import { buildCoachingRequest, coachingSource, createPromptCoaching } from '../src/lib/coach-handoff.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { createGuidedSession } from '../src/lib/coach-conversation.ts'
import { coachingContext } from '../src/lib/coaching-context.ts'
import type { Project } from '../src/types.ts'

const endpoint = 'https://prompt-coach.studio-penumbra.com/mcp'
const hosted = { endpoint, availability: 'hosted', updatedAt: '2026-10-15T12:00:00.000Z' }
const missing = { endpoint: null, availability: 'unavailable', updatedAt: null }

test('accepts public HTTPS DNS endpoint syntax and normalizes host case without a network request', () => {
  for (const url of [endpoint, 'https://prompt-coach.worker-account.workers.dev/mcp', 'https://quiet-river.trycloudflare.com/mcp']) {
    assert.equal(validateMcpEndpoint(url), url)
  }
  assert.equal(validateMcpEndpoint('HTTPS://PROMPT-COACH.STUDIO-PENUMBRA.COM/mcp'), endpoint)
})

const unsafeEndpoints: unknown[] = [
  null, 42, {}, '', ` ${endpoint}`, `${endpoint}\n`,
  'http://prompt-coach.studio-penumbra.com/mcp', 'https://localhost/mcp', 'https://localhost.example.com/mcp',
  'https://127.0.0.1/mcp', 'https://[::1]/mcp', 'https://10.0.0.1/mcp', 'https://2130706433/mcp',
  'https://coach.local/mcp', 'https://coach.internal/mcp', 'https://coach.test/mcp', 'https://coach.invalid/mcp',
  'https://coach.home.arpa/mcp', 'https://coach.localtest.me/mcp', 'https://127-0-0-1.sslip.io/mcp',
  'https://127.0.0.1.nip.io/mcp', 'https://local.lvh.me/mcp', 'https://coach/mcp',
  'https://user:secret@prompt-coach.studio-penumbra.com/mcp', 'https://prompt-coach.studio-penumbra.com:443/mcp',
  `${endpoint}?token=secret`, `${endpoint}#run`, `${endpoint}/`, 'https://prompt-coach.studio-penumbra.com/other', 'https://prompt-coach.studio-penumbra.com/MCP',
  'https://prompt-coach.studio-penumbra.com/mcp;echo owned', 'https://$(whoami).studio-penumbra.com/mcp',
  'https://`whoami`.studio-penumbra.com/mcp', "https://coach.studio-penumbra.com/mcp' && echo bad",
  'https://coach.studio-penumbra.com\\@localhost/mcp', 'https://coach.studio-penumbra.com/%6dcp',
  'https://-coach.studio-penumbra.com/mcp', 'https://coach-.studio-penumbra.com/mcp',
  'https://coach..studio-penumbra.com/mcp', 'https://coach.studio-penumbra.com./mcp',
  'https://한글.studio-penumbra.com/mcp', `https://${'a'.repeat(64)}.studio-penumbra.com/mcp`,
]

test('rejects local, malformed, credential-bearing and command-injection URLs in both config and setup output', () => {
  for (const url of unsafeEndpoints) {
    assert.throws(() => validateMcpEndpoint(url), `validate: ${String(url)}`)
    assert.equal(parseCoachConnectionConfig({ ...hosted, endpoint: url }), null, `config: ${String(url)}`)
    assert.throws(() => buildMcpSetup(url as string), `setup: ${String(url)}`)
  }
})

test('configuration is strict data and never silently treats unavailable or invalid data as online', () => {
  assert.deepEqual(parseCoachConnectionConfig(hosted), hosted)
  assert.deepEqual(parseCoachConnectionConfig({ ...hosted, availability: 'temporary', updatedAt: null }), { ...hosted, availability: 'temporary', updatedAt: null })
  assert.deepEqual(parseCoachConnectionConfig(missing), missing)
  for (const invalid of [
    null, [], '', true, {}, new Date(), Object.create(hosted),
    { ...hosted, endpoint: null }, { ...hosted, availability: 'connected' },
    { ...hosted, availability: 'unavailable' }, { ...hosted, execute: 'curl attacker' },
    { ...hosted, [Symbol('command')]: 'install' },
    { endpoint, availability: 'hosted' },
    ...[undefined, 1, 'today', '2026-02-30T12:00:00Z', '2026-10-15T25:00:00Z', '2026-10-15'].map((updatedAt) => ({ ...hosted, updatedAt })),
    JSON.parse('{"endpoint":"https://prompt-coach.studio-penumbra.com/mcp","availability":"hosted","updatedAt":null,"__proto__":{"install":true}}'),
  ]) assert.equal(parseCoachConnectionConfig(invalid), null)
})

test('loads only the site config with no-store; a valid URL does not trigger a server health or account check', async (t) => {
  const calls: Array<{ url: unknown; options: RequestInit | undefined }> = []
  t.mock.method(globalThis, 'fetch', async (url: unknown, options?: RequestInit) => {
    calls.push({ url, options })
    return new Response(JSON.stringify(hosted), { status: 200 })
  })
  assert.deepEqual(await loadCoachConnection(), hosted)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/coach-connection.json')
  assert.equal(calls[0].options?.cache, 'no-store')
  assert.equal(calls[0].options?.credentials, 'omit')
  assert.equal(calls[0].options?.redirect, 'error')
  assert.ok(calls[0].options?.signal instanceof AbortSignal)
})

test('network errors, bad responses and oversized untrusted configuration fail closed to unavailable', async (t) => {
  for (const response of [
    () => Promise.reject(new Error('offline')),
    () => Promise.resolve(new Response(JSON.stringify(hosted), { status: 503 })),
    () => Promise.resolve(new Response('<html>not a config</html>')),
    () => Promise.resolve(new Response(' '.repeat(4097))),
    () => Promise.resolve(new Response(JSON.stringify({ ...hosted, endpoint: 'https://localhost/mcp' }))),
  ]) {
    const mocked = t.mock.method(globalThis, 'fetch', response)
    assert.deepEqual(await loadCoachConnection(), missing)
    mocked.mock.restore()
  }
})

test('MCP coaching wraps the request verbatim and explicitly supports unconnected AI conversation', () => {
  const idea = '  안개 속 도서관\n창에는 고래 한 마리  '
  const original = `원문\n${idea}\n\n[보류]\n색감은 아직 정하지 않았어요.\n  `
  for (const medium of ['image', 'video', 'web'] as const) {
    const starter = buildMcpStarter({ medium, idea, requestText: original })
    assert.ok(starter.endsWith(original))
    assert.ok(starter.includes(`medium="${medium}"`))
    for (const instruction of ['get_prompt_coaching_guide', 'review_prompt_brief', '입력 유무만', 'deferred', '질문 하나', '필요한 이유', 'confirmedScene', 'userConfirmed: true', '도구가 없거나 호출에 실패하면', '연결이나 도구 호출이 성공했다고 꾸미지', '설정 변경을 허용하는 요청이 아닙니다']) {
      assert.ok(starter.includes(instruction), instruction)
    }
  }
  assert.equal(buildMcpStarter({ medium: 'image', idea: ' ', requestText: original }), '')
  assert.equal(buildMcpStarter({ medium: 'image', idea, requestText: '' }), '')
  assert.throws(() => buildMcpStarter({ medium: 'audio' as 'image', idea, requestText: original }))
})

test('a scene handoff starts with a meaningful coaching question rather than setup choices', () => {
  const request = buildCoachingRequest(createFreeBrief('작은 고래가 떠 있는 정원'), [], [])
  const starter = buildMcpStarter({ medium: 'image', idea: '작은 고래가 떠 있는 정원', requestText: request })
  assert.ok(starter.endsWith(request))
  for (const instruction of [
    '연결 설정문이 아니라 웹에서 작성한 장면을 전달하는 코칭 요청문',
    '코칭을 시작할지 다시 묻거나 메뉴를 제시하지',
    '첫 질문 하나와 그 이유로 바로 시작',
    '“완성한 프롬프트 가져오기”에 붙여 넣도록',
    '웹과 AI 대화가 자동 동기화되거나',
  ]) assert.ok(starter.includes(instruction), instruction)
  assert.equal(starter.includes('claude mcp add'), false)
  assert.equal(starter.includes('codex mcp add'), false)
})

test('MCP wrapping preserves saved and deferred answers without exposing drafts, images or changing snapshots', () => {
  const brief = createFreeBrief('조용한 서재', 'web')
  const project: Project = { id: 'mcp', name: '서재', templateId: 'free-scene', createdAt: 1, updatedAt: 1, freeform: brief, references: [], locks: [], decisions: {}, iterations: [] }
  const session = createGuidedSession(brief, coachingSource(brief, [], []))
  session.answers.purpose = { status: 'answered', text: '  포트폴리오 표지 체험  ' }
  session.answers.style = { status: 'deferred', text: '' }
  session.drafts.style = '아직 보내지 않은 색'
  project.promptCoaching = { ...createPromptCoaching(), session }
  const before = structuredClone(project)
  const context = coachingContext(project)
  const request = buildCoachingRequest(context.brief, project.references, project.locks, context.session)
  const starter = buildMcpStarter({ medium: context.brief.mode, idea: context.brief.idea, requestText: request })
  assert.ok(starter.includes(session.answers.purpose.text))
  assert.ok(starter.includes('[사용자가 보류한 주제]\n- 분위기와 표현'))
  assert.equal(starter.includes(session.drafts.style), false)
  assert.deepEqual(project, before)
  assert.equal(coachingContext(project).source, context.source)
})

test('oversized ideas, fields and UTF-8 requests remain verbatim with instructions to skip tools instead of truncating', () => {
  const cases = [
    { idea: '가'.repeat(10_001), field: '기존 조건 유지' },
    { idea: '작은 정원', field: '나'.repeat(5_001) },
    { idea: '바닷속 도서관', field: '🌊한글'.repeat(12_000) },
  ]
  for (const { idea, field } of cases) {
    const original = `[만들고 싶은 장면]\n${idea}\n\n[구체적인 조건]\n  ${field}\n마지막 조건도 그대로 보존  `
    const starter = buildMcpStarter({ medium: 'image', idea, requestText: original })
    assert.ok(starter.endsWith(original))
    assert.equal(starter.slice(-original.length), original)
    for (const instruction of ['10,000자', '5,000자', 'UTF-16 코드 단위', 'UTF-8 96 KiB(98,304바이트)', '원문을 자르거나 자동 요약해 넣지 말고', '해당 도구를 생략', '일반 대화로 코칭을 계속', '요약문을 확인받으세요', '최초 idea를 그대로 보존해 전달할 수 없는 경우']) {
      assert.ok(starter.includes(instruction), instruction)
    }
  }
  assert.ok(new TextEncoder().encode(cases[2].field).length > 98_304)
})

test('desktop setup uses literal validated URLs and checks existing registration plus actual tool availability', () => {
  const text = buildMcpSetup(endpoint)
  assert.ok(text.includes(`claude mcp add --transport http --scope user prompt-coach '${endpoint}'`))
  assert.ok(text.includes(`codex mcp add prompt-coach --url '${endpoint}'`))
  for (const instruction of ['이미 등록되어 있다면', '조회 오류를 모두 미등록으로 해석하지', '자동 삭제하거나 덮어쓰지', '등록 완료와 도구 호출 성공을 구분', 'API 키를 만들 필요가 없습니다', '실행했다고 말하지', 'No sign in', 'No authentication']) {
    assert.ok(text.includes(instruction), instruction)
  }
  assert.equal(text.includes('curl '), false)
  assert.equal(text.includes('mcp login'), false)
  assert.ok(text.includes('전체 JSON 요청의 UTF-8 바이트 한도'))
  assert.ok(text.includes('원문을 자르지 말고 해당 정리 도구를 생략'))
})

test('setup returns users without a scene to the web, reports only verified connection status, and offers no coaching menu', () => {
  const text = buildMcpSetup(endpoint)
  for (const instruction of [
    '이것은 연결 설정문',
    '실제로 확인한 수준인 등록 확인·도구 목록 확인·실제 호출 성공까지만',
    '호출하지 않았다면 호출 성공이라고 말하지',
    '장면이 아직 없다면 이 대화에서 새 장면을 받으려 하지 말고',
    '장면은 있지만 결과물 종류만 빠졌다면',
    '이미 적은 장면을 웹에 다시 쓰게 하지',
    '다음 한 가지 단계로 마무리',
    'https://studio-penumbra.com/prompt-coach/#scene',
    '코칭 세션 시작·규칙 자체 검토·도구 둘러보기 같은 메뉴나 불필요한 선택지를 먼저 덧붙이지',
    '사용자가 따로 규칙 검토 등을 명시적으로 요청하면 그 요청에는 답하세요',
    '가짜 장면을 만들지도',
    '모두 이미 있으면',
    '즉시 장면 코칭을 진행',
    '코칭을 시작할지 다시 묻지 말고 첫 질문 하나와 그 이유',
    '웹에서 장면 작성 → 내 AI에서 질문·답변 → 웹에 완성본 가져오기',
    '웹사이트와 AI 대화는 자동으로 동기화되지',
    '웹 안에서 AI가 직접 질문한다고 말하지',
  ]) assert.ok(text.includes(instruction), instruction)
  assert.equal(text.includes('빠진 정보만 한 번에 물어보고'), false)
})
