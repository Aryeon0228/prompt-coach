import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import * as conversation from '../src/lib/coach-conversation.ts'
import * as handoff from '../src/lib/coach-handoff.ts'
import * as freePrompt from '../src/lib/free-prompt.ts'
import * as coachingContext from '../src/lib/coaching-context.ts'
import type { Project } from '../src/types.ts'

type Element = { type: string; props: Record<string, any> }
const compiled = ts.transpileModule(readFileSync(new URL('../src/components/CoachConversation.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText

function fixture(draft?: string): Project {
  const brief = freePrompt.createFreeBrief('안개 속 정원')
  const session = conversation.createGuidedSession(brief, handoff.coachingSource(brief, [], []))
  session.answers.purpose = { status: 'answered', text: '  어린이 동화책 표지\n왼쪽에는 제목 여백  ' }
  session.drafts.subject = '다른 항목의 작성 중인 답변'
  if (draft !== undefined) session.drafts.purpose = draft
  session.completed = true
  return { id: 'imported', name: '정원', templateId: 'free-scene', createdAt: 1, updatedAt: 1, freeform: brief, decisions: {}, references: [], locks: [], iterations: [], promptCoaching: { ...handoff.createPromptCoaching(), session } }
}

/** Run the actual component's handlers with a minimal in-memory React/store harness. */
function harness(initial: Project) {
  let project = structuredClone(initial)
  const states: unknown[] = []
  let cursor = 0
  let editField: conversation.CoachingField | undefined
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: string, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useId: () => 'test', useEffect: () => {}, useRef: (current: unknown) => ({ current }),
        useState(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = value
          return [states[index], (next: unknown) => { states[index] = next }]
        },
      }
      if (name === '../store') return { useStore: () => ({ project, updateProject: (change: (p: Project) => Project) => { project = change(project) } }) }
      if (name === '../lib/coach-conversation') return conversation
      if (name === '../lib/coach-handoff') return handoff
      if (name === '../lib/free-prompt') return freePrompt
      if (name === '../lib/coaching-context') return coachingContext
      if (name.endsWith('.css')) return {}
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return {
    project: () => project,
    editField: () => editField,
    render() { cursor = 0; return exports.CoachConversation({ onPreview() {}, onEdit(field?: conversation.CoachingField) { editField = field }, onHandoff() {} }) },
  }
}

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes)
  if (!value || typeof value !== 'object' || !('props' in value)) return []
  const node = value as Element
  return [node, ...nodes(node.props.children)]
}

function click(tree: Element, label: string) {
  const button = nodes(tree).find(node => node.type === 'button' && node.props.children === label)
  assert.ok(button, `Button ${label} exists`)
  assert.notEqual(button.props.disabled, true)
  button.props.onClick()
}

test('saved answers open the matching scene condition without changing the historical record', () => {
  const imported = fixture()
  const ui = harness(imported)
  click(ui.render(), '장면 설정에서 수정 →')
  assert.equal(ui.editField(), 'purpose')
  assert.deepEqual(ui.project(), imported)
  assert.equal(nodes(ui.render()).some(node => node.type === 'textarea'), false)
})

test('deferring an imported draft keeps exact text available for resuming into the scene condition', () => {
  const imported = JSON.parse(JSON.stringify(fixture())) as Project
  const originalText = imported.promptCoaching!.session!.answers.purpose!.text
  imported.promptCoaching!.session!.answers.purpose = { status: 'deferred', text: '' }
  imported.promptCoaching!.session!.drafts.purpose = originalText
  assert.equal(conversation.isGuidedSession(imported.promptCoaching!.session), true)
  const ui = harness(imported)
  click(ui.render(), '이어서 답하기')
  assert.equal(nodes(ui.render()).find(node => node.type === 'textarea')?.props.value, originalText)
  click(ui.render(), '지금은 보류')
  const deferred = ui.project().promptCoaching!.session!
  assert.equal(deferred.answers.purpose!.status, 'deferred')
  assert.equal(deferred.answers.purpose!.text, '')
  assert.equal(deferred.drafts.purpose, originalText)
  assert.equal(deferred.drafts.subject, imported.promptCoaching!.session!.drafts.subject)
  assert.equal(conversation.isGuidedSession(deferred), true)
  assert.equal(conversation.guidedBrief(imported.freeform!, deferred, deferred.source).purpose, '')
  click(ui.render(), '이어서 답하기')
  const resumed = ui.render()
  assert.equal(nodes(resumed).find(node => node.type === 'textarea')?.props.value, originalText)
  const form = nodes(resumed).find(node => node.type === 'form')
  assert.ok(form)
  form.props.onSubmit({ preventDefault() {} })
  assert.equal(ui.project().promptCoaching!.session!.answers.purpose!.text, originalText)
  assert.equal(ui.project().promptCoaching!.session!.answers.purpose!.status, 'answered')
  assert.deepEqual(ui.project().freeform, { ...imported.freeform, purpose: originalText })
  assert.equal(coachingContext.coachingContext(ui.project()).sessionStale, false)
})

test('deferring an edited answer preserves the current draft, including an intentionally empty draft', () => {
  for (const draft of ['  수정하던 새로운 용도\n', '']) {
    const ui = harness(fixture(draft))
    click(ui.render(), '작성 중인 답변 이어쓰기')
    click(ui.render(), '지금은 보류')
    const session = ui.project().promptCoaching!.session!
    assert.equal(session.drafts.purpose, draft)
    assert.equal(session.answers.purpose!.status, 'deferred')
    assert.equal(session.answers.purpose!.text, '')
  }
})
