import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as freePrompt from '../src/lib/free-prompt.ts'
import * as imagePrompt from '../src/lib/image-prompt.ts'
import * as handoff from '../src/lib/coach-handoff.ts'
import * as context from '../src/lib/coaching-context.ts'
import * as connection from '../src/lib/mcp-connection.ts'
import { FREE_MODES } from '../src/lib/free-modes.ts'
import type { Project } from '../src/types.ts'

type Element = { type: any; props: Record<string, any> }
type Component = (props: any) => Element

const compiled = Object.fromEntries(['FreePromptView', 'ImportedPromptEditor'].map(name => [name,
  ts.transpileModule(readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]))

function project(): Project {
  return { id: 'prompt-project', templateId: 'free-scene', name: '작은 도서관', createdAt: 1, updatedAt: 1, decisions: {}, references: [], locks: [], iterations: [], freeform: freePrompt.createFreeBrief('유리구 안의 작은 도서관', 'web') }
}

/** Run both real components and their event handlers against an isolated saved project. */
function harness(initial: Project) {
  let saved = structuredClone(initial)
  let states: unknown[] = []
  let cursor = 0
  let navigations = 0
  let dirty = false
  const effects: Array<() => unknown> = []
  const focused: string[] = []
  const copied: string[] = []
  const toasts: string[] = []
  const componentStates = new Map<Component, unknown[]>()
  const modules: Record<string, Record<string, Component>> = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  const require = (name: string): unknown => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
    if (name === 'react') return {
      useEffect(effect: () => unknown, dependencies: unknown[]) {
        const index = cursor++
        const previous = states[index] as unknown[] | undefined
        if (!previous || dependencies.some((value, index) => value !== previous[index])) {
          states[index] = dependencies
          effects.push(effect)
        }
      },
      useId: () => 'editor',
      useRef(value: unknown) { const index = cursor++; return states[index] ??= { current: value } },
      useState(value: unknown) {
        const index = cursor++
        const componentState = states
        if (!(index in componentState)) componentState[index] = typeof value === 'function' ? value() : value
        return [componentState[index], (next: unknown) => { const updated = typeof next === 'function' ? next(componentState[index]) : next; if (updated !== componentState[index]) { componentState[index] = updated; dirty = true } }]
      },
    }
    if (name === '../store') return { useStore: () => ({ project: saved, updateProject: (update: (p: Project) => Project) => { saved = update(saved) } }) }
    if (name === '../lib/free-prompt') return freePrompt
    if (name === '../lib/image-prompt') return imagePrompt
    if (name === '../lib/coach-handoff') return handoff
    if (name === '../lib/coaching-context') return context
    if (name === '../lib/mcp-connection') return connection
    if (name === '../lib/free-modes') return { FREE_MODES }
    if (name === './ui') return { useToast: () => (message: string) => toasts.push(message), copyText: async (text: string) => { copied.push(text); return true }, downloadText() {} }
    if (name === './ImportedPromptEditor') return load('ImportedPromptEditor')
    throw new Error(`Unexpected dependency: ${name}`)
  }
  const load = (name: string) => {
    if (modules[name]) return modules[name]
    const exports: Record<string, Component> = {}
    vm.runInNewContext(compiled[name], { exports, require, requestAnimationFrame: (callback: () => void) => callback(), cancelAnimationFrame() {}, Date })
    return modules[name] = exports
  }
  const expand = (value: any): any => {
    if (Array.isArray(value)) return value.map(expand)
    if (!value || typeof value !== 'object' || !('props' in value)) return value
    if (typeof value.type === 'function') return render(value.type, value.props)
    if (value.props.ref) value.props.ref.current = { focus() { focused.push(value.props.id ?? value.props.className) } }
    return { ...value, props: { ...value.props, children: expand(value.props.children) } }
  }
  const render = (component: Component, props: any): Element => {
    states = componentStates.get(component) ?? []
    componentStates.set(component, states)
    cursor = 0
    return expand(component(props))
  }
  const navigate = () => { navigations++ }
  return {
    copied, toasts, focused,
    project: () => structuredClone(saved),
    update: (change: (p: Project) => Project) => { saved = change(saved) },
    navigations: () => navigations,
    render: (props: { importRequestKey?: number } = {}) => {
      let tree: Element
      let passes = 0
      do {
        assert.ok(passes++ < 5, 'Effects settle without a render loop')
        dirty = false
        tree = render(load('FreePromptView').FreePromptView, { onEdit: navigate, onRefine: navigate, onRevise: navigate, ...props })
        while (effects.length) effects.shift()!()
      } while (dirty)
      return tree!
    },
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
  return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : ''
}
function find(tree: Element, predicate: (node: Element) => boolean): Element {
  const found = nodes(tree).find(predicate)
  assert.ok(found, 'The requested control exists')
  return found
}
const button = (tree: Element, label: string) => find(tree, node => node.type === 'button' && text(node).includes(label))
const editor = (tree: Element) => find(tree, node => node.type === 'details' && String(node.props.className).includes('imported-prompt-editor'))
const draft = (tree: Element) => find(tree, node => node.type === 'textarea' && node.props.id.endsWith('-draft'))
const notes = (tree: Element) => find(tree, node => node.type === 'textarea' && node.props.id.endsWith('-notes'))
const output = (tree: Element) => find(tree, node => String(node.props.className).includes('free-prompt-output'))
const apply = (tree: Element) => button(tree, '프롬프트에 적용하기')
const compare = (tree: Element) => find(tree, node => node.type === 'input' && node.props.type === 'checkbox')

test('import and inline editing preserve the accepted prompt until explicit apply, then select the applied version', async () => {
  const p = project()
  const source = context.coachingContext(p).source
  p.promptCoaching = { ...handoff.createPromptCoaching(), draft: '기존 완성본', draftSource: source, notes: '보관된 메모', request: { text: '기존 요청', source, copiedAt: 1 }, accepted: { text: '기존 완성본', source, acceptedAt: 2 } }
  const ui = harness(p)
  let tree = ui.render()
  assert.equal(text(output(tree)), '기존 완성본')
  assert.equal(editor(tree).props.open, false)
  editor(tree).props.onToggle({ currentTarget: { open: true } })
  tree = ui.render()
  assert.equal(editor(tree).props.open, true)
  const revised = '  카메라를 드래그해 회전하는 작은 도서관\n\n색은 그대로 유지  '
  draft(tree).props.onChange({ target: { value: revised } })
  notes(tree).props.onChange({ target: { value: '  빛의 방향을 정한 이유\n둘째 줄  ' } })
  tree = ui.render()
  assert.equal(ui.navigations(), 0, 'Editing stays on the prompt screen')
  assert.equal(text(output(tree)), '기존 완성본')
  await button(tree, '프롬프트 복사').props.onClick()
  assert.deepEqual(ui.copied, ['기존 완성본'])
  assert.equal(apply(tree).props.disabled, false)
  button(tree, '직접 작성한 내용').props.onClick()
  tree = ui.render()
  assert.notEqual(text(output(tree)), revised)
  apply(tree).props.onClick()
  tree = ui.render()
  assert.equal(text(output(tree)), revised)
  assert.equal(editor(tree).props.open, false)
  assert.equal(button(tree, '코칭으로 다듬은 내용').props['aria-pressed'], true)
  assert.equal(ui.project().promptCoaching!.accepted!.source, source)
  assert.equal(ui.project().promptCoaching!.notes, '  빛의 방향을 정한 이유\n둘째 줄  ')
  assert.deepEqual(ui.project().promptCoaching!.request, p.promptCoaching.request)
  assert.deepEqual(ui.project().freeform, p.freeform)
  assert.equal(apply(tree).props.disabled, true, 'Unchanged content does not need another apply')
})

test('saved unfinished drafts and notes reopen after remount without replacing the applied prompt', () => {
  const ui = harness(project())
  let tree = ui.render()
  draft(tree).props.onChange({ target: { value: '처음 가져온 완성본' } })
  tree = ui.render()
  assert.equal(ui.project().promptCoaching!.accepted, undefined)
  apply(tree).props.onClick()
  tree = ui.render()
  draft(tree).props.onChange({ target: { value: '  아직 적용하지 않은 수정\n입력 중  ' } })
  notes(tree).props.onChange({ target: { value: '복원할 메모' } })
  const restored = harness(ui.project())
  tree = restored.render()
  assert.equal(editor(tree).props.open, true)
  assert.equal(draft(tree).props.value, '  아직 적용하지 않은 수정\n입력 중  ')
  assert.equal(notes(tree).props.value, '복원할 메모')
  assert.equal(text(output(tree)), '처음 가져온 완성본')
  assert.match(text(tree), /아직 적용하지 않은 초안/)
  assert.equal(apply(tree).props.disabled, false)
})

test('stale imported content requires current-source confirmation, reset by editing or changing conditions', () => {
  const p = project()
  const oldSource = context.coachingContext(p).source
  p.promptCoaching = { ...handoff.createPromptCoaching(), draft: '이전 완성본', draftSource: oldSource, accepted: { text: '이전 완성본', source: oldSource, acceptedAt: 1 } }
  p.freeform!.idea = '비 오는 숲속의 작은 도서관'
  const ui = harness(p)
  let tree = ui.render()
  button(tree, '가져온 프롬프트 확인·편집하기').props.onClick()
  tree = ui.render()
  assert.equal(editor(tree).props.open, true)
  assert.equal(ui.navigations(), 0)
  assert.equal(apply(tree).props.disabled, true)
  apply(tree).props.onClick()
  assert.equal(ui.project().promptCoaching!.accepted!.source, oldSource)
  compare(tree).props.onChange({ target: { checked: true } })
  tree = ui.render()
  assert.equal(apply(tree).props.disabled, false)
  draft(tree).props.onChange({ target: { value: '현재 장면에 맞게 수정한 완성본' } })
  tree = ui.render()
  assert.equal(compare(tree).props.checked, false)
  assert.equal(apply(tree).props.disabled, true)
  compare(tree).props.onChange({ target: { checked: true } })
  ui.update(current => ({ ...current, locks: ['표정은 유지'] }))
  tree = ui.render()
  assert.equal(compare(tree).props.checked, false)
  assert.equal(apply(tree).props.disabled, true)
  compare(tree).props.onChange({ target: { checked: true } })
  tree = ui.render()
  apply(tree).props.onClick()
  tree = ui.render()
  assert.equal(text(output(tree)), '현재 장면에 맞게 수정한 완성본')
  assert.equal(ui.project().promptCoaching!.accepted!.source, context.coachingContext(ui.project()).source)
  assert.equal(button(tree, '프롬프트 복사').props.disabled, false)
})

test('editor enforces import budgets and cannot apply an empty idea or an oversized source', () => {
  const empty = project()
  empty.freeform!.idea = ''
  const ui = harness(empty)
  let tree = ui.render()
  draft(tree).props.onChange({ target: { value: 'x'.repeat(100001) } })
  notes(tree).props.onChange({ target: { value: 'y'.repeat(10001) } })
  tree = ui.render()
  assert.equal(ui.project().promptCoaching!.draft.length, 100000)
  assert.equal(ui.project().promptCoaching!.notes.length, 10000)
  assert.equal(apply(tree).props.disabled, true)
  const large = project()
  large.locks = ['a'.repeat(100001)]
  const largeUi = harness(large)
  tree = largeUi.render()
  draft(tree).props.onChange({ target: { value: '짧은 완성본' } })
  tree = largeUi.render()
  compare(tree).props.onChange({ target: { checked: true } })
  tree = largeUi.render()
  assert.equal(apply(tree).props.disabled, true)
  assert.match(text(tree), /장면 설명과 참고 메모가 길어/)
  assert.equal(largeUi.project().promptCoaching!.accepted, undefined)
})


test('explicit import intent opens and focuses the existing editor once; ordinary visits do not reopen it', () => {
  const ui = harness(project())
  let tree = ui.render()
  assert.equal(editor(tree).props.open, false)
  assert.equal(ui.focused.length, 0)
  assert.equal(editor(tree).props.hidden, true, 'The closed editor does not repeat the top import action')

  tree = ui.render({ importRequestKey: 1 })
  assert.equal(editor(tree).props.open, true)
  assert.equal(ui.focused.at(-1), 'editor-draft')
  assert.equal(editor(tree).props.hidden, false)
  assert.equal(nodes(tree).filter(node => node.type === 'textarea' && node.props.id.endsWith('-draft')).length, 1, 'There is only one draft editor')
  assert.ok(nodes(tree).indexOf(editor(tree)) < nodes(tree).indexOf(output(tree)), 'The import editor is before the long prompt output')

  editor(tree).props.onToggle({ currentTarget: { open: false } })
  tree = ui.render({ importRequestKey: 1 })
  assert.equal(editor(tree).props.open, false, 'The same consumed intent does not undo closing')
  tree = ui.render()
  assert.equal(editor(tree).props.open, false)
  tree = ui.render({ importRequestKey: 2 })
  assert.equal(editor(tree).props.open, true)
  const previousFocusCount = ui.focused.length
  button(tree, 'AI 완성본 가져오기').props.onClick()
  ui.render({ importRequestKey: 2 })
  assert.equal(ui.focused.length, previousFocusCount + 1, 'The top action focuses the field even when already expanded')

  const anotherProject = project()
  anotherProject.id = 'another-project'
  const nextProject = harness(anotherProject)
  assert.equal(editor(nextProject.render()).props.open, false, 'A project without its own import intent starts normally')
})

test('ready state follows the selected version and optional next work stays folded below the prompt', () => {
  const p = project()
  const source = context.coachingContext(p).source
  p.promptCoaching = { ...handoff.createPromptCoaching(), draft: '이전 완성본', draftSource: source, accepted: { text: '이전 완성본', source, acceptedAt: 1 } }
  p.locks = ['현재는 빨간 책장을 유지']
  const ui = harness(p)
  let tree = ui.render()
  const heading = (view: Element) => text(find(view, node => node.type === 'h2' && node.props.id === 'free-prompt-ready-title'))
  assert.equal(heading(tree), '프롬프트 준비 완료', 'Current original conditions can be used while the old imported version is preserved')
  button(tree, '코칭으로 다듬은 내용').props.onClick()
  tree = ui.render()
  assert.equal(heading(tree), '현재 조건과 비교해 주세요')
  assert.equal(button(tree, '프롬프트 복사').props.disabled, true)
  const deeperWork = find(tree, node => node.type === 'details' && String(node.props.className).includes('prompt-review'))
  assert.notEqual(deeperWork.props.open, true)
  assert.ok(nodes(deeperWork).includes(button(tree, '질문으로 더 다듬기')))
  const afterCreation = find(tree, node => node.type === 'details' && text(node).startsWith('결과를 받은 뒤'))
  assert.notEqual(afterCreation.props.open, true)
  assert.ok(nodes(afterCreation).includes(button(tree, '수정 코치 열기')))
  assert.ok(text(afterCreation).includes('현재는 빨간 책장을 유지'))
})

test('image workflow output carries baseline, changes and preserved features, and an edited condition invalidates an imported version', async () => {
  const p = project()
  p.references = [{ id: 'source', name: 'reference.jpg', role: 'any', dataUrl: 'data:image/jpeg;base64,AA==' }]
  p.imagePrompt = { ...imagePrompt.createImagePrompt('source'), description: '낮의 작은 정원', preserve: '높은 시점', changes: '푸른 밤 정원으로' }
  const source = context.coachingContext(p).source
  p.promptCoaching = { ...handoff.createPromptCoaching(), draft: 'AI가 다듬은 밤 정원', draftSource: source, accepted: { text: 'AI가 다듬은 밤 정원', source, acceptedAt: 1 } }
  const ui = harness(p)
  let tree = ui.render()
  button(tree, '이미지와 변경 조건').props.onClick()
  tree = ui.render()
  assert.ok(text(output(tree)).includes('낮의 작은 정원'))
  assert.ok(text(output(tree)).includes('높은 시점'))
  assert.ok(text(output(tree)).includes('푸른 밤 정원으로'))
  await button(tree, '프롬프트 복사').props.onClick()
  assert.ok(ui.copied.at(-1)!.includes('바꿀 내용을 우선'))
  ui.update(p => ({ ...p, imagePrompt: { ...p.imagePrompt!, changes: '새벽의 분홍 정원으로' } }))
  tree = ui.render()
  button(tree, '코칭으로 다듬은 내용').props.onClick()
  tree = ui.render()
  assert.equal(button(tree, '프롬프트 복사').props.disabled, true)
  assert.equal(ui.project().promptCoaching!.accepted!.text, 'AI가 다듬은 밤 정원')
})

test('an image project with a missing source or description offers recovery instead of a generic ready prompt', () => {
  for (const missing of ['source', 'description']) {
    const p = project()
    p.references = missing === 'source' ? [] : [{ id: 'source', name: 'reference.jpg', role: 'any', dataUrl: 'data:image/jpeg;base64,AA==' }]
    p.imagePrompt = { ...imagePrompt.createImagePrompt('source'), description: missing === 'description' ? '' : '보관된 원본 설명', preserve: '보관된 유지 조건' }
    const source = context.coachingContext(p).source
    p.promptCoaching = { ...handoff.createPromptCoaching(), draft: 'AI 완성본도 보관', accepted: { text: 'AI 완성본도 보관', source, acceptedAt: 1 } }
    const ui = harness(p)
    const tree = ui.render()
    assert.match(text(tree), /원본 이미지와 설명을 먼저 확인/)
    assert.ok(button(tree, '이미지와 설명 확인하기'))
    assert.equal(nodes(tree).some(node => node.type === 'button' && text(node) === '프롬프트 복사'), false)
    assert.equal(ui.project().imagePrompt!.preserve, '보관된 유지 조건')
  }
})
