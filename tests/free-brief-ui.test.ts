import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as freePrompt from '../src/lib/free-prompt.ts'
import * as freeModes from '../src/lib/free-modes.ts'
import * as conditions from '../src/lib/coaching-context.ts'
import { coachingSource, createPromptCoaching } from '../src/lib/coach-handoff.ts'
import { createGuidedSession } from '../src/lib/coach-conversation.ts'
import type { Project } from '../src/types.ts'

type Element = { type: string; props: Record<string, any> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/FreeBrief.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(): Project {
  const freeform = freePrompt.createFreeBrief('바닷속 도서관')
  const session = createGuidedSession(freeform, coachingSource(freeform, [], []))
  session.answers.purpose = { status: 'answered', text: '포트폴리오의 첫 화면' }
  session.answers.subject = { status: 'answered', text: '고래 한 마리' }
  return { id: 'one', templateId: 'free-scene', name: '도서관', createdAt: 1, updatedAt: 1, freeform, references: [], locks: [], decisions: {}, iterations: [], promptCoaching: { ...createPromptCoaching(), session } }
}

function harness(initial: Project) {
  let project = structuredClone(initial)
  let writes = 0
  let focused = ''
  let focusCount = 0
  const states: unknown[] = []
  const refs: Array<{ current: unknown }> = []
  let cursor = 0
  let refCursor = 0
  const effects: Array<() => void> = []
  const dependencies: unknown[][] = []
  let effectCursor = 0
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: string, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports,
    requestAnimationFrame: (callback: () => void) => { callback(); return 1 },
    cancelAnimationFrame() {},
    document: { getElementById: (id: string) => ({ focus() { focused = id; focusCount += 1 } }) },
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useRef: (current: unknown) => {
          const index = refCursor++
          if (!refs[index]) refs[index] = { current }
          return refs[index]
        },
        useEffect(effect: () => void, deps: unknown[]) {
          const index = effectCursor++
          if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) effects.push(effect)
          dependencies[index] = deps
        },
        useState(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = value
          return [states[index], (next: unknown) => { states[index] = next }]
        },
      }
      if (name === '../store') return { useStore: () => ({ project, updateProject: (change: (p: Project) => Project) => { writes += 1; project = change(project) } }) }
      if (name === '../lib/free-prompt') return freePrompt
      if (name === '../lib/free-modes') return freeModes
      if (name === '../lib/coaching-context') return conditions
      if (name === './CoachingMethodChoices') return { CoachingMethodChoices: 'method-choices' }
      if (name === './PromptGuide') return { PromptGuide: () => null }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return {
    project: () => project,
    writes: () => writes,
    focused: () => focused,
    focusCount: () => focusCount,
    render(props = {}) {
      cursor = 0
      refCursor = 0
      effectCursor = 0
      const tree = exports.FreeBrief({ onPreview() {}, onRefine() {}, onReferences() {}, ...props })
      while (effects.length) effects.shift()!()
      return tree
    },
  }
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...nodes(node.props.children)]
}

test('scene editor shows legacy confirmed values without a mount write and edits the value used in the prompt', () => {
  const original = fixture()
  const ui = harness(original)
  const tree = ui.render()
  assert.equal(ui.writes(), 0)
  const purpose = nodes(tree).find(node => node.type === 'textarea' && node.props.id === 'free-purpose')!
  assert.equal(purpose.props.value, '포트폴리오의 첫 화면')
  purpose.props.onChange({ target: { value: '전시 공간의 안내 화면' } })
  assert.equal(conditions.coachingContext(ui.project()).brief.purpose, '전시 공간의 안내 화면')
  assert.equal(conditions.coachingContext(ui.project()).brief.subject, '고래 한 마리')
  assert.equal(conditions.coachingContext(ui.project()).sessionStale, false)
  const afterEdit = nodes(ui.render()).find(node => node.type === 'textarea' && node.props.id === 'free-purpose')!
  assert.equal(afterEdit.props.value, '전시 공간의 안내 화면')
  afterEdit.props.onChange({ target: { value: '' } })
  assert.equal(conditions.coachingContext(ui.project()).brief.purpose, '')
  assert.equal(ui.project().promptCoaching!.session!.answers.purpose!.text, original.promptCoaching!.session!.answers.purpose!.text)
})

test('an exact history field opens its condition group and focuses that editor on each navigation request', () => {
  const ui = harness(fixture())
  ui.render({ focusField: 'composition', focusKey: 1 })
  const tree = ui.render({ focusField: 'composition', focusKey: 1 })
  const group = nodes(tree).find(node => node.props.id === 'free-group-1')!
  assert.equal(group.props.hidden, false)
  assert.equal(ui.focused(), 'free-composition')
  ui.render({ focusField: 'style', focusKey: 2 })
  assert.equal(ui.focused(), 'free-style')
  const nextTree = ui.render({ focusField: 'style', focusKey: 2 })
  assert.equal(nodes(nextTree).find(node => node.props.id === 'free-group-2')?.props.hidden, false)
  const count = ui.focusCount()
  ui.project().freeform!.mode = 'web'
  ui.render({ focusField: 'style', focusKey: 2 })
  assert.equal(ui.focusCount(), count)
  ui.render()
  ui.render({ focusField: 'style', focusKey: 2 })
  assert.equal(ui.focusCount(), count)
  ui.render({ focusField: 'style', focusKey: 3 })
  assert.equal(ui.focusCount(), count + 1)
  assert.equal(ui.writes(), 0)
})


test('scene preparation passes the chosen question destination without changing saved conditions', () => {
  const original = fixture()
  const ui = harness(original)
  const destinations: string[] = []
  const tree = ui.render({ onRefine: (method: string) => destinations.push(method) })
  const choices = nodes(tree).find(node => node.type === 'method-choices')!
  choices.props.onChoose('guide')
  choices.props.onChoose('chatgpt')
  assert.deepEqual(destinations, ['guide', 'chatgpt'])
  assert.deepEqual(ui.project(), original)
  assert.equal(ui.writes(), 0)
})
