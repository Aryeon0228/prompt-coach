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
    '웹에서 이미 작성한 장면을 가져가는 선택적 코칭 요청문',
    '다시 입력하게 하거나 코칭 시작 여부를 묻지',
    'open_prompt_coach',
    '화면을 실제로 열지 못했다면 열렸다고 말하지',
    '일반 AI 대화에서 첫 질문 하나와 그 이유로 바로 시작',
    '웹에 별도로 보관하고 싶은 경우에만',
    '프롬프트 → 완성한 프롬프트 가져오기',
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

test('setup prioritizes chat coaching while UI compatibility is unresolved and keeps screen trials explicit', () => {
  const text = buildMcpSetup(endpoint)
  for (const instruction of [
    '이것은 연결 설정문',
    '실제로 확인한 수준인 등록 확인·도구 목록 확인·실제 호출 성공까지만',
    '호출하지 않았다면 호출 성공이라고 말하지',
    '현재 도구 목록에서 open_prompt_coach를 찾고',
    '사용자가 시험 중인 화면을 명시적으로 요청할 때만',
    '사용할 수 있으면 실제 호출해 화면 열기를 시도하세요',
    'Claude에서 화면 표시 오류가 확인되었고 ChatGPT 화면은 아직 검증하지 못했습니다',
    '화면이 보이지 않으면 이 대화에서 코칭 시작해줘',
    '연결 설정문은 처음 한 번만 사용하며 질문마다 복사할 필요가 없습니다',
    '장면과 매체가 이미 대화에 있으면',
    '아직 없는 값은 임의로 정하지 말고 비워 두세요',
    '웹으로 돌아가 복사해 오라고 요구하지',
    '코치 화면 안에서 장면 입력 → 필요한 질문과 이유 확인 → 답변 → 최종 프롬프트 확인',
    '도구 호출이 성공해도 화면이 렌더링됐다고 단정하지',
    '일반 AI 대화로 코칭을 이어가세요',
    '코칭 시작하기 — 장면 입력·질문·답변',
    '사용 안내는 홈페이지 도움말에서 확인합니다',
    '사용자가 따로 규칙 검토 등을 명시적으로 요청하면',
    '홈페이지에 저장한 프로젝트는 자동으로 가져오거나 덮어쓰지',
    'AI 서비스 안에 열리는 화면',
    '외부 프롬프트 코치 홈페이지 안의 직접 AI 대화는 승인 후 연동을 준비',
    '완성본을 웹에 보관하는 것은 선택',
  ]) assert.ok(text.includes(instruction), instruction)
  assert.equal(text.includes('https://studio-penumbra.com/prompt-coach/#scene'), false)
  assert.equal(text.includes('get_prompt_coaching_guide를 해당 medium으로 실제 호출한 뒤에만'), false)
  assert.equal(text.includes('prompt-coach://rules'), false)
})

test('setup starts with Korean result choices and a normal chat field without re-asking supplied scene details', () => {
  const text = buildMcpSetup(endpoint)
  for (const instruction of [
    '결과물 종류가 없을 때만',
    '① 2D 이미지 — 한 장의 그림·3D 제작 전 참고 이미지',
    '② 3D 웹 — 회전·클릭하며 살펴보는 장면',
    '번호·한국어 이름·자유로운 설명 모두 답으로',
    'web·image·video 값을 입력하라고 요구하지',
    '평소 쓰는 채팅 입력칸에 한국어로 자유롭게',
    '이미 알려 준 종류나 장면은 다시 묻지',
    '확정 조건·답변·보류를 그대로 이어받으세요',
    '영상은 사용자가 원할 때',
    '인수 없이 시작하는 요청',
    '메뉴에서 추가한 뒤 메시지를 보내면',
    '예전 Medium·Idea 입력칸이 보인다면 연결 목록을 새로 고치고',
  ]) assert.ok(text.includes(instruction), instruction)

  const starter = buildMcpStarter({ medium: 'web', idea: '유리구 안의 섬', requestText: '이미 정한 장면과 조건' })
  assert.ok(starter.includes('장면과 결과물 종류가 이미 있으므로 다시 입력하게 하거나 코칭 시작 여부를 묻지'))
  assert.equal(starter.includes('① 2D 이미지'), false, 'An existing scene handoff must not restart result selection')
})
