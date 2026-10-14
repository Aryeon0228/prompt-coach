import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { assembleFreePrompt, createFreeBrief, reviewFreeBrief } from '../src/lib/free-prompt.ts'
import type { FreePromptMode } from '../src/lib/free-prompt.ts'
import type { Reference, Template } from '../src/types.ts'

test('free briefs start without invented details and preserve the supplied idea', () => {
  const idea = '  바닷속 도서관\n고래 한 마리와 유리 지붕 — 빛은 왼쪽에서.  '
  const brief = createFreeBrief(idea, 'video')
  assert.equal(brief.idea, idea)
  assert.equal(brief.mode, 'video')
  assert.deepEqual(Object.values(brief).filter((value) => value === ''), Array(7).fill(''))
  assert.equal(assembleFreePrompt(createFreeBrief()), '')
})

test('assembly keeps multiline wording, units and punctuation exactly as entered', () => {
  const brief = {
    ...createFreeBrief('「여름의 끝」\n  안개 낀 버스 정류장'),
    purpose: '포트폴리오 표지용 / 20대 관객',
    subject: '의자는 2개, 사람은 0명.',
    composition: '왼쪽 1/3에 정류장.\n오른쪽은 빈 공간.',
    style: '보라 #85709D · 젖은 아스팔트',
    details: '  4:3, 네온 문구는 "LAST STOP".  ',
    constraints: '간판 외 글자는 넣지 않기\n비가 내리는 중은 아님',
    success: '의자 2개가 모두 보인다.\n간판의 문구가 정확하다.',
  }
  const prompt = assembleFreePrompt(brief)
  for (const [field, value] of Object.entries(brief)) {
    if (field !== 'mode') assert.ok(prompt.includes(value), `${field} input should not be rewritten`)
  }
  assert.ok(prompt.includes('[결과 확인 기준]\n' + brief.success))
  assert.ok(prompt.includes('[출력 요청]\n위 조건에 맞는 이미지를 만들어 주세요.'))
})

test('empty fields stay absent and examples never leak into an assembled prompt', () => {
  const prompt = assembleFreePrompt({ ...createFreeBrief('창가의 화분'), purpose: '  \n  ', details: '\t' })
  assert.equal(prompt, '[만들고 싶은 장면]\n창가의 화분\n\n[출력 요청]\n위 조건에 맞는 이미지를 만들어 주세요.')
  for (const text of ['[목적과 보는 사람]', '[구체적인 조건]', '[참고 이미지]', '[결과 확인 기준]', '[유지할 부분]', '예:', 'Vite', 'React']) {
    assert.equal(prompt.includes(text), false, `must not introduce ${text}`)
  }
})

test('output requests follow the chosen medium without inserting a technology stack', () => {
  const expected: Record<FreePromptMode, string> = {
    image: '이미지를 만들어 주세요',
    video: '영상을 만들어 주세요',
    web: '3D 웹 장면으로 구현해 주세요',
  }
  for (const mode of Object.keys(expected) as FreePromptMode[]) {
    const prompt = assembleFreePrompt(createFreeBrief('별이 떠 있는 정원', mode))
    assert.ok(prompt.includes(expected[mode]))
    assert.equal(/React|Vite|TypeScript|three|60fps/.test(prompt), false)
    if (mode !== 'web') assert.equal(/코드|구현|실행 방법|웹|브라우저/.test(prompt), false)
  }
})

test('references retain their order, roles and notes without serializing image data', () => {
  const references: Reference[] = [
    { id: 'a', role: 'composition', name: '배치.png', dataUrl: 'data:image/png;base64,PRIVATE_A', note: '왼쪽 여백만 참고\n색은 따르지 않기' },
    { id: 'b', role: 'avoid', name: 'avoid.jpg', dataUrl: 'data:image/jpeg;base64,PRIVATE_B', note: '  과한 빛 번짐을 피하기.  ' },
    { id: 'c', role: 'unknown-future-role', name: '', dataUrl: 'data:image/png;base64,PRIVATE_C', note: ' ' },
  ]
  const prompt = assembleFreePrompt(createFreeBrief('창가의 화분'), references)
  assert.ok(prompt.includes('이미지 1: 구도·배치 — 배치.png\n참고할 점: ' + references[0].note))
  assert.ok(prompt.includes('이미지 2: 피할 표현 — avoid.jpg\n참고할 점: ' + references[1].note))
  assert.ok(prompt.includes('이미지 3: 참고 이미지'))
  assert.ok(prompt.indexOf('이미지 1:') < prompt.indexOf('이미지 2:'))
  assert.ok(prompt.indexOf('이미지 2:') < prompt.indexOf('이미지 3:'))
  assert.ok(prompt.includes('이미지 파일도 이 번호 순서대로 함께 첨부'))
  assert.ok(prompt.includes('텍스트를 복사해도 이미지는 포함되지 않습니다'))
  assert.equal(/data:image|PRIVATE_|unknown-future-role/.test(prompt), false)
})

test('locks are separate from the result checklist and exclude empty entries', () => {
  const brief = { ...createFreeBrief('물 위의 집'), success: '집의 입구가 보인다.' }
  const prompt = assembleFreePrompt(brief, [], ['건물의 비율은 그대로', ' \n ', '  하늘색 #BCDDEF 유지  '])
  assert.ok(prompt.includes('[결과 확인 기준]\n집의 입구가 보인다.'))
  assert.ok(prompt.includes('[유지할 부분]\n이미 정한 아래 내용은 바꾸지 말아 주세요.\n- 건물의 비율은 그대로\n-   하늘색 #BCDDEF 유지  '))
  assert.equal(prompt.includes('-  \n '), false)
})

test('review reports field presence rather than scoring or claiming quality', () => {
  const review = reviewFreeBrief({ ...createFreeBrief('좋은 거'), composition: ' \n ', success: 'a' })
  assert.deepEqual(review.filter((item) => item.filled).map((item) => item.id), ['idea', 'success'])
  assert.equal(review.length, 8)
  assert.equal(new Set(review.map((item) => item.id)).size, 8)
  for (const item of review) {
    assert.deepEqual(Object.keys(item), ['id', 'label', 'filled', 'hint'])
    assert.ok(item.hint.length > 0)
  }
  const videoHint = reviewFreeBrief(createFreeBrief('', 'video')).find((item) => item.id === 'details')!.hint
  const webHint = reviewFreeBrief(createFreeBrief('', 'web')).find((item) => item.id === 'details')!.hint
  assert.ok(videoHint.includes('길이'))
  assert.ok(webHint.includes('클릭·드래그'))
})

test('the free-scene template supports existing template consumers and coherent diagnosis references', () => {
  const template: Template = JSON.parse(readFileSync(new URL('../public/templates/free-scene.json', import.meta.url), 'utf8'))
  assert.equal(template.id, 'free-scene')
  assert.deepEqual(template.decisions, [])
  assert.deepEqual(template.sections, [])
  for (const key of ['targets', 'referenceRoles', 'checklistBase', 'process', 'diagnosis', 'compareAxes', 'feelDictionary'] as const) {
    assert.ok(Array.isArray(template[key]), `${key} is required by the existing template shape`)
  }
  const symptoms = template.diagnosis.flatMap((category) => category.symptoms.map((symptom) => symptom.id))
  assert.equal(new Set(symptoms).size, symptoms.length)
  for (const entry of template.feelDictionary) for (const id of entry.symptoms) assert.ok(symptoms.includes(id))
  for (const role of template.referenceRoles) {
    const prompt = assembleFreePrompt(createFreeBrief('自由 장면'), [{ id: 'ref', role: role.id, name: '', dataUrl: '' }])
    assert.ok(prompt.includes(`이미지 1: ${role.label}`))
  }
})
