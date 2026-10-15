import test from 'node:test';
import assert from 'node:assert/strict';
import { CoachController, parseCoachOutput, parseWidgetSnapshot, appendExample, defaultDraft, buildSubmission, submissionBudget, LIMITS } from '../ui/model.mjs';
import { openCoach, submitCoachInput, showCoach, MAX_STATE_BYTES } from '../coach-session.mjs';
const result = value => ({ structuredContent: value });
function fixture() {
  const calls = { submissions: 0, messages: 0, reject: false };
  const adapter = {
    submit: async args => { calls.submissions++; return result(submitCoachInput(args)); },
    sendMessage: async () => { calls.messages++; return { isError: calls.reject }; }, persist: () => {},
  };
  const controller = new CoachController(adapter);
  controller.setConnection('ready'); controller.receive(result(openCoach()));
  return { controller, adapter, calls };
}
async function start(controller) {
  controller.setDraft('medium', 'web'); controller.setDraft('idea', '보라빛 정원 🌷\n두 번째 줄을 보존해요.');
  await controller.submit('start');
  const question = showCoach({ state: controller.output.state, kind: 'question', question: '시선의 중심은?', why: '어디에 집중할지 결정해요.', topic: 'composition', examples: ['작은 고양이'] });
  controller.receive(result(question));
}
test('a host rejection retries only message delivery; exact answer and question history survive', async () => {
  const { controller, calls } = fixture(); await start(controller);
  calls.reject = true;
  controller.setDraft('answer', '고양이\n  빛은 은은하게.');
  await controller.submit('answer');
  assert.equal(controller.pending.delivery, 'failed');
  assert.equal(controller.output.coach.turns[0].text, '고양이\n  빛은 은은하게.');
  const n = calls.submissions; calls.reject = false;
  await controller.sendPending(); assert.equal(calls.submissions, n); assert.equal(controller.pending.delivery, 'sent');
  const saved = controller.snapshot(); assert.ok(parseWidgetSnapshot(saved));
  const restored = new CoachController({}, { restored: saved });
  restored.receive(result({ ...openCoach(), coach: { ...openCoach().coach, id: controller.output.coach.id, revision: 0 } }));
  assert.equal(restored.output.coach.id, controller.output.coach.id);
});
test('unsent answers require review confirmation and never enter confirmed prompt', async () => {
  const { controller, calls } = fixture(); await start(controller);
  controller.setDraft('answer', '아직 보내지 않은 초안');
  const count = calls.submissions; await controller.submit('review');
  assert.equal(controller.reviewConfirm, true); assert.equal(calls.submissions, count);
  await controller.submit('review', { discardUnsentForReview: true });
  assert.equal(controller.output.coach.turns.length, 0);
  assert.ok([...controller.drafts.values()].some(x => x.answer === '아직 보내지 않은 초안'));
  controller.receive(result(showCoach({ state: controller.output.state, kind: 'review', prompt: '확인할 프롬프트' })));
  controller.setDraft('prompt', '직접 고친 프롬프트');
  const messages = calls.messages; await controller.submit('confirm');
  assert.equal(controller.output.coach.finalPrompt, '직접 고친 프롬프트'); assert.equal(calls.messages, messages);
  await controller.openNewScene(); assert.match(controller.pending.request, /open_prompt_coach/);
});
test('failed submissions preserve drafts, restored widgets do not cross sessions, and examples are optional', async () => {
  const { controller, adapter } = fixture(); await start(controller);
  controller.setDraft('answer', '원문'); controller.chooseExample('예시');
  assert.equal(controller.draft.answer, '원문\n예시'); assert.equal(appendExample(controller.draft.answer, '예시'), '원문\n예시');
  const before = controller.output; adapter.submit = async () => ({ isError: true, content: [{ type: 'text', text: '서버 응답 실패' }] });
  await controller.submit('answer'); assert.equal(controller.output, before); assert.equal(controller.draft.answer, '원문\n예시');
  const restored = new CoachController({}, { restored: controller.snapshot() }); const other = openCoach(); restored.receive(result(other));
  assert.equal(restored.output.coach.id, other.coach.id); assert.equal(restored.draft.answer, '');
  assert.equal(parseCoachOutput({ coach: { phase: 'question' }, state: 'garbage' }), null);
});

test('AI revision receives the prompt edited by the user, not the original proposal', async () => {
  const { controller } = fixture(); await start(controller);
  await controller.submit('review');
  controller.receive(result(showCoach({ state: controller.output.state, kind: 'review', prompt: 'AI의 최초 검토본' })));
  controller.setDraft('prompt', '사용자가 직접 고친 검토본');
  controller.setDraft('revisionNote', '이 문장을 유지하면서 조명만 구체화해줘');
  await controller.submit('revise');
  assert.equal(controller.output.coach.turns.at(-1).previousPrompt, '사용자가 직접 고친 검토본');
  assert.match(controller.pending.request, /사용자가 직접 고친 검토본/);
});

test('hosts may deliver validated coach data through text content without structuredContent', () => {
  const opened = openCoach();
  assert.deepEqual(parseCoachOutput({ content: [{ type: 'text', text: JSON.stringify(opened) }] }), opened);
  assert.equal(parseCoachOutput({ content: [{ type: 'text', text: '<script>bad</script>' }] }), null);
});

test('submission budgets match the server snapshot bytes for every user action', () => {
  assert.equal(LIMITS.stateBytes, MAX_STATE_BYTES);
  const scene = openCoach({ medium: 'image', idea: '빛나는 정원 🌷\n"유리"와 \\ 반사' });
  const waiting = submitCoachInput({ state: scene.state, action: 'start', medium: scene.coach.medium, idea: scene.coach.idea });
  const question = showCoach({ state: waiting.state, kind: 'question', question: '어떤 빛인가요?', why: '분위기를 정해요.', examples: ['🌙 달빛'], topic: 'style' });
  const review = showCoach({ state: waiting.state, kind: 'review', prompt: '원래 검토본', summary: '정한 조건', unresolved: ['아직 미정'] });
  for (const [output, action] of [[scene, 'start'], [question, 'answer'], [question, 'defer'], [question, 'review'], [review, 'revise'], [review, 'confirm']]) {
    const draft = { ...defaultDraft(output.coach), answer: '달빛 🌙\n  "은은하게"', prompt: '직접 고친 장면 🌷\n"유리"', revisionNote: '이 표현은 그대로 둬요.' };
    const measured = submissionBudget(output, draft, action);
    const submitted = submitCoachInput(buildSubmission(output, draft, action));
    assert.equal(measured.bytes, new TextEncoder().encode(JSON.stringify(submitted.coach)).length, action);
    assert.equal(measured.exceeded, false, action);
  }
});

test('a 12000-character Korean edit is blocked before calling the server and stays intact', async () => {
  const { controller, calls } = fixture(); await start(controller);
  await controller.submit('review');
  controller.receive(result(showCoach({ state: controller.output.state, kind: 'review', prompt: '원래 검토본' })));
  const before = controller.output;
  const edited = '가'.repeat(LIMITS.prompt);
  controller.setDraft('prompt', edited);
  const count = calls.submissions;
  assert.equal(submissionBudget(controller.output, controller.draft, 'confirm').exceeded, true);
  assert.equal(await controller.submit('confirm'), false);
  assert.equal(calls.submissions, count);
  assert.equal(controller.output, before);
  assert.equal(controller.draft.prompt, edited);
  assert.match(controller.error, /전체 기록이 32 KB/);
  controller.setDraft('prompt', 'a'.repeat(LIMITS.prompt));
  assert.equal(await controller.submit('confirm'), true);
  assert.equal(controller.output.coach.finalPrompt, 'a'.repeat(LIMITS.prompt));
});

test('previous scene and answers count toward the budget without truncating a new answer', async () => {
  const { controller, calls } = fixture();
  controller.setDraft('medium', 'image'); controller.setDraft('idea', '가'.repeat(8000));
  await controller.submit('start');
  controller.receive(result(showCoach({ state: controller.output.state, kind: 'question', question: '어떤 빛인가요?', why: '분위기를 정해요.' })));
  const answer = '나'.repeat(3000);
  controller.setDraft('answer', answer);
  const count = calls.submissions;
  assert.equal(await controller.submit('answer'), false);
  assert.equal(calls.submissions, count);
  assert.equal(controller.draft.answer, answer);
  assert.equal(controller.output.coach.idea, '가'.repeat(8000));
  assert.equal(controller.output.coach.turns.length, 0);
});

test('exactly 32 KiB can be confirmed while one extra UTF-8 byte is blocked', () => {
  const scene = openCoach({ medium: 'image', idea: '정원' });
  const waiting = submitCoachInput({ state: scene.state, action: 'start', medium: 'image', idea: '정원' });
  const review = showCoach({ state: waiting.state, kind: 'review', prompt: '검토본' });
  const draft = defaultDraft(review.coach);
  draft.prompt = '';
  const remaining = MAX_STATE_BYTES - submissionBudget(review, draft, 'confirm').bytes;
  draft.prompt = '가'.repeat(Math.floor(remaining / 3)) + 'x'.repeat(remaining % 3);
  assert.ok(draft.prompt.length <= LIMITS.prompt);
  assert.equal(submissionBudget(review, draft, 'confirm').bytes, MAX_STATE_BYTES);
  assert.equal(submissionBudget(review, draft, 'confirm').nearLimit, true);
  const confirmed = submitCoachInput(buildSubmission(review, draft, 'confirm'));
  assert.equal(confirmed.coach.finalPrompt, draft.prompt);
  draft.prompt += 'x';
  assert.throws(() => buildSubmission(review, draft, 'confirm'), /전체 기록이 32 KB/);
});
