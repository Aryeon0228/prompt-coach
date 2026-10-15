import { MEDIUMS, LIMITS, coachKey, submissionBudget } from './model.mjs';

function el(document, tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'text') node.textContent = value;
    else if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (name in node && !name.startsWith('aria-')) node[name] = value;
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}

async function copyText(text, document) {
  try { await document.defaultView.navigator.clipboard.writeText(text); return true; }
  catch {
    const field = document.createElement('textarea'); field.value = text; field.style.position = 'fixed'; field.style.opacity = '0';
    document.body.append(field); field.select();
    let copied = false; try { copied = document.execCommand('copy'); } catch { /* Show a selectable field instead. */ }
    field.remove(); return copied;
  }
}

/** Render through DOM text nodes only; server and user content is never HTML. */
export function createCoachView(root, controller, adapter) {
  const document = root.ownerDocument;
  const e = (tag, props, children) => el(document, tag, props, children);
  const p = (text, className = 'muted') => e('p', { class: className, text });
  const button = (text, onclick, { secondary = false, disabled = false, id } = {}) => e('button', { type: 'button', id, class: secondary ? 'button secondary' : 'button', text, onclick, disabled });
  const budgetFor = (action) => submissionBudget(controller.output, controller.draft, action);
  const action = (label, fn, options = {}) => button(label, fn, { ...options, disabled: controller.busy || Boolean(controller.pending) || controller.connection !== 'ready' || options.disabled || (options.budgetAction && budgetFor(options.budgetAction).exceeded) });

  const copy = async (text, fieldId) => {
    const result = await copyText(text, document);
    controller.notice = result ? '복사했어요.' : '자동 복사가 안 됐어요. 선택된 글을 직접 복사해 주세요.';
    render();
    if (!result && fieldId) { const field = document.getElementById(fieldId); field?.focus(); field?.select?.(); }
  };

  function textarea(field, label, { rows = 5, limit, help, readOnly = false, value, budgetAction } = {}) {
    const id = `coach-${field}`;
    const text = value ?? controller.draft?.[field] ?? '';
    const budget = budgetAction ? budgetFor(budgetAction) : null;
    const box = e('textarea', { id, value: text, rows, readOnly, 'aria-describedby': `${id}-help${budget ? ` ${id}-budget` : ''}`,
      oninput: (event) => controller.setDraft(field, event.target.value) });
    return e('div', { class: 'field' }, [
      e('label', { htmlFor: id, text: label }), box,
      e('div', { class: 'field-help', id: `${id}-help` }, [p(help ?? '', 'small muted'), limit ? p(`${text.length.toLocaleString('ko-KR')} / ${limit.toLocaleString('ko-KR')}자`, `count${text.length > limit ? ' over' : ''}`) : null]),
      budget ? e('div', { id: `${id}-budget` }, [
        budget.exceeded ? p(budget.message, 'status error') : budget.nearLimit ? p(budgetAction === 'confirm' ? '전체 기록 용량이 거의 찼어요. 완성본은 확정한 뒤 복사하거나 저장해 주세요.' : '전체 기록 용량이 거의 찼어요. 다음 질문·답변이 들어갈 공간도 필요하니 중요한 글은 복사해 보관해 주세요.', 'small muted') : null]) : null,
    ]);
  }

  function scene() {
    const draft = controller.draft;
    const blocked = controller.busy || controller.connection !== 'ready';
    return e('section', { class: 'panel phase-scene' }, [
      e('div', { class: 'section-heading' }, [e('span', { class: 'eyebrow', text: '01 / SCENE' }), e('h1', { text: '어떤 장면을 만들고 싶나요?' }), p('한 문장으로 시작해도 좋아요. 필요한 조건은 질문에 답하며 함께 정해요.')]),
      e('fieldset', { class: 'medium-picker', disabled: blocked }, [e('legend', { text: '만들 결과물' }), e('div', { class: 'medium-options' }, MEDIUMS.map((medium) => e('button', {
        type: 'button', class: `medium${draft.medium === medium.value ? ' selected' : ''}`, 'aria-pressed': String(draft.medium === medium.value),
        onclick: () => controller.setDraft('medium', medium.value),
      }, [e('strong', { text: medium.label }), e('span', { text: medium.hint })])))]),
      p('3D 웹이 목표라면 3D Web부터 시작하고, 이미지는 참고 자료로 준비하세요.', 'small muted'),
      textarea('idea', '장면 아이디어', { rows: 5, limit: LIMITS.idea, budgetAction: 'start', help: '분위기만 떠올라도 괜찮아요. 아직 정하지 않은 조건은 AI가 물어볼게요.' }),
      e('div', { class: 'actions' }, [p('현재 대화의 AI가 질문해요. 본인 계정의 이용 한도가 적용됩니다.', 'small muted'), action(controller.busy ? '전달하는 중…' : '코칭 시작하기', () => controller.submit('start'), { disabled: blocked || !draft.medium || !draft.idea.trim() || draft.idea.length > LIMITS.idea, budgetAction: 'start', id: 'start-coaching' })]),
    ]);
  }

  function question() {
    const coach = controller.output.coach;
    const q = coach.question;
    const answered = coach.turns.filter((turn) => turn.kind === 'answer').length;
    const panel = e('section', { class: 'panel phase-question' }, [
      e('div', { class: 'question-title' }, [e('span', { class: 'question-mark', text: 'Q.' }), e('div', {}, [p(`조건 구체화 · 답변 ${answered}개`, 'eyebrow'), e('h1', { text: q.text })])]),
      e('div', { class: 'why' }, [e('h2', { text: '왜 필요한가요?' }), p(q.why)]),
      q.examples.length ? e('details', { class: 'disclosure', id: 'examples-details' }, [e('summary', { text: '답변 예시 보기' }), p('선택하면 초안에만 들어가요. 내 생각에 맞게 고쳐서 보내거나 자유롭게 답해도 좋아요.', 'small muted'), e('div', { class: 'examples' }, q.examples.map((example) => e('button', { type: 'button', class: 'example', text: example, onclick: () => { controller.chooseExample(example); document.getElementById('coach-answer')?.focus(); }, disabled: controller.busy })))]) : null,
      textarea('answer', '내 답변', { rows: 5, limit: LIMITS.answer, budgetAction: 'answer', help: '잘 모르겠다면 보류해도 괜찮아요. 고르지 않은 예시는 반영하지 않아요.' }),
      e('div', { class: 'actions answer-actions' }, [e('div', { class: 'secondary-actions' }, [action('지금은 보류', () => controller.submit('defer'), { secondary: true, budgetAction: 'defer' }), action('여기까지 정리', () => controller.submit('review'), { secondary: true, budgetAction: 'review' })]), action(controller.busy ? '전달하는 중…' : '답변 보내기', () => controller.submit('answer'), { disabled: controller.busy || Boolean(controller.pending) || !controller.draft.answer.trim() || controller.draft.answer.length > LIMITS.answer, budgetAction: 'answer', id: 'send-answer' })]),
    ]);
    if (controller.reviewConfirm) panel.append(e('section', { class: 'confirm-box', role: 'group', 'aria-label': '보내지 않은 답변 확인' }, [
      p('작성 중인 답변이 있어요. 아직 보내지 않은 글은 정리에 포함되지 않으며, 현재 열린 카드에서만 확인할 수 있어요. 필요하면 먼저 복사해 주세요.'),
      e('div', { class: 'button-row' }, [button('답변 계속 쓰기', () => { controller.reviewConfirm = false; render(); document.getElementById('coach-answer')?.focus(); }, { secondary: true }), action('보낸 내용만 정리', () => controller.submit('review', { discardUnsentForReview: true }), { budgetAction: 'review' })]),
    ]));
    return panel;
  }

  function review() {
    const reviewData = controller.output.coach.review;
    return e('section', { class: 'panel phase-review' }, [
      e('div', { class: 'section-heading' }, [e('span', { class: 'eyebrow', text: '03 / REVIEW' }), e('h1', { text: '이 조건으로 완성할까요?' }), p(reviewData.summary)]),
      reviewData.unresolved.length ? e('div', { class: 'unresolved' }, [e('h2', { text: '아직 정하지 않은 내용' }), e('ul', {}, reviewData.unresolved.map((item) => e('li', { text: item }))), p('보류한 조건을 임의로 확정하지 않아요. 아래 문장에 섞여 있지는 않은지 함께 확인해 주세요.', 'small muted')]) : null,
      textarea('prompt', '확인할 프롬프트', { rows: 11, limit: LIMITS.prompt, budgetAction: 'confirm', help: '내 의도와 맞는지 읽고 직접 고칠 수 있어요. 아래 버튼을 눌러야 확정돼요.' }),
      e('div', { class: 'actions' }, [p('처음 적은 장면과 답변 기록도 아래에서 확인할 수 있어요.', 'small muted'), action(controller.busy ? '확정하는 중…' : '이 프롬프트로 확정', () => controller.submit('confirm'), { disabled: controller.busy || Boolean(controller.pending) || !controller.draft.prompt.trim() || controller.draft.prompt.length > LIMITS.prompt, budgetAction: 'confirm', id: 'confirm-prompt' })]),
      e('details', { class: 'disclosure', id: 'revise-details' }, [e('summary', { text: 'AI와 더 수정하기' }), textarea('revisionNote', '더 수정하고 싶은 점', { rows: 4, limit: LIMITS.answer, budgetAction: 'revise', help: '유지할 부분과 바꾸고 싶은 부분을 적어 주세요.' }), e('div', { class: 'button-row' }, [action('수정 요청 보내기', () => controller.submit('revise'), { secondary: true, budgetAction: 'revise', disabled: controller.busy || Boolean(controller.pending) || !controller.draft.revisionNote.trim() || controller.draft.revisionNote.length > LIMITS.answer })])]),
    ]);
  }

  async function download(kind) {
    try {
      const filename = `prompt-coach-${controller.output.coach.id.slice(0, 8)}.${kind}`;
      await adapter.download(filename, kind === 'json' ? 'application/json' : 'text/plain', controller.exportText(kind));
      controller.notice = '파일 저장 요청을 보냈어요. 호스트의 저장 안내를 확인해 주세요.';
    } catch (error) { controller.error = error.message; }
    render();
  }

  function final() {
    return e('section', { class: 'panel phase-final' }, [
      e('div', { class: 'section-heading' }, [e('span', { class: 'eyebrow', text: 'READY TO CREATE' }), e('h1', { text: '내 장면의 프롬프트가 완성됐어요' }), p('직접 확인한 조건으로 정리했어요. 만들 AI에 전달하고 결과를 살펴보세요.')]),
      textarea('finalPrompt', '완성한 프롬프트', { rows: 12, value: controller.output.coach.finalPrompt, readOnly: true }),
      e('div', { class: 'button-row export-actions' }, [button('프롬프트 복사', () => copy(controller.output.coach.finalPrompt, 'coach-finalPrompt')), button('TXT 저장', () => download('txt'), { secondary: true }), button('기록 JSON 저장', () => download('json'), { secondary: true })]),
      p('새로고침 전에 완성본을 복사하거나 저장해 주세요. 다시 열면 직접 수정·확정한 내용이 복원되지 않을 수 있어요.', 'small muted'),
      p('JSON에는 원래 장면·답변·보류 기록과 이 카드의 초안이 함께 들어가요.', 'small muted'),
      e('div', { class: 'new-scene' }, [p('다른 장면도 떠올랐나요?', 'small muted'), action('새 장면 시작', () => controller.requestNewScene(), { secondary: true })]),
      controller.newSceneConfirm ? e('div', { class: 'confirm-box' }, [p('새 장면은 별도 카드에서 시작해요. 현재 완성본은 먼저 복사하거나 저장해 주세요.'), e('div', { class: 'button-row' }, [button('취소', () => { controller.newSceneConfirm = false; render(); }, { secondary: true }), action('새 장면 카드 열기', () => controller.openNewScene())])]) : null,
    ]);
  }

  function waiting() {
    const pending = controller.pending;
    const sent = pending?.delivery === 'sent';
    return e('section', { class: 'panel waiting', 'aria-labelledby': 'waiting-title' }, [
      e('div', { class: 'waiting-symbol', 'aria-hidden': 'true', text: '✦' }),
      e('h1', { id: 'waiting-title', text: pending?.delivery === 'failed' ? '요청을 다시 보내 주세요' : sent ? 'AI의 다음 질문을 기다리고 있어요' : 'AI에 질문을 요청하고 있어요' }),
      p(sent ? '요청이 전달되었어요. AI의 답변이 도착했다는 뜻은 아니에요. 아래에 새 질문 카드가 나타나면 그 카드에서 이어가세요.' : pending?.delivery === 'failed' ? '입력한 내용은 현재 열린 카드에서 확인할 수 있어요. 다시 보내도 답변을 두 번 등록하지 않아요.' : '입력한 조건을 정리했어요. 현재 대화의 AI가 다음 내용을 준비합니다.'),
      !pending ? p('현재 대화에서 새 카드가 있는지 확인해 주세요. 없다면 AI에게 “프롬프트 코치의 다음 질문을 보여 줘”라고 알려 주세요.', 'small muted') : null,
      pending ? e('details', { class: 'disclosure resend', id: 'resend-details', open: pending.delivery === 'failed' }, [
        e('summary', { text: sent ? '새 카드가 오지 않았나요?' : '전송 방법' }),
        p('이미 새 질문 카드가 있다면 그 카드에서 이어가세요. 아직 없다면 아래에서 요청만 다시 보낼 수 있어요.', 'small muted'),
        e('div', { class: 'button-row' }, [button(pending.delivery === 'sending' ? '보내는 중…' : 'AI에 다시 보내기', () => controller.sendPending(), { disabled: pending.delivery === 'sending' || controller.busy }), button('대화에 보낼 내용 복사', () => copy(pending.request, 'pending-request'), { secondary: true })]),
        e('details', { class: 'disclosure', id: 'request-details' }, [e('summary', { text: '직접 전달할 내용 보기' }), e('textarea', { id: 'pending-request', value: pending.request, readOnly: true, rows: 5, 'aria-label': 'AI 대화에 전달할 요청' })]),
      ]) : null,
    ]);
  }

  function history() {
    const coach = controller.output.coach;
    const label = MEDIUMS.find((medium) => medium.value === coach.medium)?.label ?? '아직 선택하지 않음';
    return e('details', { class: 'panel history', id: 'history-details' }, [
      e('summary', { text: `처음 장면과 답변 기록${coach.turns.length ? ` · ${coach.turns.length}` : ''}` }),
      e('div', { class: 'history-original' }, [e('h2', { text: `처음 장면 · ${label}` }), p(coach.idea || '아직 장면을 적지 않았어요.', 'preserve')]),
      ...coach.turns.map((turn, index) => e('article', { class: 'history-turn' }, [
        p(`${String(index + 1).padStart(2, '0')} · ${turn.kind === 'defer' ? '보류' : turn.kind === 'revise' ? '수정 요청' : '답변'}`, 'eyebrow'),
        turn.question ? e('h2', { text: turn.question.text }) : null,
        p(turn.kind === 'defer' ? '이 조건은 아직 정하지 않았어요.' : turn.text, 'preserve'),
      ])),
      [...controller.drafts].some(([key, value]) => key !== coachKey(coach) && (value.answer || value.revisionNote)) ? e('details', { class: 'disclosure', id: 'draft-history' }, [e('summary', { text: '이 카드에서 작성한 초안' }), p('보낸 답변과 보내지 않은 글을 현재 열린 카드에서 확인할 수 있어요. 최종 프롬프트에는 확인한 조건만 들어갑니다.', 'small muted'), ...[...controller.drafts].filter(([key, value]) => key !== coachKey(coach) && (value.answer || value.revisionNote)).map(([key, value]) => e('div', { class: 'draft-record' }, [p(`작성 단계 ${key.split(':').at(-1)}`, 'eyebrow'), p(value.answer || value.revisionNote, 'preserve')]))]) : null,
    ]);
  }

  let composing = false;
  root.addEventListener('compositionstart', () => { composing = true; });
  root.addEventListener('compositionend', () => { composing = false; render(); });

  function render() {
    if (composing) return;
    const active = document.activeElement;
    const focus = active && root.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    const opened = new Set([...root.querySelectorAll('details[open][id]')].map((node) => node.id));
    const header = e('header', { class: 'coach-header' }, [e('div', { class: 'brand' }, [e('span', { class: 'brand-star', 'aria-hidden': 'true', text: '✦' }), e('span', { text: 'PROMPT COACH' })]), e('span', { class: 'brand-studio', text: 'STUDIO PENUMBRA' })]);
    const children = [header];
    if (controller.connection === 'unsupported') {
      children.push(e('section', { class: 'panel unsupported' }, [e('h1', { text: 'AI 대화 안에서 코치 화면을 열어 주세요' }), p('코치 화면은 지원되는 ChatGPT·Claude 안에서 열어주세요. 홈페이지 직접 AI 연결은 준비 중이에요.'), p('이 화면만 브라우저에서 열면 AI가 질문하거나 답변하지 않습니다.', 'small muted')]));
    } else if (!controller.output) {
      children.push(e('section', { class: 'panel waiting' }, [e('h1', { text: '코치 화면을 준비하고 있어요' }), p('대화에 연결된 장면을 불러오는 중이에요.')]));
    } else {
      if (controller.connection === 'disconnected') children.push(e('div', { class: 'status error', role: 'status', text: 'AI 대화와 연결이 끊어졌어요. 현재 열린 카드에서 작성한 글을 복사해 보관하세요.' }));
      if (controller.output.coach.phase === 'waiting') children.push(waiting());
      else children.push(({ scene, question, review, final })[controller.output.coach.phase]());
      if (controller.pending?.kind === 'new-scene') children.push(e('section', { class: 'status', role: 'status' }, [p(controller.pending.delivery === 'sent' ? '새 장면 카드를 요청했어요. 아래에 나타나는 새 카드에서 시작하세요. 현재 완성본은 복사하거나 저장해 주세요.' : '새 장면 카드 요청을 아직 전달하지 못했어요.'), controller.pending.delivery !== 'sending' ? button('새 카드 요청 다시 보내기', () => controller.sendPending(), { secondary: true }) : null]));
      if (controller.output.coach.phase !== 'scene') children.push(history());
    }
    if (controller.error) children.push(e('div', { class: 'status error', role: 'alert', text: controller.error }));
    if (controller.notice) children.push(e('div', { class: 'status', role: 'status', text: controller.notice }));
    children.push(e('footer', { class: 'coach-footer' }, [p('장면의 조건을 배우며, 내 언어로 만드는 프롬프트.', 'small muted'), p('초안은 현재 열린 카드에서 확인할 수 있어요. 새로고침 전 필요한 글을 복사해 주세요.', 'small muted')]));
    root.replaceChildren(...children);
    for (const id of opened) { const details = document.getElementById(id); if (details?.tagName === 'DETAILS') details.open = true; }
    if (focus?.id) {
      const next = document.getElementById(focus.id);
      if (next) { next.focus({ preventScroll: true }); if (typeof next.setSelectionRange === 'function' && typeof focus.start === 'number') next.setSelectionRange(focus.start, focus.end); }
    }
  }
  return { render };
}
