import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { assembleImageScenePrompt, buildImageAnalysisRequest, createImagePrompt, IMAGE_PROMPT_LIMITS, isImagePromptDraft } from '../src/lib/image-prompt.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { buildCoachingRequest, coachingSource, isPromptCoaching } from '../src/lib/coach-handoff.ts'
import { coachingContext } from '../src/lib/coaching-context.ts'
import { createGuidedSession } from '../src/lib/coach-conversation.ts'
import type { Project, Reference, TemplateIndexEntry } from '../src/types.ts'
import type { ImageProjectSeed } from '../src/store.tsx'

const reference: Reference = { id: 'image-1', role: 'composition', name: 'my-image.jpg', dataUrl: 'data:image/jpeg;base64,PRIVATE_IMAGE_BYTES', note: '  수평 구도만 참고  ' }
const brief = createFreeBrief('이미지를 참고해 내 도서관 장면을 만들고 싶어요.', 'web')
const draft = { ...createImagePrompt(reference.id, 'https://www.pinterest.com/pin/123/'), description: '  붉은 책장 세 개가 창가에 놓여 있다.\n한낮의 밝은 빛.  ', preserve: '  창문의 둥근 모양\n책장 세 개  ', changes: '  책장은 파랗게, 시간은 밤으로 바꾸기.  ' }

test('image drafts validate bounded text and attribution URLs while preserving original whitespace', () => {
  assert.equal(isImagePromptDraft(draft), true)
  assert.equal(isImagePromptDraft(JSON.parse(JSON.stringify(draft))), true)
  assert.equal(isImagePromptDraft(vm.runInNewContext(`(${JSON.stringify(draft)})`)), true)
  for (const [field, max] of Object.entries(IMAGE_PROMPT_LIMITS)) {
    if (field === 'sourceUrl') continue
    assert.equal(isImagePromptDraft({ ...draft, [field]: '가'.repeat(max) }), true)
    assert.equal(isImagePromptDraft({ ...draft, [field]: '가'.repeat(max + 1) }), false)
  }
  for (const invalid of [null, [], {}, { ...draft, extra: true }, { ...draft, description: null }, { ...draft, referenceId: ' ' }, { ...draft, sourceUrl: 'javascript:alert(1)' }, { ...draft, sourceUrl: 'data:image/png;base64,a' }, { ...draft, sourceUrl: 'https://example.com/' + 'a'.repeat(2048) }, Object.create(draft)]) {
    assert.equal(isImagePromptDraft(invalid), false)
  }
  const clean = createImagePrompt('second')
  assert.equal(isImagePromptDraft(clean), true)
  clean.changes = '새 변경'
  assert.equal(createImagePrompt('second').changes, '')
})

test('image analysis requires a real attachment and separates visible baseline from later adaptations', () => {
  const intent = '  조용한 유리 도서관\n3D로 둘러보기  '
  const request = buildImageAnalysisRequest('web', intent)
  assert.ok(request.includes(intent))
  assert.ok(request.includes('먼저 이미지 파일을 첨부해 달라고 안내하고 기다리세요'))
  assert.ok(request.includes('변경 요청을 섞기 전에'))
  assert.ok(request.includes('보이는 사실과 추측을 구분'))
  assert.ok(request.includes('보이지 않는 뒷면'))
  assert.ok(request.includes('원래 조건과 바꾼 조건을 동시에 지시하지 마세요'))
  assert.equal(buildImageAnalysisRequest('image').includes('[3D 웹으로 옮길 때]'), false)
  assert.ok(buildImageAnalysisRequest('video').includes('[영상으로 옮길 때]'))
  assert.equal(request.includes(reference.dataUrl), false)
})

test('an absent image or empty observation cannot produce a usable image scene request', () => {
  assert.equal(assembleImageScenePrompt(brief, [], [], draft), '')
  assert.equal(assembleImageScenePrompt(brief, [reference], [], { ...draft, referenceId: 'deleted' }), '')
  assert.equal(assembleImageScenePrompt(brief, [reference], [], { ...draft, description: ' \n ' }), '')
})

test('scene assembly keeps baseline and changes distinct, preserves wording, and explicitly replaces superseded details', () => {
  const request = assembleImageScenePrompt(brief, [reference], ['방의 전체 구조 유지'], draft)
  for (const value of [brief.idea, draft.description, draft.preserve, draft.changes, draft.sourceUrl, '방의 전체 구조 유지']) assert.ok(request.includes(value))
  assert.ok(request.includes('[참고할 원본 묘사 · 이미지 1]'))
  assert.ok(request.includes('[이 이미지에서 바꿀 내용 · 원본보다 우선]'))
  assert.ok(request.includes('해당 원본 조건을 대체해 주세요'))
  assert.ok(request.includes('원래 조건과 변경된 조건을 동시에 적용하지 마세요'))
  assert.ok(request.includes('서로 충돌하면 임의로 정하지 말고 먼저 확인'))
  assert.ok(request.includes('[출력 요청]\n위 조건을 브라우저에서 실행'))
  assert.ok(request.includes('이미지 파일을 전달받았다는 뜻이 아닙니다'))
  assert.equal(request.includes(reference.dataUrl), false)
  const reordered = assembleImageScenePrompt(brief, [{ ...reference, id: 'another' }, reference], [], draft)
  assert.ok(reordered.includes('[참고할 원본 묘사 · 이미지 2]'))
})

test('image study edits invalidate handoff snapshots without including pixels or changing legacy sources', () => {
  const legacy = coachingSource(brief, [reference], [])
  assert.equal(legacy, coachingSource(brief, [reference], [], undefined, undefined))
  assert.equal('imagePrompt' in JSON.parse(legacy), false)
  const source = coachingSource(brief, [reference], [], undefined, draft)
  assert.deepEqual(JSON.parse(source).imagePrompt, draft)
  for (const field of Object.keys(draft) as Array<keyof typeof draft>) {
    assert.notEqual(source, coachingSource(brief, [reference], [], undefined, { ...draft, [field]: `${draft[field]} changed` }), field)
  }
  assert.equal(source.includes(reference.dataUrl), false)
  assert.equal(source.includes(reference.name), false)
  assert.equal(source, coachingSource(brief, [{ ...reference, dataUrl: 'recompressed', name: 'renamed.jpg' }], [], undefined, draft))
})

test('coaching carries confirmed image adaptation context and detects a session made before a change', () => {
  const project: Project = { id: 'p', name: 'p', templateId: 'free-scene', createdAt: 1, updatedAt: 1, freeform: brief, references: [reference], decisions: {}, locks: [], iterations: [], imagePrompt: draft }
  const baseSource = coachingSource(brief, [reference], [], undefined, draft)
  project.promptCoaching = { draft: '', draftSource: '', notes: '', session: createGuidedSession(brief, baseSource) }
  assert.equal(coachingContext(project).sessionStale, false)
  assert.equal(coachingContext({ ...project, imagePrompt: { ...draft, changes: '변경된 요청' } }).sessionStale, true)
  const request = buildCoachingRequest(brief, [reference], [], undefined, draft)
  for (const value of [draft.description, draft.preserve, draft.changes, draft.sourceUrl]) assert.ok(request.includes(value))
  assert.ok(request.includes('대체된 원래 조건을 최종 프롬프트에 함께 넣지 마세요'))
  assert.equal(request.includes(reference.dataUrl), false)
  const missing = buildCoachingRequest(brief, [], [], undefined, draft)
  assert.ok(missing.includes('원본 참고 이미지 파일이 현재 프로젝트에 없습니다'))
  assert.ok(missing.includes(draft.description))
})

const entries: TemplateIndexEntry[] = [{ id: 'free-scene', name: '자유 장면', description: '', file: 'free-scene.json' }, { id: 'product-shot', name: '제품', description: '', file: 'product-shot.json' }]
const storeCode = ts.transpileModule(readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

/** Real provider create/import callbacks, with isolated hooks and an in-memory database. */
function storageHarness() {
  const states: unknown[] = [entries]
  const records = new Map<string, Project>()
  let slot = 0
  let nextId = 0
  let store: { project: Project | null; createProject: (entry: TemplateIndexEntry, name: string, freeform?: typeof brief, seed?: ImageProjectSeed) => Promise<void>; importProject: (json: string) => Promise<void> }
  const exports: { StoreProvider?: (props: { children: null }) => void } = {}
  const db = { all: async () => [...records.values()].map((project) => structuredClone(project)), get: async (id: string) => structuredClone(records.get(id)), put: async (project: Project) => { records.set(project.id, structuredClone(project)) } }
  vm.runInNewContext(storeCode, { exports, Date, Promise, require(name: string) {
    if (name === 'react') return {
      createContext: () => ({ Provider: 'provider' }), useCallback: (fn: unknown) => fn, useEffect: () => {}, useMemo: (fn: () => unknown) => fn(),
      useRef: (value: unknown) => states[slot++] ??= { current: value },
      useState(value: unknown) { const index = slot++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
    }
    if (name === 'react/jsx-runtime') return { jsx: (_: unknown, props: { value: typeof store }) => { store = props.value; return null } }
    if (name === './lib/db') return { db, uid: () => `import-${++nextId}` }
    if (name === './lib/coach-handoff') return { isPromptCoaching }
    if (name === './lib/image-prompt') return { isImagePromptDraft }
    if (name === './lib/templates') return { loadTemplate: async (entry: TemplateIndexEntry) => ({ id: entry.id }), validateTemplate: () => [] }
    throw new Error(`Unexpected dependency ${name}`)
  }, localStorage: { setItem() {}, removeItem() {}, getItem() { return null } }, window: { clearTimeout() {} } })
  return { render() { slot = 0; exports.StoreProvider!({ children: null }); return store }, records }
}

test('image-first creation saves the real source and draft in one project, with independent copies', async () => {
  const harness = storageHarness()
  const seed = { references: [{ ...reference }], imagePrompt: { ...draft } }
  await harness.render().createProject(entries[0], '내 장면', brief, seed)
  const saved = harness.render().project!
  assert.equal(saved.name, '내 장면')
  assert.deepEqual(structuredClone(saved.references), [reference])
  assert.deepEqual(structuredClone(saved.imagePrompt), draft)
  seed.imagePrompt.description = '외부 수정'
  seed.references[0].note = '외부 수정'
  assert.equal(saved.imagePrompt!.description, draft.description)
  assert.equal(saved.references[0].note, reference.note)
  await assert.rejects(harness.render().createProject(entries[0], '오류', brief, { references: [], imagePrompt: draft }), /원본 이미지/)
})

test('project import round-trips image notes, accepts a missing source for recovery, and rejects inconsistent records', async () => {
  const harness = storageHarness()
  await harness.render().createProject(entries[0], '이미지 프로젝트', brief, { references: [reference], imagePrompt: draft })
  const original = structuredClone(harness.render().project!)
  await harness.render().importProject(JSON.stringify(original))
  const restored = harness.render().project!
  assert.notEqual(restored.id, original.id)
  assert.deepEqual(structuredClone(restored.imagePrompt), draft)
  assert.deepEqual(structuredClone(restored.references), [reference])
  await harness.render().importProject(JSON.stringify({ ...original, references: [] }))
  assert.equal(harness.render().project!.imagePrompt!.description, draft.description)
  for (const invalid of [{ ...original, imagePrompt: { ...draft, changes: null } }, { ...original, templateId: 'product-shot' }, { ...original, references: [reference, reference] }, { ...original, references: [{ ...reference, dataUrl: 'https://remote-image.example/file.jpg' }] }]) {
    await assert.rejects(harness.render().importProject(JSON.stringify(invalid)), /기록/)
  }
  const { imagePrompt: _draft, ...legacy } = original
  await harness.render().importProject(JSON.stringify(legacy))
  assert.equal(harness.render().project!.imagePrompt, undefined)
})
