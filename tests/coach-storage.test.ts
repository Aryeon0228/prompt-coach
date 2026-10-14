import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createPromptCoaching, isPromptCoaching } from '../src/lib/coach-handoff.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import type { Project, TemplateIndexEntry } from '../src/types.ts'

interface TestStore {
  project: Project | null
  projects: Project[]
  openProject: (id: string | null) => Promise<void>
  updateProject: (patch: (project: Project) => Project) => void
  importProject: (json: string) => Promise<void>
}

const entries: TemplateIndexEntry[] = [
  { id: 'free-scene', name: '자유 장면', description: '', file: 'free-scene.json' },
  { id: 'product-shot', name: '제품 연출', description: '', file: 'product-shot.json' },
]
const source = ts.transpileModule(readFileSync(new URL('../src/store.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

/** Exercise the real provider callbacks with deterministic hooks and an isolated database. */
function storageHarness(initial: Project[] = []) {
  const states: unknown[] = [entries]
  const records = new Map(initial.map(project => [project.id, structuredClone(project)]))
  const timers = new Map<number, () => void>()
  const localStorage = new Map<string, string>()
  let slot = 0
  let nextId = 0
  let timerId = 0
  let store: TestStore
  const exports: { StoreProvider?: (props: { children: null }) => void } = {}
  const clone = <T,>(value: T): T => structuredClone(value)
  const db = {
    all: async () => [...records.values()].map(clone),
    get: async (id: string) => clone(records.get(id)),
    put: async (project: Project) => { records.set(project.id, clone(project)) },
    remove: async (id: string) => { records.delete(id) },
  }
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useCallback: (fn: unknown) => fn,
    useContext: () => store,
    useEffect: () => {},
    useMemo: (fn: () => unknown) => fn(),
    useRef: (value: unknown) => states[slot++] ??= { current: value },
    useState: (initialValue: unknown) => {
      const index = slot++
      if (!(index in states)) states[index] = initialValue
      return [states[index], (value: unknown) => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
      }]
    },
  }
  vm.runInNewContext(source, {
    exports,
    require: (name: string) => {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx: (_: unknown, props: { value: TestStore }) => { store = props.value; return null } }
      if (name === './lib/db') return { db, uid: () => `imported-${++nextId}` }
      if (name === './lib/coach-handoff') return { isPromptCoaching }
      if (name === './lib/templates') return { loadIndex: async () => entries, loadTemplate: async (entry: TemplateIndexEntry) => ({ id: entry.id }), validateTemplate: () => [] }
      throw new Error(`Unexpected dependency: ${name}`)
    },
    window: {
      setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id },
      clearTimeout: (id: number) => { timers.delete(id) },
    },
    localStorage: { getItem: (key: string) => localStorage.get(key), setItem: (key: string, value: string) => localStorage.set(key, value), removeItem: (key: string) => localStorage.delete(key) },
    Date,
    Promise,
  })
  const render = () => { slot = 0; exports.StoreProvider!({ children: null }); return store }
  return { render, records }
}

function project(id = 'original'): Project {
  return { id, templateId: 'free-scene', name: '개인 장면', createdAt: 1, updatedAt: 1, freeform: createFreeBrief('비 오는 기차역'), decisions: {}, references: [], locks: [], iterations: [] }
}

test('older projects without coaching history still import without adding or losing fields', async () => {
  for (const original of [project(), { ...project(), templateId: 'product-shot', freeform: undefined }]) {
    const harness = storageHarness()
    await harness.render().importProject(JSON.stringify(original))
    const imported = harness.render().project!
    assert.equal(imported.templateId, original.templateId)
    assert.equal(imported.promptCoaching, undefined)
    assert.equal(Object.hasOwn(imported, 'promptCoaching'), false)
    assert.deepEqual(structuredClone(imported.decisions), original.decisions)
    assert.notEqual(imported.id, original.id)
  }
})

test('JSON import preserves coaching drafts, accepted text and stale source snapshots exactly', async () => {
  const original: Project = {
    ...project(),
    promptCoaching: {
      request: { text: '  이 장면을 함께 구체화해 주세요.\n먼저 질문해 주세요.  ', source: 'older brief snapshot', copiedAt: 100 },
      draft: '  첫 줄\n\n두 번째 줄 — "원문 유지"  ',
      draftSource: 'older brief snapshot',
      notes: '  아직 결정하지 않은 조건\n카메라 각도는 나중에  ',
      accepted: { text: '확정한 요청문\n  들여쓰기 유지', source: 'even older brief snapshot', acceptedAt: 200 },
    },
  }
  const harness = storageHarness()
  await harness.render().importProject(JSON.stringify(original))
  assert.deepEqual(structuredClone(harness.render().project!.promptCoaching), original.promptCoaching)
  const exportedAgain = JSON.stringify(harness.render().project)
  await harness.render().importProject(exportedAgain)
  assert.deepEqual(structuredClone(harness.render().project!.promptCoaching), original.promptCoaching)
})

test('malformed optional coaching history is rejected before changing the saved projects', async () => {
  const valid = createPromptCoaching()
  const malformed = [
    null,
    [],
    {},
    { ...valid, draft: 123 },
    { ...valid, notes: 'x'.repeat(10001) },
    { ...valid, request: { text: 'request', source: 'source', copiedAt: -1 } },
    { ...valid, accepted: { text: '  ', source: 'source', acceptedAt: 1 } },
    { ...valid, accepted: { text: 'prompt', source: 'source', acceptedAt: 'today' } },
  ]
  const harness = storageHarness()
  for (const promptCoaching of malformed) {
    await assert.rejects(harness.render().importProject(JSON.stringify({ ...project(), promptCoaching })), /코칭 기록의 형식/)
    assert.equal(harness.records.size, 0)
    assert.equal(harness.render().project, null)
  }
})

test('an in-progress coaching draft is saved before switching projects and does not leak', async () => {
  const first = project('first')
  const second = project('second')
  const harness = storageHarness([first, second])
  await harness.render().openProject(first.id)
  harness.render().updateProject(current => ({ ...current, promptCoaching: { ...createPromptCoaching(), draft: '  입력 중인 초안\n보관할 내용  ', draftSource: 'first source', notes: '첫 프로젝트 메모' } }))
  await harness.render().openProject(second.id)
  assert.equal(harness.render().project!.promptCoaching, undefined)
  harness.render().updateProject(current => ({ ...current, promptCoaching: { ...createPromptCoaching(), draft: '다른 초안', draftSource: 'second source' } }))
  await harness.render().openProject(null)
  assert.equal(harness.records.get(first.id)!.promptCoaching!.draft, '  입력 중인 초안\n보관할 내용  ')
  assert.equal(harness.records.get(first.id)!.promptCoaching!.notes, '첫 프로젝트 메모')
  assert.equal(harness.records.get(second.id)!.promptCoaching!.draft, '다른 초안')
  assert.equal(harness.records.get(second.id)!.promptCoaching!.notes, '')
})
