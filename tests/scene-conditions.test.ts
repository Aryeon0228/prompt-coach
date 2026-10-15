import assert from 'node:assert/strict'
import test from 'node:test'
import { adoptReviewedConditions, coachingContext, confirmGuidedAnswer, updateSceneCondition } from '../src/lib/coaching-context.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import { coachingSource, createPromptCoaching } from '../src/lib/coach-handoff.ts'
import { createGuidedSession, isGuidedSession, nextCoachingQuestion } from '../src/lib/coach-conversation.ts'
import type { Project } from '../src/types.ts'

function fixture(): Project {
  const freeform = { ...createFreeBrief('  안개 속 작은 도서관  '), constraints: '원래 장면의 제약' }
  const session = createGuidedSession(freeform, coachingSource(freeform, [], []))
  session.answers = {
    purpose: { status: 'answered', text: '  아이들이 볼 동화책 표지\n' },
    subject: { status: 'answered', text: '고래 한 마리' },
    details: { status: 'deferred', text: '' },
    constraints: { status: 'answered', text: '이전 답변의 제약' },
  }
  session.drafts = { style: '아직 확정하지 않은 빛', purpose: '작성 중인 다른 용도', details: '보류한 세부 조건' }
  const project: Project = { id: 'one', templateId: 'free-scene', name: '도서관', createdAt: 1, updatedAt: 1, freeform, references: [], locks: [], decisions: {}, iterations: [], promptCoaching: { ...createPromptCoaching(), session, notes: '내 메모' } }
  const source = coachingContext(project).source
  project.promptCoaching!.accepted = { text: '이전에 확인한 프롬프트', source, acceptedAt: 1 }
  project.promptCoaching!.request = { text: '기존 요청문', source, copiedAt: 1 }
  project.promptCoaching!.draft = '가져와서 편집 중인 프롬프트'
  project.promptCoaching!.draftSource = source
  return project
}

test('legacy condition materialization preserves the effective source and every saved record', () => {
  const before = fixture()
  const context = coachingContext(before)
  assert.equal(before.freeform!.purpose, '')
  const migrated = adoptReviewedConditions(before)
  assert.deepEqual(migrated.freeform, context.brief)
  assert.equal(migrated.promptCoaching!.session!.conditionsApplied, true)
  assert.equal(coachingContext(migrated).source, context.source)
  assert.equal(coachingContext(migrated).sessionStale, false)
  for (const key of ['accepted', 'request', 'draft', 'draftSource', 'notes'] as const) {
    assert.deepEqual(migrated.promptCoaching![key], before.promptCoaching![key])
  }
  assert.deepEqual(migrated.promptCoaching!.session!.answers, before.promptCoaching!.session!.answers)
  assert.deepEqual(migrated.promptCoaching!.session!.drafts, before.promptCoaching!.session!.drafts)
  assert.equal(before.freeform!.purpose, '')
  assert.equal(isGuidedSession(JSON.parse(JSON.stringify(migrated.promptCoaching!.session))), true)
})

test('clearing a legacy or already migrated condition cannot resurrect its recorded answer', () => {
  for (const before of [fixture(), adoptReviewedConditions(fixture())]) {
    const changed = updateSceneCondition(before, 'purpose', '')
    const reopened = JSON.parse(JSON.stringify(changed)) as Project
    assert.equal(coachingContext(reopened).brief.purpose, '')
    assert.equal(coachingContext(reopened).brief.subject, '고래 한 마리')
    assert.equal(coachingContext(reopened).sessionStale, false)
    assert.deepEqual(reopened.promptCoaching!.session!.answers, before.promptCoaching!.session!.answers)
    assert.deepEqual(reopened.promptCoaching!.session!.drafts, before.promptCoaching!.session!.drafts)
    assert.notEqual(coachingContext(reopened).source, before.promptCoaching!.accepted!.source)
  }
})

test('editing one ordinary condition keeps the others active and history unchanged', () => {
  const before = fixture()
  const changed = updateSceneCondition(before, 'constraints', '새로운 제약')
  const context = coachingContext(changed)
  assert.equal(context.brief.constraints, '새로운 제약')
  assert.equal(context.brief.purpose, before.promptCoaching!.session!.answers.purpose!.text)
  assert.equal(context.brief.subject, '고래 한 마리')
  assert.equal(context.brief.style, '')
  assert.equal(context.sessionStale, false)
  assert.deepEqual(changed.promptCoaching!.session!.answers, before.promptCoaching!.session!.answers)
  assert.deepEqual(changed.promptCoaching!.session!.drafts, before.promptCoaching!.session!.drafts)
})

test('idea and medium changes keep old sessions for review instead of implicitly adopting them', () => {
  for (const changed of [updateSceneCondition(fixture(), 'idea', '새로운 바다'), updateSceneCondition(fixture(), 'mode', 'web')]) {
    assert.equal(coachingContext(changed).sessionStale, true)
    assert.equal(coachingContext(changed).brief.purpose, '')
    assert.deepEqual(changed.promptCoaching!.session, fixture().promptCoaching!.session)
  }
})

test('editing an already stale scene never consumes old answers; explicit review fills only empty fields', () => {
  const stale = updateSceneCondition(fixture(), 'idea', '새로운 바다')
  const edited = updateSceneCondition(stale, 'purpose', '새 장면의 전시 안내')
  assert.equal(coachingContext(edited).sessionStale, true)
  assert.equal(edited.freeform!.subject, '')
  assert.deepEqual(edited.promptCoaching!.session, stale.promptCoaching!.session)
  const reviewed = adoptReviewedConditions(edited)
  assert.equal(coachingContext(reviewed).sessionStale, false)
  assert.equal(reviewed.freeform!.purpose, '새 장면의 전시 안내')
  assert.equal(reviewed.freeform!.subject, '고래 한 마리')
  assert.equal(reviewed.freeform!.constraints, '원래 장면의 제약')
  assert.equal(reviewed.promptCoaching!.session!.drafts.style, '아직 확정하지 않은 빛')
})

test('draft edits preserve accepted source; confirming writes the actual scene condition and changes source', () => {
  const before = fixture()
  before.promptCoaching!.session!.drafts.style = '내가 확정할 빛'
  assert.equal(coachingContext(before).source, before.promptCoaching!.accepted!.source)
  const confirmed = confirmGuidedAnswer(before, 'style')
  assert.equal(confirmed.freeform!.style, '내가 확정할 빛')
  assert.equal(confirmed.promptCoaching!.session!.answers.style!.text, '내가 확정할 빛')
  assert.equal(coachingContext(confirmed).brief.subject, '고래 한 마리')
  assert.equal(coachingContext(confirmed).sessionStale, false)
  assert.notEqual(coachingContext(confirmed).source, before.promptCoaching!.accepted!.source)
  assert.deepEqual(confirmed.promptCoaching!.accepted, before.promptCoaching!.accepted)
  assert.equal(confirmed.promptCoaching!.session!.drafts.details, '보류한 세부 조건')
})

test('deferring an unfinished revision preserves its exact draft and the current scene condition', () => {
  for (const draft of ['  새로 쓰던 용도\n', '']) {
    const before = fixture()
    before.promptCoaching!.session!.drafts.purpose = draft
    const deferred = confirmGuidedAnswer(before, 'purpose', true)
    assert.equal(deferred.freeform!.purpose, before.promptCoaching!.session!.answers.purpose!.text)
    assert.equal(deferred.promptCoaching!.session!.drafts.purpose, draft)
    assert.deepEqual(deferred.promptCoaching!.session!.answers.purpose, { status: 'deferred', text: '' })
    assert.equal(coachingContext(deferred).sessionStale, false)
  }
})

test('a deferred answer can be completed without overwriting other conditions or drafts', () => {
  const before = fixture()
  const confirmed = confirmGuidedAnswer(before, 'details')
  assert.equal(confirmed.freeform!.details, '보류한 세부 조건')
  assert.equal(confirmed.promptCoaching!.session!.answers.details!.status, 'answered')
  assert.equal(confirmed.promptCoaching!.session!.drafts.style, '아직 확정하지 않은 빛')
  assert.equal(nextCoachingQuestion(confirmed.freeform!, confirmed.promptCoaching!.session!)?.field, 'composition')
})

test('oversized input remains saved with a valid, stale session instead of corrupting its source snapshot', () => {
  const before = fixture()
  const changed = updateSceneCondition(before, 'style', '빛'.repeat(100_001))
  assert.equal(changed.freeform!.style.length, 100_001)
  assert.equal(changed.freeform!.subject, '고래 한 마리')
  assert.equal(isGuidedSession(changed.promptCoaching!.session), true)
  assert.equal(coachingContext(changed).sessionStale, true)
  assert.equal(adoptReviewedConditions(changed), changed)
  const shorter = updateSceneCondition(changed, 'style', '적당한 빛')
  const reviewed = adoptReviewedConditions(shorter)
  assert.equal(coachingContext(reviewed).sessionStale, false)
  assert.equal(reviewed.freeform!.style, '적당한 빛')
})

test('existing source mismatches cannot be changed by the answer confirmation helper', () => {
  const before = fixture()
  before.references = [{ id: 'ref', role: 'composition', note: '새 참고', name: 'ref', dataUrl: '' }]
  assert.equal(confirmGuidedAnswer(before, 'style'), before)
  const applied = adoptReviewedConditions(fixture())
  applied.locks = ['새 유지 조건']
  assert.equal(coachingContext(applied).sessionStale, true)
  assert.equal(confirmGuidedAnswer(applied, 'style'), applied)
})

test('session validation remains compatible and permits only the explicit migrated marker', () => {
  const session = fixture().promptCoaching!.session!
  assert.equal(isGuidedSession(session), true)
  assert.equal(isGuidedSession({ ...session, conditionsApplied: true }), true)
  for (const invalid of [false, null, 1, 'true']) assert.equal(isGuidedSession({ ...session, conditionsApplied: invalid }), false)
})
