import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { FREE_MODES } from '../src/lib/free-modes.ts'
import type { Project, TemplateIndexEntry } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const CoachConnectionStub = () => null
const ImageStartStub = () => null
const entries: TemplateIndexEntry[] = [
  { id: 'free-scene', name: '자유 장면', description: '', file: 'free-scene.json' },
  { id: 'island', name: '미니어처 섬', description: '작은 섬을 둘러보는 예시', file: 'island.json' },
  { id: 'product-shot', name: '제품 연출', description: '제품을 살펴보는 예시', file: 'product-shot.json' },
]
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/Start.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function project(id: string): Project {
  return { id, templateId: 'free-scene', name: `${id} 장면`, createdAt: 1, updatedAt: 1, decisions: {}, references: [], locks: [], iterations: [], freeform: createFreeBrief(`${id}의 아이디어`, 'web') }
}

/** Exercise Start's real event handlers without touching the user's browser data. */
function harness(initial: Project[] = []) {
  const states: unknown[] = []
  const confirmations: string[] = []
  const deleted: string[] = []
  const created: unknown[][] = []
  const toasts: string[] = []
  let projects = structuredClone(initial)
  let confirmAnswer = true
  let deletion: (id: string) => Promise<void> = async () => {}
  let cursor = 0
  let navigations = 0
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  const confirm = (message: string) => { confirmations.push(message); return confirmAnswer }
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useRef(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = { current: value }
          return states[index]
        },
        useState(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = value
          return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
        },
      }
      if (name === '../store') return { useStore: () => ({
        index: entries, projects,
        createProject: async (...args: unknown[]) => { created.push(args) },
        openProject: async () => {},
        importProject: async () => {},
        deleteProject: async (id: string) => { deleted.push(id); await deletion(id); projects = projects.filter(p => p.id !== id) },
      }) }
      if (name === '../lib/free-prompt') return { createFreeBrief }
      if (name === '../lib/free-modes') return { FREE_MODES }
      if (name === './ui') return { useToast: () => (message: string) => toasts.push(message) }
      if (name === './CoachConnection') return { CoachConnection: CoachConnectionStub }
      if (name === './ImageStart') return { ImageStart: ImageStartStub }
      throw new Error(`Unexpected dependency: ${name}`)
    },
    window: { confirm }, confirm,
  })
  return {
    confirmations, deleted, created, toasts,
    projects: () => projects,
    navigations: () => navigations,
    confirmWith: (answer: boolean) => { confirmAnswer = answer },
    deleteWith: (action: (id: string) => Promise<void>) => { deletion = action },
    render() { cursor = 0; return exports.Start({ onCreated() { navigations++ } }) },
  }
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...nodes(node.props.children)]
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'props' in value) return text((value as Element).props.children)
  return ''
}

function find(tree: Element, predicate: (node: Element) => boolean): Element {
  const node = nodes(tree).find(predicate)
  assert.ok(node, 'The requested control is present')
  return node
}

function deleteButton(tree: Element, name: string): Element {
  const row = find(tree, node => node.props.className === 'project-row' && text(node).includes(name))
  return find(row, node => node.type === 'button' && /삭제/.test(String(node.props['aria-label'] ?? node.props.title ?? text(node))))
}

test('new visitors reach scene input before optional, collapsed AI setup', () => {
  const tree = harness().render()
  const children = tree.props.children as Element[]
  const sceneIndex = children.findIndex(node => nodes(node).some(child => child.props.id === 'free-scene-form'))
  const projectsIndex = children.findIndex(node => node.props.className === 'card saved-projects')
  const setupIndex = children.findIndex(node => node.type === CoachConnectionStub)
  assert.ok(sceneIndex >= 0 && sceneIndex < projectsIndex && projectsIndex < setupIndex)
  assert.equal(children[setupIndex].props.collapsed, true)
  assert.equal(children[setupIndex].props.setupOnly, true)
  assert.match(text(children[sceneIndex]), /별도 설치 없이/)
  const firstStep = find(tree, node => node.type === 'ol' && node.props['aria-label'] === '사용 흐름').props.children[0]
  assert.match(text(firstStep), /장면 입력/)
})

test('example choices are subordinate to the scene form without nesting forms or losing the free draft', async () => {
  const ui = harness()
  let tree = ui.render()
  const idea = '  유리구 안의 작은 도서관\n책장 사이를 탐색하는 장면  '
  find(tree, node => node.type === 'textarea').props.onChange({ target: { value: idea } })
  find(tree, node => node.type === 'button' && text(node.props.children).startsWith('3D Web')).props.onClick()
  tree = ui.render()
  const example = find(tree, node => node.type === 'button' && text(node).includes('미니어처 섬'))
  assert.equal(example.props.type, 'button')
  example.props.onClick()
  tree = ui.render()
  assert.equal(find(tree, node => node.type === 'textarea').props.value, idea)
  assert.equal(ui.created.length, 0)
  const forms = nodes(tree).filter(node => node.type === 'form')
  assert.equal(forms.length, 2)
  for (const form of forms) assert.equal(nodes(form.props.children).filter(node => node.type === 'form').length, 0, 'No form contains another form')
  const freeForm = find(tree, node => node.type === 'form' && node.props.id === 'free-scene-form')
  const submit = find(tree, node => node.type === 'button' && text(node).includes('내 장면으로 시작하기'))
  assert.equal(submit.props.form, freeForm.props.id)
  assert.equal(submit.props.disabled, false)
  await freeForm.props.onSubmit({ preventDefault() {} })
  assert.equal(ui.created.length, 1)
  assert.equal((ui.created[0][0] as TemplateIndexEntry).id, 'free-scene')
  assert.equal((ui.created[0][2] as ReturnType<typeof createFreeBrief>).idea, idea)
  assert.equal((ui.created[0][2] as ReturnType<typeof createFreeBrief>).mode, 'web')
  assert.equal(ui.navigations(), 1)
})

test('switching image and text entry preserves the text draft and keeps the image entry mounted', () => {
  const ui = harness()
  let tree = ui.render()
  find(tree, node => node.type === 'textarea').props.onChange({ target: { value: '정리 중인 도서관 장면' } })
  find(tree, node => node.type === 'button' && text(node).startsWith('3D Web')).props.onClick()
  find(tree, node => node.type === 'button' && text(node).startsWith('이미지로 시작')).props.onClick()
  tree = ui.render()
  assert.equal(find(tree, node => node.type === ImageStartStub).props.active, true)
  assert.equal(find(tree, node => node.type === 'textarea').props.value, '정리 중인 도서관 장면')
  find(tree, node => node.type === 'button' && text(node).startsWith('글로 시작')).props.onClick()
  tree = ui.render()
  assert.equal(find(tree, node => node.type === ImageStartStub).props.active, false)
  assert.equal(find(tree, node => node.type === 'textarea').props.value, '정리 중인 도서관 장면')
  assert.equal(find(tree, node => node.type === 'button' && text(node).startsWith('3D Web')).props['aria-pressed'], true)
  assert.equal(ui.created.length, 0)
})

test('declining project deletion preserves both saved projects and the scene draft', async () => {
  const saved = [project('첫 번째'), project('두 번째')]
  const ui = harness(saved)
  ui.confirmWith(false)
  find(ui.render(), node => node.type === 'textarea').props.onChange({ target: { value: '작성 중인 새 장면' } })
  await deleteButton(ui.render(), saved[1].name).props.onClick()
  assert.equal(ui.confirmations.length, 1)
  assert.ok(ui.confirmations[0].includes(saved[1].name))
  assert.deepEqual(ui.deleted, [])
  assert.deepEqual(ui.projects(), saved)
  assert.equal(find(ui.render(), node => node.type === 'textarea').props.value, '작성 중인 새 장면')
})

test('confirmed deletion targets only the selected project and ignores duplicate clicks while pending', async () => {
  const saved = [project('첫 번째'), project('두 번째')]
  const ui = harness(saved)
  let finish!: () => void
  ui.deleteWith(async () => new Promise<void>(resolve => { finish = resolve }))
  const clicked = deleteButton(ui.render(), saved[1].name)
  const pending = clicked.props.onClick()
  await clicked.props.onClick()
  assert.deepEqual(ui.deleted, [saved[1].id])
  assert.equal(ui.confirmations.length, 1)
  assert.ok(ui.confirmations[0].includes(saved[1].name))
  finish()
  await pending
  assert.deepEqual(ui.projects(), [saved[0]])
  assert.equal(ui.navigations(), 0)
})

test('failed deletion leaves saved projects intact, reports the error and permits retry', async () => {
  const saved = [project('보관할'), project('삭제할')]
  const ui = harness(saved)
  ui.deleteWith(async () => { throw new Error('저장소 응답 실패') })
  await deleteButton(ui.render(), saved[1].name).props.onClick()
  assert.deepEqual(ui.projects(), saved)
  assert.equal(ui.toasts.length, 1)
  assert.match(ui.toasts[0], /저장소 응답 실패/)
  const retry = deleteButton(ui.render(), saved[1].name)
  assert.notEqual(retry.props.disabled, true)
  ui.deleteWith(async () => {})
  await retry.props.onClick()
  assert.deepEqual(ui.deleted, [saved[1].id, saved[1].id])
  assert.deepEqual(ui.projects(), [saved[0]])
})
