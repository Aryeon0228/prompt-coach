import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import * as handoff from '../src/lib/coach-handoff.ts'
import { coachingContext } from '../src/lib/coaching-context.ts'
import { buildMcpStarter } from '../src/lib/mcp-connection.ts'
import type { Project } from '../src/types.ts'

type Element = { type: unknown; props: Record<string, any> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/PromptCoaching.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function project(): Project {
  return { id: 'first', templateId: 'free-scene', name: '도서관', createdAt: 1, updatedAt: 1, decisions: {}, references: [], locks: [], iterations: [], freeform: createFreeBrief('유리구 안의 도서관', 'web'), promptCoaching: { ...handoff.createPromptCoaching(), draft: '  보관할 초안\n둘째 줄  ', draftSource: 'older source', notes: '이전 메모', accepted: { text: '기존 완성본', source: 'older source', acceptedAt: 1 } } }
}

function harness(initial: Project) {
  let saved = structuredClone(initial)
  const states: unknown[] = []
  const copied: string[] = []
  const toasts: string[] = []
  let copy: () => Promise<boolean> = async () => true
  let cursor = 0
  const exports: { PromptCoaching?: (props: unknown) => Element } = {}
  const jsx = (type: unknown, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, { exports, Date, requestAnimationFrame: (callback: () => void) => callback(), require(name: string) {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === 'react') return {
      useId: () => 'handoff', useEffect: (effect: () => void) => effect(),
      useRef(value: unknown) { return states[cursor++] ??= { current: value } },
      useState(value: unknown) {
        const index = cursor++
        if (!(index in states)) states[index] = typeof value === 'function' ? value() : value
        return [states[index], (next: unknown) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
    }
    if (name === '../store') return { useStore: () => ({ project: saved, updateProject: (update: (p: Project) => Project) => { saved = update(saved) } }) }
    if (name === '../lib/coach-handoff') return handoff
    if (name === '../lib/coaching-context') return { coachingContext }
    if (name === '../lib/mcp-connection') return { buildMcpStarter }
    if (name === './ui') return { copyText: async (text: string) => { copied.push(text); return copy() }, useToast: () => (message: string) => toasts.push(message) }
    if (name === './CoachConversation') return { CoachConversation: 'conversation' }
    if (name === './CoachConnection') return { CoachConnection: 'connection', CoachCompatibilityNotice: 'compatibility' }
    throw new Error(`Unexpected dependency: ${name}`)
  } })
  return {
    copied, toasts, project: () => structuredClone(saved),
    setProject(next: Project) { saved = structuredClone(next) },
    copyWith(next: () => Promise<boolean>) { copy = next },
    render() { cursor = 0; return exports.PromptCoaching!({ onPreview() {}, onEdit() {} }) },
  }
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const element = value as Element
  return [element, ...nodes(element.props.children)]
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('')
  if (typeof value === 'string') return value
  return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : ''
}
function find(tree: Element, predicate: (element: Element) => boolean): Element {
  const element = nodes(tree).find(predicate)
  assert.ok(element)
  return element
}
const copyButton = (tree: Element) => find(tree, element => element.type === 'button' && text(element).includes('장면과 코칭 요청 복사'))

test('copying the current scene retains imported drafts and records the exact source and request', async () => {
  const original = project()
  const ui = harness(original)
  const context = coachingContext(original)
  const request = buildMcpStarter({ medium: context.brief.mode, idea: context.brief.idea, requestText: handoff.buildCoachingRequest(context.brief, original.references, original.locks, context.session) })
  await copyButton(ui.render()).props.onClick()
  assert.deepEqual(ui.copied, [request])
  assert.equal(ui.project().promptCoaching!.request!.text, request)
  assert.equal(ui.project().promptCoaching!.request!.source, context.source)
  const { request: _request, ...savedCoaching } = ui.project().promptCoaching!
  assert.deepEqual(savedCoaching, original.promptCoaching)
})

test('failed clipboard access exposes manual copy without falsely recording success, and partial copies stay unrecorded', async () => {
  const ui = harness(project())
  ui.copyWith(async () => { throw new Error('Clipboard permission denied') })
  await copyButton(ui.render()).props.onClick()
  let tree = ui.render()
  assert.equal(ui.project().promptCoaching!.request, undefined)
  assert.equal(find(tree, element => element.type === 'details' && element.props.className === 'coaching-request-preview').props.open, true)
  const field = find(tree, element => element.type === 'textarea')
  field.props.onCopy({ defaultPrevented: false, currentTarget: { selectionStart: 1, selectionEnd: field.props.value.length } })
  assert.equal(ui.project().promptCoaching!.request, undefined)
  field.props.onCopy({ defaultPrevented: false, currentTarget: { selectionStart: 0, selectionEnd: field.props.value.length } })
  tree = ui.render()
  assert.equal(ui.project().promptCoaching!.request!.text, field.props.value)
  assert.equal(nodes(tree).some(element => element.props.role === 'alert'), false)
})

test('a clipboard completion after changing projects cannot write the prior scene into the new project', async () => {
  const ui = harness(project())
  let complete!: (success: boolean) => void
  ui.copyWith(() => new Promise(resolve => { complete = resolve }))
  const pending = copyButton(ui.render()).props.onClick()
  const second = { ...project(), id: 'second', freeform: createFreeBrief('바다 아래 정원', 'image'), promptCoaching: undefined }
  ui.setProject(second)
  ui.render()
  complete(true)
  await pending
  assert.deepEqual(ui.project(), second)
  assert.deepEqual(ui.toasts, [])
})
