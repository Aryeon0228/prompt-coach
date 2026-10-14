import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { COACHING_ANSWER_LIMIT, createGuidedSession, getCoachingQuestions, guidedBrief, isGuidedSession, nextCoachingQuestion } from '../src/lib/coach-conversation.ts'
import { createFreeBrief } from '../src/lib/free-prompt.ts'
import type { FreePromptMode } from '../src/lib/free-prompt.ts'

test('each medium has seven ordered questions with reasons and optional examples', () => {
  for (const mode of ['image', 'video', 'web'] as FreePromptMode[]) {
    const questions = getCoachingQuestions(createFreeBrief('정원', mode))
    assert.deepEqual(questions.map((item) => item.field), ['purpose', 'subject', 'composition', 'style', 'details', 'constraints', 'success'])
    for (const item of questions) {
      assert.ok(item.question.length > 0)
      assert.ok(item.why.length > 0)
      assert.ok(item.examples.length >= 2)
    }
  }
  const video = getCoachingQuestions(createFreeBrief('', 'video'))
  const web = getCoachingQuestions(createFreeBrief('', 'web'))
  assert.ok(video.find((item) => item.field === 'subject')!.question.includes('시작과 끝'))
  assert.ok(video.find((item) => item.field === 'details')!.question.includes('소리'))
  assert.ok(web.find((item) => item.field === 'details')!.question.includes('클릭·드래그'))
  assert.ok(web.find((item) => item.field === 'constraints')!.question.includes('기기'))
  video[0].examples[0] = '변경'
  assert.notEqual(getCoachingQuestions(createFreeBrief('', 'video'))[0].examples[0], '변경')
})

test('new sessions are empty, independent and retain the exact original source', () => {
  const brief = createFreeBrief('도서관')
  const session = createGuidedSession(brief, 'source')
  assert.deepEqual(session, { source: 'source', mode: 'image', answers: {}, drafts: {}, completed: false })
  assert.equal(isGuidedSession(session), true)
  session.drafts.purpose = '작성 중'
  assert.deepEqual(createGuidedSession(brief, 'source').drafts, {})
})

test('next question skips filled fields and confirmed or deferred answers, but not unsent drafts', () => {
  const brief = { ...createFreeBrief('도서관'), purpose: '표지', composition: '왼쪽 여백' }
  const session = createGuidedSession(brief, 'source')
  assert.equal(nextCoachingQuestion(brief, session)?.field, 'subject')
  session.answers.subject = { status: 'answered', text: '고래 한 마리' }
  session.answers.style = { status: 'deferred', text: '' }
  session.drafts.details = '불빛이 하나'
  assert.equal(nextCoachingQuestion(brief, session)?.field, 'details')
  session.answers.details = { status: 'answered', text: '불빛이 하나' }
  session.answers.constraints = { status: 'deferred', text: '' }
  session.answers.success = { status: 'answered', text: '고래 전체가 보인다' }
  assert.equal(nextCoachingQuestion(brief, session), undefined)
  assert.equal(getCoachingQuestions(brief).length, 7)
})

test('presence checks never infer an answer from a different field or medium', () => {
  const brief = createFreeBrief('표지로 쓸 이미지. 고래 한 마리가 주인공.')
  const session = createGuidedSession(brief, 'source')
  assert.equal(nextCoachingQuestion(brief, session)?.field, 'purpose')
  session.answers.purpose = { status: 'answered', text: '표지' }
  assert.equal(nextCoachingQuestion({ ...brief, mode: 'video' }, session)?.field, 'purpose')
})

test('guided answers fill only empty fields without rewriting the brief, whitespace or saved drafts', () => {
  const brief = { ...createFreeBrief('  원래 아이디어\n '), purpose: ' 원래 목적 ', details: ' \n' }
  const session = createGuidedSession(brief, 'base')
  session.answers.purpose = { status: 'answered', text: '대체하면 안 되는 목적' }
  session.answers.subject = { status: 'answered', text: '  고래 한 마리\n ' }
  session.answers.details = { status: 'answered', text: '  창문에 물방울  ' }
  session.answers.style = { status: 'deferred', text: '' }
  session.drafts.style = '아직 정하지 않은 보라빛'
  session.drafts.constraints = '보내지 않은 조건'
  const before = JSON.stringify({ brief, session })
  const effective = guidedBrief(brief, session, 'base')
  assert.equal(effective.purpose, brief.purpose)
  assert.equal(effective.idea, brief.idea)
  assert.equal(effective.subject, session.answers.subject.text)
  assert.equal(effective.details, session.answers.details.text)
  assert.equal(effective.style, '')
  assert.equal(effective.constraints, '')
  assert.equal(JSON.stringify({ brief, session }), before)
})

test('stale or absent sessions never enter the assembled brief', () => {
  const brief = createFreeBrief('도서관')
  const session = createGuidedSession(brief, 'old source')
  session.answers.subject = { status: 'answered', text: '고래 한 마리' }
  assert.deepEqual(guidedBrief(brief, session, 'new source'), brief)
  assert.deepEqual(guidedBrief({ ...brief, mode: 'web' }, session, 'old source'), { ...brief, mode: 'web' })
  assert.deepEqual(guidedBrief(brief, undefined, 'old source'), brief)
})

test('validated JSON sessions preserve confirmed answers, deferred text drafts and completion exactly', () => {
  const session = createGuidedSession(createFreeBrief('정원', 'web'), 'source')
  session.answers.subject = { status: 'answered', text: '  나무 세 그루\n' }
  session.answers.style = { status: 'deferred', text: '' }
  session.drafts.style = '  색은 아직 정하지 못함\n'
  session.completed = true
  const restored = JSON.parse(JSON.stringify(session))
  const before = JSON.stringify(restored)
  assert.equal(isGuidedSession(restored), true)
  assert.equal(JSON.stringify(restored), before)
  assert.deepEqual(restored, session)
  assert.equal(isGuidedSession({ ...session, source: 's'.repeat(100_000), drafts: { style: 'x'.repeat(COACHING_ANSWER_LIMIT) }, answers: { purpose: { status: 'answered', text: 'x'.repeat(COACHING_ANSWER_LIMIT) } } }), true)
})

test('session validator rejects missing fields, unsafe shapes, unknown topics and oversized content', () => {
  const session = createGuidedSession(createFreeBrief(), 'source')
  const invalid: unknown[] = [
    null, [], '', {}, new Date(), Object.create(session), Object.create(null),
    { ...session, source: '' }, { ...session, source: ' \n ' }, { ...session, source: 3 }, { ...session, source: 'x'.repeat(100_001) },
    { ...session, mode: 'sound' }, { ...session, completed: 1 }, { ...session, extra: true },
    { ...session, answers: null }, { ...session, answers: [] }, { ...session, answers: Object.create({ purpose: { status: 'answered', text: '숨겨진 답' } }) },
    { ...session, answers: { idea: { status: 'answered', text: '원문 덮어쓰기' } } },
    { ...session, answers: { purpose: undefined } },
    { ...session, answers: { purpose: { status: 'answered', text: ' \n' } } },
    { ...session, answers: { purpose: { status: 'deferred', text: '미확정 내용' } } },
    { ...session, answers: { purpose: { status: 'unknown', text: '' } } },
    { ...session, answers: { purpose: { status: 'answered', text: '답', extra: true } } },
    { ...session, answers: { purpose: { status: 'answered', text: 'x'.repeat(COACHING_ANSWER_LIMIT + 1) } } },
    { ...session, drafts: { mode: 'image' } }, { ...session, drafts: { purpose: null } },
    { ...session, drafts: { purpose: 'x'.repeat(COACHING_ANSWER_LIMIT + 1) } },
    { ...session, [Symbol('hidden')]: 'extra' },
    { ...session, answers: JSON.parse('{"__proto__":{"status":"answered","text":"bad"}}') },
    { ...session, drafts: JSON.parse('{"constructor":"bad"}') },
    { ...session, drafts: Object.create({ purpose: 'hidden' }) },
  ]
  for (const field of Object.keys(session)) {
    const missing = { ...session } as Record<string, unknown>
    delete missing[field]
    invalid.push(missing)
  }
  for (const value of invalid) assert.equal(isGuidedSession(value), false)
})

test('validation accepts plain JSON from another realm and rejects custom instance prototypes', () => {
  const session = createGuidedSession(createFreeBrief('정원'), 'source')
  session.answers.subject = { status: 'answered', text: '나무 세 그루' }
  session.drafts.style = '고민 중'
  const foreign = vm.runInNewContext('JSON.parse(serialized)', { serialized: JSON.stringify(session) })
  assert.equal(isGuidedSession(foreign), true)
  assert.equal(isGuidedSession(Object.assign(Object.create(null), session)), true)
  assert.equal(isGuidedSession(Object.assign(new (class CustomSession {})(), session)), false)
  assert.equal(isGuidedSession(Object.assign(Object.create(Object.create(null)), session)), false)
})
