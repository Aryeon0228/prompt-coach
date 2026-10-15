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
  const refs: Array<{ current: unknown }> = []
  let cursor = 0
  let refCursor = 0
  let updates = 0
  let editField: conversation.CoachingField | undefined
  const exports: Record<string, (props: unknown) => Element> = {}
  const jsx = (type: string, props: Element['props']) => ({ type, props })
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useId: () => 'test', useEffect: () => {},
        useRef(current: unknown) {
          const index = refCursor++
          return refs[index] ?? (refs[index] = { current })
        },
        useState(value: unknown) {
          const index = cursor++
          if (!(index in states)) states[index] = value
          return [states[index], (next: unknown) => { states[index] = next }]
        },
      }
      if (name === '../store') return { useStore: () => ({ project, updateProject: (change: (p: Project) => Project) => { project = change(project); updates++ } }) }
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
    replaceProject: (next: Project) => { project = next },
    updates: () => updates,
    editField: () => editField,
    render() { cursor = 0; refCursor = 0; return exports.CoachConversation({ onPreview() {}, onEdit(field?: conversation.CoachingField) { editField = field }, onHandoff() {} }) },
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

test('finish confirms the active draft and completion atomically while preserving other records', () => {
  const original = fixture()
  const session = original.promptCoaching!.session!
  session.completed = false
  session.drafts.subject = '  유리구 안의 작은 섬\n중앙에는 집 한 채  '
  session.answers.style = { status: 'deferred', text: '' }
  session.drafts.style = '분위기는 아직 고민 중'
  session.drafts.composition = '다른 질문에서 이어 쓸 시점'
  const ui = harness(original)

  click(ui.render(), '답변 저장하고 마치기')

  const result = ui.project()
  const finished = result.promptCoaching!.session!
  assert.equal(ui.updates(), 1, 'answer and completion must be one project update')
  assert.equal(finished.completed, true)
  assert.deepEqual(finished.answers.subject, { status: 'answered', text: session.drafts.subject })
  assert.deepEqual(finished.answers.purpose, session.answers.purpose)
  assert.deepEqual(finished.answers.style, session.answers.style)
  assert.deepEqual(finished.drafts, session.drafts)
  assert.equal(result.freeform!.subject, session.drafts.subject)
  assert.equal(result.freeform!.purpose, session.answers.purpose!.text)
  assert.equal(result.freeform!.composition, '', 'other unfinished answers stay drafts')
  assert.equal(coachingContext.coachingContext(result).sessionStale, false)
  assert.equal(conversation.isGuidedSession(finished), true)
  assert.equal(finished.source, handoff.coachingSource(result.freeform!, result.references, result.locks))
})

test('finish without an answer explicitly leaves the empty question unconfirmed', () => {
  for (const draft of ['', '  \n ']) {
    const original = fixture()
    original.promptCoaching!.session!.completed = false
    original.promptCoaching!.session!.drafts.subject = draft
    const ui = harness(original)
    const tree = ui.render()
    assert.equal(nodes(tree).some(node => node.type === 'button' && node.props.children === '답변 저장하고 마치기'), false)
    click(tree, '답변 없이 마치기')
    assert.equal(ui.updates(), 1)
    assert.equal(ui.project().promptCoaching!.session!.completed, true)
    assert.deepEqual(ui.project().promptCoaching!.session!.answers, original.promptCoaching!.session!.answers)
    assert.deepEqual(ui.project().promptCoaching!.session!.drafts, original.promptCoaching!.session!.drafts)
    assert.deepEqual(ui.project().freeform, original.freeform)
  }
})

test('finish uses the latest draft and rejects callbacks for a changed scene or project', () => {
  const original = fixture()
  original.promptCoaching!.session!.completed = false
  const ui = harness(original)
  const tree = ui.render()
  const answer = nodes(tree).find(node => node.type === 'textarea')!
  answer.props.onChange({ target: { value: '최종 글자까지 남겨 주세요' } })
  click(tree, '답변 저장하고 마치기')
  assert.equal(ui.project().freeform!.subject, '최종 글자까지 남겨 주세요')

  for (const change of [
    (project: Project) => ({ ...project, id: 'another-project' }),
    (project: Project) => ({ ...project, locks: ['장면이 바뀐 조건'] }),
  ]) {
    const guarded = harness(original)
    const oldTree = guarded.render()
    const changed = change(structuredClone(original))
    guarded.replaceProject(changed)
    click(oldTree, '답변 저장하고 마치기')
    assert.deepEqual(guarded.project(), changed)
  }
})

test('IME composition cannot submit or finish an incomplete Korean answer', () => {
  const original = fixture()
  original.promptCoaching!.session!.completed = false
  const ui = harness(original)
  let tree = ui.render()
  const textarea = nodes(tree).find(node => node.type === 'textarea')!
  textarea.props.onCompositionStart()
  textarea.props.onChange({ target: { value: '유리구 안의 작은 서' } })
  tree = ui.render()
  const form = nodes(tree).find(node => node.type === 'form')!
  form.props.onSubmit({ preventDefault() {}, nativeEvent: { isComposing: true } })
  form.props.onSubmit({ preventDefault() {}, nativeEvent: {} })
  click(tree, '답변 저장하고 마치기')
  assert.equal(ui.project().promptCoaching!.session!.completed, false)
  assert.equal(ui.project().promptCoaching!.session!.answers.subject, undefined)
  assert.equal(ui.project().freeform!.subject, '')

  nodes(tree).find(node => node.type === 'textarea')!.props.onCompositionEnd({ currentTarget: { value: '유리구 안의 작은 섬' } })
  click(ui.render(), '답변 저장하고 마치기')
  assert.equal(ui.project().freeform!.subject, '유리구 안의 작은 섬')
  assert.equal(ui.project().promptCoaching!.session!.completed, true)
})
