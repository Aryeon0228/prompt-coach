import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { historyStats } from '../src/lib/assemble.ts'
import type { Iteration, Project, Template } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const template: Template = JSON.parse(readFileSync(new URL('../public/templates/free-scene.json', import.meta.url), 'utf8'))
const compile = (name: string) => ts.transpileModule(readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const compiled = { Settings: compile('Settings'), History: compile('History') }
const iteration = (id: string, createdAt: number): Iteration => ({ id, createdAt, target: id, targetEn: id, categoryId: 'intent', symptomId: 'intent-missing', promptEn: `${id} original English request`, promptKo: `${id} 원래 요청문` })

function harness(component: 'Settings' | 'History', iterations: Iteration[] = []) {
  let project: Project = { id: 'project-a', templateId: template.id, name: '보관할 프로젝트', createdAt: 1, updatedAt: 1, decisions: {}, references: [], locks: ['푸른 하늘'], iterations }
  const states: unknown[] = []
  const confirmations: string[] = []
  const deletions: string[] = []
  const toasts: string[] = []
  let answer = true
  let deletion: () => Promise<void> = async () => {}
  let cursor = 0
  let creations = 0
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled[component], {
    exports, Error,
    confirm(message: string) { confirmations.push(message); return answer },
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = value
          return [states[index], (next: unknown) => { states[index] = next }]
        },
        useRef(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = { current: value }
          return states[index]
        },
      }
      if (name === '../store') return { useStore: () => ({ project, template, updateProject: (patch: (p: Project) => Project) => { project = patch(project) }, deleteProject: async (id: string) => { deletions.push(id); await deletion() } }) }
      if (name === '../lib/assemble') return { historyStats }
      if (name === './ui') return { PromptBox: 'prompt-output', downloadText() {}, useToast: () => (message: string) => toasts.push(message) }
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return {
    project: () => project, confirmations, deletions, toasts,
    creations: () => creations,
    confirmWith: (next: boolean) => { answer = next },
    deleteWith: (next: () => Promise<void>) => { deletion = next },
    render() { cursor = 0; return exports[component]({ onCreate() { creations++ } }) },
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

test('project deletion honors cancellation, blocks duplicate requests and allows retry after failure', async () => {
  const ui = harness('Settings')
  const remove = () => find(ui.render(), n => n.type === 'button' && n.props.className === 'danger')
  const original = structuredClone(ui.project())
  ui.confirmWith(false)
  await remove().props.onClick()
  assert.equal(ui.deletions.length, 0)
  assert.deepEqual(ui.project(), original)
  assert.ok(ui.confirmations[0].includes(original.name))

  ui.confirmWith(true)
  let fail!: (error: Error) => void
  ui.deleteWith(() => new Promise<void>((_, reject) => { fail = reject }))
  const button = remove()
  const pending = button.props.onClick()
  await button.props.onClick()
  assert.deepEqual(ui.deletions, ['project-a'])
  assert.equal(remove().props.disabled, true)
  fail(new Error('저장소 응답 실패'))
  await pending
  assert.match(ui.toasts[0], /저장소 응답 실패/)
  assert.equal(remove().props.disabled, false)
  assert.deepEqual(ui.project(), original)
  ui.deleteWith(async () => {})
  await remove().props.onClick()
  assert.deepEqual(ui.deletions, ['project-a', 'project-a'])
  assert.match(ui.toasts[1], /삭제했어요/)
})

test('history prioritizes latest requests and keeps later assessments scoped to their original record', () => {
  const latest = iteration('새 요청', 200)
  const older = iteration('이전 요청', 100)
  const ui = harness('History', [latest, older])
  let tree = ui.render()
  let records = nodes(tree).filter(n => n.props.className === 'card stack history-record')
  assert.ok(text(records[0]).includes('#1 새 요청'))
  assert.ok(text(records[1]).includes('#2 이전 요청'))
  const request = find(records[0], n => n.type === 'prompt-output')
  assert.equal(request.props.ko, latest.promptKo)
  assert.equal(request.props.en, latest.promptEn)
  const assessment = find(records[0], n => n.props.className === 'history-evaluation')
  assert.notEqual(assessment.props.open, true)
  assert.ok(text(assessment).includes('미평가'))
  find(assessment, n => n.props['aria-label'] === '4점').props.onClick()
  assert.equal(ui.project().iterations[0].rating, 4)
  assert.equal(ui.project().iterations[1].rating, undefined)
  tree = ui.render()
  records = nodes(tree).filter(n => n.props.className === 'card stack history-record')
  find(records[0], n => n.props.type === 'checkbox').props.onChange({ target: { checked: true } })
  assert.equal(ui.project().iterations[0].resolved, true)
  assert.equal(ui.project().iterations[1].resolved, undefined)
  assert.equal(ui.project().iterations[0].promptKo, latest.promptKo)
  ui.confirmWith(false)
  find(ui.render(), n => n.props['aria-label'] === '2번 수정 기록 삭제').props.onClick()
  assert.equal(ui.project().iterations.length, 2)
  ui.confirmWith(true)
  find(ui.render(), n => n.props['aria-label'] === '2번 수정 기록 삭제').props.onClick()
  assert.deepEqual(Array.from(ui.project().iterations, item => item.id), ['새 요청'])
})

test('empty history offers a direct route to creating a revision request', () => {
  const ui = harness('History')
  find(ui.render(), n => n.type === 'button' && text(n) === '수정 요청 만들기').props.onClick()
  assert.equal(ui.creations(), 1)
})
