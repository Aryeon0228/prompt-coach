import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { assembleFix } from '../src/lib/assemble.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import type { FreePromptMode } from '../src/lib/free-prompt.ts'
import type { Project, Template } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const freeTemplate: Template = JSON.parse(readFileSync(new URL('../public/templates/free-scene.json', import.meta.url), 'utf8'))
const productTemplate: Template = JSON.parse(readFileSync(new URL('../public/templates/product-shot.json', import.meta.url), 'utf8'))
const source = (file: string) => ts.transpileModule(readFileSync(new URL(`../src/components/${file}.tsx`, import.meta.url), 'utf8').replaceAll('import.meta.env.BASE_URL', '"/"'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText
const coachCode = source('Coach')
const locksCode = source('LocksEditor')

/** Exercise the component handlers and real prompt assembly without browser storage. */
function harness(mode: FreePromptMode = 'web', template = freeTemplate) {
  let project: Project = {
    id: 'test', name: '테스트 장면', templateId: template.id, createdAt: 1, updatedAt: 1,
    ...(template.id === 'free-scene' ? { freeform: createFreeBrief('작은 정원', mode) } : {}),
    decisions: {}, references: [{ id: 'reference', role: 'composition', name: '정원.jpg', dataUrl: '' }], locks: [], iterations: [],
  }
  const state: Record<string, unknown[]> = { coach: [], locks: [] }
  let current = 'coach'
  let cursor = 0
  let saved = 0
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  const locksExports: Record<string, () => Element> = {}
  const coachExports: Record<string, (props: unknown) => Element> = {}
  const require = (name: string): unknown => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useState(value: unknown) {
        const values = state[current]
        const index = cursor++
        if (!(index in values)) values[index] = typeof value === 'function' ? value() : value
        return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }]
      },
      useMemo: (compute: () => unknown) => compute(),
      useRef: (value: unknown) => ({ current: value }),
      useEffect() {},
    }
    if (name === '../store') return { useStore: () => ({ project, template, updateProject: (patch: (p: Project) => Project) => { project = patch(project) } }) }
    if (name === '../lib/assemble') return { assembleFix }
    if (name === '../lib/db') return { uid: () => `iteration-${saved + 1}` }
    if (name === '../lib/image') return { loadImage: async () => 'data:image/png;base64,test' }
    if (name === './ui') return { PromptBox: 'prompt-output', useToast: () => () => {} }
    if (name === './LocksEditor') return locksExports
    throw new Error(`Unexpected dependency: ${name}`)
  }
  vm.runInNewContext(locksCode, { exports: locksExports, require })
  vm.runInNewContext(coachCode, { exports: coachExports, require })
  return {
    project: () => project,
    saved: () => saved,
    render() { current = 'coach'; cursor = 0; return coachExports.Coach({ onSaved() { saved++ } }) },
    renderLocks() { current = 'locks'; cursor = 0; return locksExports.LocksEditor() },
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
const button = (tree: Element, label: string) => find(tree, n => n.type === 'button' && text(n).startsWith(label))
const pickSymptom = (tree: Element, id: string) => find(tree, n => n.props.s?.id === id).props.onPick()
const output = (tree: Element) => find(tree, n => n.type === 'prompt-output').props

function startProblem(ui: ReturnType<typeof harness>, template = freeTemplate) {
  button(ui.render(), '이미지 없이 시작하기').props.onClick()
  button(ui.render(), template.targets[0].ko).props.onClick()
  button(ui.render(), '문제 찾기').props.onClick()
}

test('problem choice stays with its symptoms; switching category invalidates only the symptom', () => {
  const ui = harness()
  startProblem(ui)
  assert.equal(button(ui.render(), '바꿀 내용 정하기').props.disabled, true)
  button(ui.render(), '내용과 조건').props.onClick()
  let tree = ui.render()
  assert.ok(text(tree).includes('무엇이 문제인가요?'))
  assert.ok(nodes(tree).some(n => n.props.s?.id === 'intent-missing'))
  pickSymptom(tree, 'intent-missing')
  assert.equal(button(ui.render(), '바꿀 내용 정하기').props.disabled, false)
  button(ui.render(), '내용과 조건').props.onClick()
  assert.equal(button(ui.render(), '바꿀 내용 정하기').props.disabled, false, 'Re-selecting the same category retains its symptom')
  button(ui.render(), '전달과 구성').props.onClick()
  tree = ui.render()
  assert.equal(button(tree, '바꿀 내용 정하기').props.disabled, true)
  assert.equal(nodes(tree).some(n => n.props.s?.id === 'intent-missing'), false)
  pickSymptom(tree, 'clarity-focus')
  button(ui.render(), '바꿀 내용 정하기').props.onClick()
  assert.ok(text(ui.render()).includes('주요 대상 · 중요한 부분이 잘 안 보임'))
})

test('desired change and preserved features reach the saved request for all result modes and template scenes', () => {
  for (const [mode, template] of [['image', freeTemplate], ['video', freeTemplate], ['web', freeTemplate], ['web', productTemplate]] as const) {
    const ui = harness(mode, template)
    startProblem(ui, template)
    const category = template.diagnosis[0]
    button(ui.render(), category.label).props.onClick()
    pickSymptom(ui.render(), category.symptoms[0].id)
    button(ui.render(), '바꿀 내용 정하기').props.onClick()
    const change = '오른쪽 여백을 1/3로 넓혀 주세요.'
    find(ui.render(), n => n.type === 'textarea').props.onChange({ target: { value: change } })
    const comparison = find(ui.render(), n => n.type === 'details' && n.props.className === 'revision-comparison')
    assert.notEqual(comparison.props.open, true, 'Reference comparison starts as optional, closed content')
    find(ui.renderLocks(), n => n.type === 'input').props.onChange({ target: { value: '대상의 푸른색' } })
    button(ui.renderLocks(), '추가').props.onClick()
    button(ui.render(), '수정 요청문 보기').props.onClick()
    const prompt = output(ui.render())
    for (const language of ['ko', 'en']) {
      assert.ok(prompt[language].includes(change))
      assert.ok(prompt[language].includes('대상의 푸른색'))
    }
    button(ui.render(), '기록에 저장').props.onClick()
    assert.equal(ui.saved(), 1)
    assert.equal(ui.project().iterations[0].note, change)
    assert.equal(ui.project().iterations[0].promptKo, prompt.ko)
    assert.equal(ui.project().iterations[0].symptomId, category.symptoms[0].id)
    assert.deepEqual(Array.from(ui.project().locks), ['대상의 푸른색'])
  }
})

test('dictionary shortcut still collects a target and a saved request starts with a clean draft', () => {
  const ui = harness()
  find(ui.render(), n => n.props.type === 'search').props.onChange({ target: { value: '복잡' } })
  button(ui.render(), '중요한 부분이 잘 안 보임').props.onClick()
  assert.equal(button(ui.render(), '바꿀 내용 정하기').props.disabled, true)
  button(ui.render(), '직접 쓰기').props.onClick()
  find(ui.render(), n => n.props.type === 'text').props.onChange({ target: { value: '왼쪽 화분' } })
  button(ui.render(), '바꿀 내용 정하기').props.onClick()
  let tree = ui.render()
  find(tree, n => n.props['aria-label'] === '참고 이미지 1').props.onClick()
  button(ui.render(), '구도·배치').props.onClick()
  find(ui.render(), n => n.type === 'textarea').props.onChange({ target: { value: '잎을 더 크게 해 주세요.' } })
  button(ui.render(), '수정 요청문 보기').props.onClick()
  button(ui.render(), '기록에 저장').props.onClick()
  assert.equal(ui.project().iterations[0].referenceId, 'reference')
  assert.ok(ui.project().iterations[0].promptKo.includes('참고 이미지 1'))
  assert.equal(find(ui.render(), n => n.props.type === 'search').props.value, '')
  button(ui.render(), '이미지 없이 시작하기').props.onClick()
  button(ui.render(), '직접 쓰기').props.onClick()
  assert.equal(find(ui.render(), n => n.props.type === 'text').props.value, '')
  assert.equal(button(ui.render(), '문제 찾기').props.disabled, true)
  button(ui.render(), '주요 대상').props.onClick()
  button(ui.render(), '문제 찾기').props.onClick()
  button(ui.render(), '내용과 조건').props.onClick()
  pickSymptom(ui.render(), 'intent-missing')
  button(ui.render(), '바꿀 내용 정하기').props.onClick()
  tree = ui.render()
  assert.equal(find(tree, n => n.type === 'textarea').props.value, '')
  assert.equal(find(tree, n => n.props['aria-label'] === '참고 이미지 1').props['aria-pressed'], false)
  assert.equal(button(tree, '구도·배치').props['aria-pressed'], false)
})

test('preservation editor respects IME composition and removes only the chosen condition', () => {
  const ui = harness()
  let tree = ui.renderLocks()
  find(tree, n => n.type === 'input').props.onChange({ target: { value: '  파란 하늘  ' } })
  tree = ui.renderLocks()
  const keydown = find(tree, n => n.type === 'input').props.onKeyDown
  keydown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() { assert.fail('IME composition must not be interrupted') } })
  assert.equal(ui.project().locks.length, 0)
  keydown({ key: 'Enter', nativeEvent: { isComposing: false }, preventDefault() {} })
  assert.deepEqual(Array.from(ui.project().locks), ['파란 하늘'])
  for (const value of ['파란 하늘', '카메라 위치']) {
    find(ui.renderLocks(), n => n.type === 'input').props.onChange({ target: { value } })
    button(ui.renderLocks(), '추가').props.onClick()
  }
  assert.deepEqual(Array.from(ui.project().locks), ['파란 하늘', '카메라 위치'])
  find(ui.renderLocks(), n => n.props['aria-label'] === '유지할 내용 삭제: 파란 하늘').props.onClick()
  assert.deepEqual(Array.from(ui.project().locks), ['카메라 위치'])
})
