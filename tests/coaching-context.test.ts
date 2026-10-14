import assert from 'node:assert/strict'
import test from 'node:test'
import { coachingContext } from '../src/lib/coaching-context.ts'
import { createFreeBrief, assembleFreePrompt } from '../src/lib/free-prompt.ts'
import { createPromptCoaching, buildCoachingRequest, coachingSource } from '../src/lib/coach-handoff.ts'
import { createGuidedSession } from '../src/lib/coach-conversation.ts'
import type { Project } from '../src/types.ts'

function fixture(): Project {
  const freeform = createFreeBrief('  안개 낀 숲의 작은 집  ')
  const p: Project = { id: 'one', templateId: 'free-scene', name: '숲', createdAt: 1, updatedAt: 1, freeform, references: [], locks: [], decisions: {}, iterations: [] }
  const session = createGuidedSession(freeform, coachingSource(freeform, [], []))
  session.answers = { purpose: { status: 'answered', text: '  동화책의 표지\n아이들이 볼 그림  ' }, details: { status: 'deferred', text: '' } }
  session.drafts = { subject: '아직 저장하지 않은 동물' }
  p.promptCoaching = { ...createPromptCoaching(), session }
  return p
}

test('confirmed answers reach both prompt routes while draft, deferred and original stay separate', () => {
  const p = fixture()
  const before = structuredClone(p)
  const context = coachingContext(p)
  const prompt = assembleFreePrompt(context.brief)
  const request = buildCoachingRequest(context.brief, [], [], context.session)
  for (const text of [prompt, request]) {
    assert.ok(text.includes(p.freeform!.idea))
    assert.ok(text.includes(p.promptCoaching!.session!.answers.purpose!.text))
    assert.ok(!text.includes('아직 저장하지 않은 동물'))
  }
  assert.equal(context.answerCount, 1)
  assert.equal(context.sessionStale, false)
  assert.deepEqual(p, before)
  assert.equal(p.freeform!.purpose, '')
})

test('changing source excludes old answers from output and preserves all history', () => {
  for (const mutate of [
    (p: Project) => { p.freeform!.idea = '새로운 바닷속 장면' },
    (p: Project) => { p.freeform!.mode = 'video' },
    (p: Project) => { p.locks = ['집의 색 유지'] },
    (p: Project) => { p.references = [{ id: 'ref', name: 'ref.png', dataUrl: 'image', role: 'composition', note: '여백만 참고' }] },
  ]) {
    const p = fixture()
    const session = structuredClone(p.promptCoaching!.session)
    mutate(p)
    const context = coachingContext(p)
    assert.equal(context.sessionStale, true)
    assert.equal(context.answerCount, 0)
    assert.equal(context.session, undefined)
    assert.equal(context.brief.purpose, '')
    assert.deepEqual(p.promptCoaching!.session, session)
  }
})

test('resuming a reviewed source never replaces a newer original field', () => {
  const p = fixture()
  p.freeform!.purpose = '바뀐 용도: 전시장 안내'
  p.promptCoaching!.session!.source = coachingSource(p.freeform!, [], [])
  const context = coachingContext(p)
  assert.equal(context.sessionStale, false)
  assert.equal(context.brief.purpose, '바뀐 용도: 전시장 안내')
  assert.equal(context.answerCount, 0)
  assert.equal(p.promptCoaching!.session!.answers.purpose!.text, '  동화책의 표지\n아이들이 볼 그림  ')
})

test('editing an unsaved answer does not invalidate an accepted prompt but saving it does', () => {
  const p = fixture()
  const acceptedSource = coachingContext(p).source
  p.promptCoaching!.session!.drafts.purpose = '다르게 쓰다가 아직 저장하지 않았어요'
  p.promptCoaching!.session!.completed = true
  assert.equal(coachingContext(p).source, acceptedSource)
  p.promptCoaching!.session!.answers.purpose!.text = '완성해서 저장한 새 답변'
  assert.notEqual(coachingContext(p).source, acceptedSource)
})
