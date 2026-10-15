// stateBytes matches MAX_STATE_BYTES in coach-session.mjs; no state token is rewritten here.
export const LIMITS = Object.freeze({ idea: 10000, answer: 5000, prompt: 12000, stateBytes: 32 * 1024, snapshot: 700000 });
export const MEDIUMS = Object.freeze([
  { value: 'image', label: '2D Image', hint: '한 장의 이미지 · 3D 제작 전 참고 이미지 준비' },
  { value: 'web', label: '3D Web', hint: '브라우저에서 회전·클릭하는 3D 장면' },
  { value: 'video', label: 'Video', hint: '시간에 따라 움직이는 영상' },
]);
const FIELDS = ['purpose', 'subject', 'composition', 'style', 'details', 'constraints', 'success'];
const PHASES = ['scene', 'waiting', 'question', 'review', 'final'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE = /^pc1\.[A-Za-z0-9_-]+$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, max) => typeof value === 'string' && value.length <= max;
const isMedium = (value) => value === null || MEDIUMS.some((item) => item.value === value);
const textList = (value, count, length) => Array.isArray(value) && value.length <= count && value.every((item) => isText(item, length));
export const coachKey = (coach) => `${coach.id}:${coach.revision}`;

function validQuestion(value) {
  return isObject(value) && isText(value.text, 1000) && value.text.trim() && isText(value.why, 1500) &&
    textList(value.examples, 3, 500) && (value.topic === null || FIELDS.includes(value.topic));
}

function validTurn(value) {
  if (!isObject(value) || !isText(value.text, 5000)) return false;
  if (value.kind === 'revise') return isText(value.previousPrompt, 12000);
  return ['answer', 'defer'].includes(value.kind) && validQuestion(value.question);
}

/** All strings stay text. State is an opaque token: only its shape is checked, never rewritten. */
export function parseCoachOutput(result) {
  try {
    if (!isObject(result) || result.isError) return null;
    const text = result.content?.find(item => item?.type === 'text' && typeof item.text === 'string')?.text;
    const value = result.structuredContent ?? (text && text.length < 200000 ? JSON.parse(text) : result);
    if (!isObject(value) || !isObject(value.coach) || !isText(value.state, 43695) || !STATE.test(value.state)) return null;
    const coach = value.coach;
    if (coach.schemaVersion !== 1 || !isText(coach.id, 36) || !UUID.test(coach.id) || !Number.isSafeInteger(coach.revision) || coach.revision < 0 || coach.revision > 10000 ||
      !PHASES.includes(coach.phase) || !isMedium(coach.medium) || !isText(coach.idea, 10000) ||
      !Array.isArray(coach.turns) || coach.turns.length > 40 || !coach.turns.every(validTurn) ||
      !(coach.question === null || validQuestion(coach.question)) ||
      !(coach.review === null || (isObject(coach.review) && isText(coach.review.prompt, 12000) && isText(coach.review.summary, 2000) && textList(coach.review.unresolved, 12, 500))) ||
      !(coach.finalPrompt === null || isText(coach.finalPrompt, 12000)) || ![null, 'question', 'review'].includes(coach.awaiting)) return null;
    if (coach.phase !== 'scene' && (!coach.medium || !coach.idea.trim())) return null;
    if (coach.phase === 'question' && !coach.question) return null;
    if (coach.phase === 'review' && !coach.review) return null;
    if (coach.phase === 'final' && !coach.finalPrompt?.trim()) return null;
    if (value.hostRequest !== undefined && (!isText(value.hostRequest, 100000) || !value.hostRequest.trim())) return null;
    const clean = { coach, state: value.state, ...(value.hostRequest ? { hostRequest: value.hostRequest } : {}) };
    if (JSON.stringify(clean).length > 200000) return null;
    return JSON.parse(JSON.stringify(clean));
  } catch { return null; }
}

export function defaultDraft(coach) {
  return { medium: coach.medium, idea: coach.idea, answer: '', prompt: coach.review?.prompt ?? coach.finalPrompt ?? '', revisionNote: '' };
}

function validDraft(value) {
  return isObject(value) && Reflect.ownKeys(value).length === 5 && isMedium(value.medium) &&
    ['idea', 'answer', 'prompt', 'revisionNote'].every((key) => isText(value[key], 100000));
}

/** Restored drafts belong to one widget's original tool result, never a shared browser store. */
export function parseWidgetSnapshot(value) {
  try {
    if (!isObject(value) || value.schemaVersion !== 1 || !isText(value.anchorKey, 48) || JSON.stringify(value).length > LIMITS.snapshot) return null;
    const output = parseCoachOutput(value.output);
    if (!output || !value.anchorKey.startsWith(`${output.coach.id}:`) || !/^.+:\d+$/.test(value.anchorKey)) return null;
    if (!Array.isArray(value.drafts) || value.drafts.length > 48 || !value.drafts.every((entry) =>
      isObject(entry) && isText(entry.key, 48) && entry.key.startsWith(`${output.coach.id}:`) && /^.+:\d+$/.test(entry.key) && validDraft(entry.value))) return null;
    if (new Set(value.drafts.map((entry) => entry.key)).size !== value.drafts.length) return null;
    if (value.pending !== null && (!isObject(value.pending) || !['followup', 'new-scene'].includes(value.pending.kind) ||
      !isText(value.pending.request, 100000) || !value.pending.request.trim() || value.pending.key !== coachKey(output.coach) ||
      !['ready', 'sending', 'sent', 'failed'].includes(value.pending.delivery) || !Number.isSafeInteger(value.pending.attempts) || value.pending.attempts < 0 || value.pending.attempts > 1000)) return null;
    return JSON.parse(JSON.stringify({ schemaVersion: 1, anchorKey: value.anchorKey, output, drafts: value.drafts, pending: value.pending }));
  } catch { return null; }
}

export function appendExample(current, example) {
  if (typeof current !== 'string' || typeof example !== 'string') return current;
  if (current === example || current.split('\n').includes(example)) return current;
  return current.trim() ? `${current}\n${example}` : example;
}

/** Measure the next submitted snapshot, including history and UTF-8/JSON overhead. */
export function submissionBudget(output, draft, action) {
  const coach = output.coach;
  const next = { ...coach, revision: coach.revision + 1 };
  switch (action) {
    case 'start':
      Object.assign(next, { medium: draft.medium, idea: draft.idea, phase: 'waiting', awaiting: 'question' });
      break;
    case 'answer':
    case 'defer':
      Object.assign(next, { turns: [...coach.turns, { kind: action, question: coach.question, text: action === 'answer' ? draft.answer : '' }], question: null, phase: 'waiting', awaiting: 'question' });
      break;
    case 'review':
      Object.assign(next, { question: null, phase: 'waiting', awaiting: 'review' });
      break;
    case 'revise':
      Object.assign(next, { turns: [...coach.turns, { kind: 'revise', text: draft.revisionNote, previousPrompt: draft.prompt }], review: null, phase: 'waiting', awaiting: 'review' });
      break;
    case 'confirm':
      Object.assign(next, { finalPrompt: draft.prompt, review: null, phase: 'final', awaiting: null });
      break;
    default:
      return null;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
  const exceeded = bytes > LIMITS.stateBytes;
  return { bytes, limit: LIMITS.stateBytes, exceeded, nearLimit: bytes >= LIMITS.stateBytes * 0.85,
    message: exceeded ? '질문·답변을 합친 전체 기록이 32 KB를 넘어 보낼 수 없어요. 입력은 줄이지 않았습니다. 현재 열린 카드에서 원문을 복사해 보관한 뒤 필요한 부분을 직접 정리해 주세요.' : '' };
}

/** Validate without truncation. The controller keeps every unsent draft in the current widget. */
export function buildSubmission(output, draft, action) {
  const phaseActions = { scene: ['start'], question: ['answer', 'defer', 'review'], review: ['confirm', 'revise'], final: [], waiting: [] };
  if (!phaseActions[output.coach.phase]?.includes(action)) throw new Error('이 단계에서는 사용할 수 없는 동작이에요. 새 질문 카드가 있는지 확인해 주세요.');
  const args = { state: output.state, action };
  if (action === 'start') {
    if (!draft.medium) throw new Error('이미지·영상·3D 웹 중 만들 결과물을 선택해 주세요.');
    if (!draft.idea.trim()) throw new Error('만들고 싶은 장면을 한 문장 적어 주세요.');
    if (draft.idea.length > LIMITS.idea) throw new Error('장면 입력은 10,000자 이내여야 하며 전체 기록 용량도 적용돼요. 현재 열린 카드의 원문을 복사해 보관한 뒤 필요한 부분을 직접 정리해 주세요.');
    Object.assign(args, { medium: draft.medium, idea: draft.idea });
  }
  if (action === 'answer' || action === 'revise') {
    const answer = action === 'revise' ? draft.revisionNote : draft.answer;
    if (!answer.trim()) throw new Error(action === 'revise' ? '더 수정하고 싶은 점을 적어 주세요.' : '답변을 적거나 “지금은 보류”를 선택해 주세요.');
    if (answer.length > LIMITS.answer) throw new Error('한 번의 답변은 5,000자 이내여야 하며 전체 기록 용량도 적용돼요. 원문은 현재 열린 카드에서 확인할 수 있어요.');
    args.answer = answer;
  }
  if (action === 'confirm' || action === 'revise') {
    if (!draft.prompt.trim()) throw new Error('확정할 프롬프트를 입력해 주세요.');
    if (draft.prompt.length > LIMITS.prompt) throw new Error('프롬프트는 12,000자 이내여야 하며 전체 기록 용량도 적용돼요. 원문은 현재 열린 카드에서 확인할 수 있어요.');
    args.prompt = draft.prompt;
  }
  const budget = submissionBudget(output, draft, action);
  if (budget.exceeded) throw new Error(budget.message);
  const body = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'submit_prompt_coach_input', arguments: args } };
  if (new TextEncoder().encode(JSON.stringify(body)).length > 98304) throw new Error('대화 기록과 입력을 한 번에 보내기에는 길어요. 내용을 저장한 뒤 새 장면 카드에서 이어가 주세요.');
  return args;
}

function toolError(result) {
  const text = result?.content?.find((item) => item?.type === 'text' && typeof item.text === 'string')?.text;
  return text && text.length < 600 ? text : '입력을 전달하지 못했어요. 작성한 내용은 현재 열린 카드에서 확인할 수 있어요.';
}

/** Host-independent flow. An OAuth adapter can replace the MCP adapter without changing the view. */
export class CoachController {
  constructor(adapter, { onChange = () => {}, restored = null } = {}) {
    this.adapter = adapter;
    this.onChange = onChange;
    this.restored = parseWidgetSnapshot(restored);
    this.output = null;
    this.anchorKey = null;
    this.drafts = new Map();
    this.pending = null;
    this.busy = false;
    this.connection = 'connecting';
    this.error = '';
    this.notice = '';
    this.reviewConfirm = false;
    this.newSceneConfirm = false;
  }

  get draft() {
    if (!this.output) return null;
    const key = coachKey(this.output.coach);
    if (!this.drafts.has(key)) this.drafts.set(key, defaultDraft(this.output.coach));
    return this.drafts.get(key);
  }

  snapshot() {
    if (!this.output || !this.anchorKey) return null;
    return parseWidgetSnapshot({ schemaVersion: 1, anchorKey: this.anchorKey, output: this.output,
      drafts: [...this.drafts].map(([key, value]) => ({ key, value })), pending: this.pending });
  }

  emit() {
    const snapshot = this.snapshot();
    if (snapshot) { try { this.adapter.persist?.(snapshot); } catch { /* The visible draft remains in this widget. */ } }
    this.onChange(this);
  }

  setConnection(status) { this.connection = status; this.emit(); }
  setError(message) { this.error = message; this.emit(); }

  receive(result, { fromSubmission = false } = {}) {
    const next = parseCoachOutput(result);
    if (!next) { if (!this.output) this.setError('코치 화면을 읽지 못했어요. AI에게 프롬프트 코치 화면을 다시 열어 달라고 요청해 주세요.'); return false; }
    if (this.output && (next.coach.id !== this.output.coach.id || next.coach.revision <= this.output.coach.revision)) return false;
    if (!this.anchorKey) {
      this.anchorKey = coachKey(next.coach);
      if (this.restored?.anchorKey === this.anchorKey && this.restored.output.coach.revision >= next.coach.revision) {
        this.output = this.restored.output;
        this.drafts = new Map(this.restored.drafts.map((entry) => [entry.key, entry.value]));
        this.pending = this.restored.pending;
        if (this.pending?.delivery === 'sending') this.pending.delivery = 'failed';
        this.restored = null;
        this.emit();
        return true;
      }
      this.restored = null;
    }
    this.output = next;
    this.pending = null;
    this.error = '';
    this.notice = '';
    this.reviewConfirm = false;
    this.newSceneConfirm = false;
    void this.draft;
    if (!fromSubmission) this.busy = false;
    this.emit();
    return true;
  }

  setDraft(field, value) {
    if (!this.output || !['medium', 'idea', 'answer', 'prompt', 'revisionNote'].includes(field)) return;
    if (field === 'medium' ? !isMedium(value) : typeof value !== 'string') return;
    this.draft[field] = value;
    this.error = '';
    this.emit();
  }

  chooseExample(example) { this.setDraft('answer', appendExample(this.draft.answer, example)); }

  async submit(action, { discardUnsentForReview = false } = {}) {
    if (!this.output || this.busy || this.pending || this.connection !== 'ready') return false;
    if (action === 'review' && this.draft.answer.trim() && !discardUnsentForReview) {
      this.reviewConfirm = true; this.emit(); return false;
    }
    let args;
    try { args = buildSubmission(this.output, this.draft, action); }
    catch (error) { this.setError(error.message); return false; }
    const beforeKey = coachKey(this.output.coach);
    this.busy = true; this.error = ''; this.reviewConfirm = false; this.emit();
    try {
      const result = await this.adapter.submit(args);
      if (result?.isError) throw new Error(toolError(result));
      const next = parseCoachOutput(result);
      if (!next || next.coach.id !== this.output.coach.id || next.coach.revision <= Number(beforeKey.split(':').at(-1))) throw new Error('다음 상태를 확인하지 못했어요. 작성한 내용은 현재 열린 카드에서 확인할 수 있어요.');
      this.receive(result, { fromSubmission: true });
      if (coachKey(this.output.coach) !== coachKey(next.coach)) return false;
      if (next.hostRequest) {
        this.pending = { kind: 'followup', key: coachKey(next.coach), request: next.hostRequest, delivery: 'ready', attempts: 0 };
        this.emit();
        await this.sendPending();
      }
      return true;
    } catch (error) { this.error = error?.message ?? '전달을 완료하지 못했어요. 작성한 내용은 현재 열린 카드에서 확인할 수 있어요.'; return false; }
    finally { this.busy = false; this.emit(); }
  }

  /** Called only by submit's user gesture or the explicit resend button, never by receive(). */
  async sendPending() {
    if (!this.pending || this.pending.delivery === 'sending') return false;
    const pending = this.pending;
    pending.delivery = 'sending'; pending.attempts += 1; this.error = ''; this.emit();
    try {
      const result = await this.adapter.sendMessage(pending.request);
      if (result?.isError) throw new Error('호스트가 요청 전송을 허용하지 않았어요.');
      if (this.pending === pending) { pending.delivery = 'sent'; this.emit(); }
      return true;
    } catch {
      if (this.pending === pending) {
        pending.delivery = 'failed';
        this.error = 'AI 대화에 요청을 보내지 못했어요. 입력과 요청은 현재 열린 카드에서 다시 보내거나 직접 복사해 전달할 수 있어요.';
        this.emit();
      }
      return false;
    }
  }

  requestNewScene() { this.newSceneConfirm = true; this.emit(); }

  async openNewScene() {
    if (!this.output || this.busy || this.pending || this.connection !== 'ready') return false;
    this.newSceneConfirm = false;
    this.pending = { kind: 'new-scene', key: coachKey(this.output.coach), request: '프롬프트 코치에서 새 장면을 시작하려고 합니다. 현재 카드의 장면·답변·완성 프롬프트는 그대로 남겨 두고, open_prompt_coach로 별도의 빈 장면 카드를 열어 주세요. 기존 상태를 새 장면에 복사하거나 덮어쓰지 마세요. 화면을 열 수 없다면 열었다고 말하지 말고 알려 주세요.', delivery: 'ready', attempts: 0 };
    this.emit();
    return this.sendPending();
  }

  exportText(kind) {
    if (!this.output) return '';
    if (kind === 'txt') return this.output.coach.finalPrompt ?? this.draft.prompt ?? '';
    return JSON.stringify({ schemaVersion: 1, medium: this.output.coach.medium, idea: this.output.coach.idea,
      turns: this.output.coach.turns, review: this.output.coach.review, finalPrompt: this.output.coach.finalPrompt,
      drafts: [...this.drafts].map(([key, value]) => ({ revision: Number(key.split(':').at(-1)), ...value })) }, null, 2);
  }
}
