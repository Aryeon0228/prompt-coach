import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { CoachController, LIMITS } from '../ui/model.mjs';
import { createCoachView } from '../ui/view.mjs';
import { openCoach, submitCoachInput, showCoach } from '../coach-session.mjs';

const output = (value) => ({ structuredContent: value });
const fields = [
  { field: 'idea', button: '코칭 시작하기', limit: LIMITS.idea },
  { field: 'answer', button: '답변 보내기', limit: LIMITS.answer },
  { field: 'prompt', button: '이 프롬프트로 확정', limit: LIMITS.prompt },
  { field: 'revisionNote', button: '수정 요청 보내기', limit: LIMITS.answer },
];

function fixture(t, field, { idea = '유리구 안의 작은 정원' } = {}) {
  const window = new Window({ url: 'https://coach.example.test/' });
  t.after(() => window.happyDOM.abort());
  const document = window.document;
  const root = document.createElement('main');
  document.body.append(root);
  const calls = { submissions: [], messages: [] };
  const adapter = {
    submit: async (args) => { calls.submissions.push(args); return output(submitCoachInput(args)); },
    sendMessage: async (message) => { calls.messages.push(message); return {}; },
    persist: () => {},
  };
  let view;
  const controller = new CoachController(adapter, { onChange: () => view?.render() });
  controller.setConnection('ready');
  let state = openCoach({ medium: 'web' });
  if (field !== 'idea') {
    state = submitCoachInput({ state: state.state, action: 'start', medium: 'web', idea });
    state = field === 'answer'
      ? showCoach({ state: state.state, kind: 'question', question: '어디에서 바라볼까요?', why: '보이는 공간의 범위를 정해요.', examples: ['정면에서 바라보기'] })
      : showCoach({ state: state.state, kind: 'review', prompt: '유리구 안의 작은 정원을 눈높이에서 바라본다.' });
  }
  controller.receive(output(state));
  view = createCoachView(root, controller, adapter);
  view.render();
  if (field === 'revisionNote') document.getElementById('revise-details').open = true;
  const textarea = document.getElementById(`coach-${field}`);
  const nativeValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  let rendererValueWrites = 0;
  Object.defineProperty(textarea, 'value', {
    configurable: true,
    get() { return nativeValue.get.call(this); },
    set(value) { rendererValueWrites++; nativeValue.set.call(this, value); },
  });
  const ancestors = [];
  for (let node = textarea; node && node !== root; node = node.parentNode) ancestors.push(node);
  const mutations = [];
  const observer = new window.MutationObserver((records) => mutations.push(...records));
  observer.observe(root, { childList: true, subtree: true });
  t.after(() => observer.disconnect());

  function nativeEdit(value, { inputType = 'insertText', isComposing = false, dispatch = true, start = value.length, end = start } = {}) {
    // A native edit changes the element's internal value; it is not a renderer assignment.
    nativeValue.set.call(textarea, value);
    textarea.setSelectionRange(start, end, 'backward');
    if (dispatch) textarea.dispatchEvent(new window.InputEvent('input', { bubbles: true, data: value, inputType, isComposing }));
  }
  function assertStillEditing({ value, start = value.length, end = start, scrollTop = 0, scrollLeft = 0 }) {
    assert.ok(document.getElementById(textarea.id) === textarea, `${field}: the input element must not be replaced`);
    assert.equal(textarea.isConnected, true, `${field}: the input must remain connected`);
    assert.ok(document.activeElement === textarea, `${field}: focus must stay on the original input`);
    assert.equal(textarea.value, value, `${field}: the full native value must survive`);
    assert.equal(textarea.selectionStart, start, `${field}: selection start must survive`);
    assert.equal(textarea.selectionEnd, end, `${field}: selection end must survive`);
    assert.equal(textarea.selectionDirection, 'backward', `${field}: selection direction must survive`);
    assert.equal(textarea.scrollTop, scrollTop, `${field}: vertical scroll must survive`);
    assert.equal(textarea.scrollLeft, scrollLeft, `${field}: horizontal scroll must survive`);
    assert.equal(rendererValueWrites, 0, `${field}: unchanged values must not be assigned by the renderer`);
    const records = mutations.splice(0).concat(observer.takeRecords());
    assert.equal(records.some((record) => [...record.removedNodes].some((node) => ancestors.includes(node))), false,
      `${field}: the input or its ancestors must not be disconnected, even temporarily`);
  }
  function actionButton(label) {
    const button = [...root.querySelectorAll('button')].find((node) => node.textContent === label);
    assert.ok(button, `button ${label} exists`);
    return button;
  }
  function assertCount(value, limit) {
    assert.equal(document.querySelector(`#coach-${field}-help .count`).textContent,
      `${value.length.toLocaleString('ko-KR')} / ${limit.toLocaleString('ko-KR')}자`);
  }
  return { window, document, root, textarea, controller, calls, view, nativeEdit, assertStillEditing, actionButton, assertCount };
}

for (const { field, button, limit } of fields) {
  test(`${field}: normal edits preserve the connected input, selection, scroll and browser-owned value`, (t) => {
    const f = fixture(t, field);
    f.textarea.focus();
    const value = '조명이 있는 작은 정원\n  두 번째 줄';
    f.textarea.scrollTop = 67;
    f.textarea.scrollLeft = 5;
    f.nativeEdit(value, { start: 3, end: 8 });
    f.assertStillEditing({ value, start: 3, end: 8, scrollTop: 67, scrollLeft: 5 });
    assert.equal(f.controller.draft[field], value);
    f.assertCount(value, limit);
    assert.equal(f.actionButton(button).disabled, false);

    f.nativeEdit('', { inputType: 'deleteContentBackward' });
    f.assertStillEditing({ value: '', scrollTop: 67, scrollLeft: 5 });
    f.assertCount('', limit);
    assert.equal(f.actionButton(button).disabled, true);
    f.nativeEdit(value, { inputType: 'insertFromPaste' });
    f.assertStillEditing({ value, scrollTop: 67, scrollLeft: 5 });
    assert.equal(f.controller.draft[field], value);
    f.nativeEdit('이전 문장', { inputType: 'historyUndo' });
    f.assertStillEditing({ value: '이전 문장', scrollTop: 67, scrollLeft: 5 });
    assert.equal(f.controller.draft[field], '이전 문장');
  });

  test(`${field}: Korean composition commits the latest native text before the trailing input event`, (t) => {
    const f = fixture(t, field);
    f.textarea.focus();
    f.textarea.dispatchEvent(new f.window.CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    for (const value of ['ㅎ', '하', '한']) {
      f.nativeEdit(value, { inputType: 'insertCompositionText', isComposing: true });
      f.assertStillEditing({ value });
    }
    // Some IME/browser orders expose the final value at compositionend before final input.
    f.nativeEdit('한국', { dispatch: false });
    f.textarea.dispatchEvent(new f.window.CompositionEvent('compositionend', { bubbles: true, data: '한국' }));
    f.assertStillEditing({ value: '한국' });
    assert.equal(f.controller.draft[field], '한국', 'compositionend must synchronize its target value, not stale draft text');
    f.assertCount('한국', limit);
    assert.equal(f.actionButton(button).disabled, false);
    f.nativeEdit('한국', { inputType: 'insertText' });
    f.nativeEdit('한국 ', { inputType: 'insertText' });
    f.assertStillEditing({ value: '한국 ' });
    assert.equal(f.controller.draft[field], '한국 ');
    f.assertCount('한국 ', limit);
  });
}

test('a connection/error notification during composition does not disconnect the editor or lose the final syllable', (t) => {
  const f = fixture(t, 'idea');
  f.textarea.focus();
  f.textarea.dispatchEvent(new f.window.CompositionEvent('compositionstart', { bubbles: true }));
  f.nativeEdit('작은 서재를 만들고 싶어', { inputType: 'insertCompositionText', isComposing: true });
  f.controller.setConnection('disconnected');
  f.controller.setError('잠시 연결을 확인하고 있어요.');
  f.assertStillEditing({ value: '작은 서재를 만들고 싶어' });
  f.nativeEdit('작은 서재를 만들고 싶어요', { dispatch: false });
  f.textarea.dispatchEvent(new f.window.CompositionEvent('compositionend', { bubbles: true, data: '요' }));
  f.assertStillEditing({ value: '작은 서재를 만들고 싶어요' });
  assert.equal(f.controller.draft.idea, '작은 서재를 만들고 싶어요');
  assert.equal(f.actionButton('코칭 시작하기').disabled, true);
  assert.match(f.root.textContent, /연결이 끊어졌어요/);
  f.controller.setConnection('ready');
  f.assertStillEditing({ value: '작은 서재를 만들고 싶어요' });
  assert.equal(f.actionButton('코칭 시작하기').disabled, false);
});

test('length and UTF-8 history budgets update without replacing or truncating the edited field', async (t) => {
  const scene = fixture(t, 'idea');
  scene.textarea.focus();
  scene.nativeEdit('a'.repeat(LIMITS.idea + 1));
  scene.assertStillEditing({ value: 'a'.repeat(LIMITS.idea + 1) });
  scene.assertCount('a'.repeat(LIMITS.idea + 1), LIMITS.idea);
  assert.equal(scene.document.querySelector('#coach-idea-help .count').classList.contains('over'), true);
  assert.equal(scene.actionButton('코칭 시작하기').disabled, true);
  assert.equal(await scene.controller.submit('start'), false);
  assert.equal(scene.calls.submissions.length, 0);
  scene.nativeEdit('a'.repeat(LIMITS.idea));
  assert.equal(scene.actionButton('코칭 시작하기').disabled, false);

  const answer = fixture(t, 'answer', { idea: '가'.repeat(8000) });
  answer.textarea.focus();
  answer.nativeEdit('나'.repeat(3000));
  answer.assertStillEditing({ value: '나'.repeat(3000) });
  answer.assertCount('나'.repeat(3000), LIMITS.answer);
  assert.match(answer.document.getElementById('coach-answer-budget').textContent, /전체 기록이 32 KB/);
  assert.equal(answer.actionButton('답변 보내기').disabled, true);
  assert.equal(await answer.controller.submit('answer'), false);
  assert.equal(answer.calls.submissions.length, 0);
  assert.equal(answer.controller.draft.answer, '나'.repeat(3000));
  answer.nativeEdit('나');
  assert.equal(answer.actionButton('답변 보내기').disabled, false);
  assert.doesNotMatch(answer.document.getElementById('coach-answer-budget').textContent, /전체 기록이 32 KB/);

  const prompt = fixture(t, 'prompt');
  prompt.textarea.focus();
  prompt.nativeEdit('가'.repeat(LIMITS.prompt));
  prompt.assertStillEditing({ value: '가'.repeat(LIMITS.prompt) });
  prompt.assertCount('가'.repeat(LIMITS.prompt), LIMITS.prompt);
  assert.match(prompt.document.getElementById('coach-prompt-budget').textContent, /전체 기록이 32 KB/);
  assert.equal(prompt.actionButton('이 프롬프트로 확정').disabled, true);
  prompt.nativeEdit('a'.repeat(LIMITS.prompt));
  assert.equal(prompt.actionButton('이 프롬프트로 확정').disabled, false);
});
