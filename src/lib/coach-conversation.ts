import type { FreePromptBrief, FreePromptMode } from './free-prompt'

export type CoachingField = Exclude<keyof FreePromptBrief, 'mode' | 'idea'>

export interface GuidedAnswer {
  status: 'answered' | 'deferred'
  text: string
}

export interface GuidedSession {
  source: string
  mode: FreePromptMode
  answers: Partial<Record<CoachingField, GuidedAnswer>>
  drafts: Partial<Record<CoachingField, string>>
  completed: boolean
  /** Confirmed conditions now live in the scene; answers remain a historical record. */
  conditionsApplied?: true
}

export interface CoachingQuestion {
  field: CoachingField
  label: string
  question: string
  why: string
  examples: string[]
}

export const COACHING_ANSWER_LIMIT = 5_000
const SOURCE_LIMIT = 100_000
const FIELDS: CoachingField[] = ['purpose', 'subject', 'composition', 'style', 'details', 'constraints', 'success']
const MODES: FreePromptMode[] = ['image', 'video', 'web']

const QUESTIONS: Record<FreePromptMode, CoachingQuestion[]> = {
  image: [
    { field: 'purpose', label: '목적과 보는 사람', question: '이 이미지는 누가, 어디에서 보게 되나요?', why: '쓰일 곳을 정하면 강조할 대상과 필요한 여백을 고르기 쉬워요.', examples: ['포트폴리오 첫 화면에서 작업의 분위기를 보여 주기', '제품 상세 페이지에서 형태와 재질을 보여 주기'] },
    { field: 'subject', label: '주요 대상과 행동', question: '가장 먼저 보일 대상은 무엇이고, 어떤 상태인가요?', why: '대상의 수·특징·관계가 분명하면 장면의 중심이 흐려지지 않아요.', examples: ['고래 한 마리가 도서관 창밖을 지나간다', '유리병 하나가 젖은 돌 위에 놓여 있다'] },
    { field: 'composition', label: '구도와 배치', question: '대상을 어느 위치와 시점으로 보여 주고 싶나요?', why: '배치와 시점은 시선이 먼저 닿는 곳과 공간감을 바꿔요.', examples: ['대상은 오른쪽, 왼쪽은 제목을 넣을 여백', '눈높이에서 대상을 가까이 보고 배경은 작게 담기'] },
    { field: 'style', label: '분위기와 표현', question: '원하는 분위기를 색·빛·재질로 설명하면 어떤 모습인가요?', why: '느낌에 눈으로 볼 단서를 붙이면 표현의 방향을 전달하기 쉬워요.', examples: ['차가운 청록빛과 반투명 유리로 조용한 느낌', '따뜻한 옆빛과 거친 종이 질감으로 손으로 만든 느낌'] },
    { field: 'details', label: '구체적인 조건', question: '이 이미지에서 꼭 보여야 하는 세부 요소가 있나요?', why: '작아도 중요한 특징을 적어 두면 중심 대상과 함께 챙길 수 있어요.', examples: ['창틀에 맺힌 물방울이 보이게', '세로 화면이고 간판에는 OPEN만 표시'] },
    { field: 'constraints', label: '지켜야 할 조건', question: '반드시 지킬 것과 피하고 싶은 표현은 무엇인가요?', why: '제약이 있으면 장식이나 해석이 원래 의도를 벗어나는 것을 줄여요.', examples: ['병의 형태는 유지하고 글자는 추가하지 않기', '배경보다 제품의 실루엣을 먼저 읽을 수 있게'] },
    { field: 'success', label: '결과 확인 기준', question: '완성된 이미지를 보고 무엇을 확인하면 성공인가요?', why: '눈으로 확인할 기준이 있으면 결과를 비교하고 수정하기 쉬워요.', examples: ['작게 보아도 주요 대상이 한눈에 구분된다', '제목이 들어갈 공간에 중요한 대상이 겹치지 않는다'] },
  ],
  video: [
    { field: 'purpose', label: '목적과 보는 사람', question: '이 영상은 누가, 어디에서 보게 되나요?', why: '보는 상황을 알면 첫 장면의 정보량과 이야기의 속도를 정하기 쉬워요.', examples: ['휴대폰에서 보는 짧은 제품 소개', '전시 공간에서 반복해서 보는 분위기 영상'] },
    { field: 'subject', label: '주요 대상과 행동', question: '누가 무엇을 하고, 시작과 끝에 어떤 상태가 되나요?', why: '변화의 시작과 끝을 적으면 정지 장면 대신 동작의 흐름을 전달할 수 있어요.', examples: ['닫힌 꽃봉오리가 천천히 열려 꽃잎을 펼친다', '인물이 화면에 들어와 창가에 멈춘다'] },
    { field: 'composition', label: '구도와 카메라', question: '무엇을 먼저 보여 주고, 카메라는 어떻게 움직이나요?', why: '대상의 움직임과 카메라의 움직임을 구분하면 시선의 흐름이 명확해져요.', examples: ['전체 모습을 먼저 보여 준 뒤 손 쪽으로 가까이 이동', '카메라는 고정하고 대상만 왼쪽에서 오른쪽으로 이동'] },
    { field: 'style', label: '분위기와 표현', question: '빛·색·움직임으로 어떤 분위기를 만들고 싶나요?', why: '같은 동작도 조명과 움직임의 속도에 따라 다르게 느껴져요.', examples: ['부드러운 아침빛과 느린 동작으로 편안한 느낌', '강한 명암과 짧은 움직임으로 긴장감'] },
    { field: 'details', label: '시간과 소리', question: '길이·동작 순서·소리 중 미리 정할 조건이 있나요?', why: '시간과 소리는 장면이 이어지는 방식과 필요한 정보량을 바꿔요.', examples: ['8초 동안 한 동작만 보여 주고 음악은 넣지 않기', '문이 열린 뒤 빛이 들어오고 발소리가 들리기'] },
    { field: 'constraints', label: '지켜야 할 조건', question: '영상 내내 유지할 것과 피할 움직임은 무엇인가요?', why: '시간이 흘러도 같아야 하는 특징을 적으면 장면의 일관성을 확인하기 쉬워요.', examples: ['장면 내내 제품의 색과 로고 위치 유지', '갑작스러운 카메라 전환과 화면 흔들림 피하기'] },
    { field: 'success', label: '결과 확인 기준', question: '영상을 끝까지 본 뒤 무엇을 확인하면 성공인가요?', why: '동작과 흐름을 기준으로 잡으면 좋은 한 프레임만으로 판단하지 않게 돼요.', examples: ['시작부터 끝까지 대상의 형태가 일관된다', '문이 열리는 동작이 끊기지 않고 끝까지 보인다'] },
  ],
  web: [
    { field: 'purpose', label: '목적과 보는 사람', question: '사용자는 이 3D 웹 장면에서 무엇을 해 보게 되나요?', why: '체험의 목적을 정하면 꼭 필요한 조작과 정보를 먼저 고를 수 있어요.', examples: ['제품을 돌려 보며 재질과 형태 살펴보기', '공간을 둘러보며 작품 설명 찾아보기'] },
    { field: 'subject', label: '주요 대상과 상태', question: '중심 대상은 무엇이고 처음에는 어떤 상태인가요?', why: '처음 보이는 대상을 정하면 사용자가 무엇을 다루는지 이해하기 쉬워요.', examples: ['중앙에 조명이 켜진 작은 집 한 채', '닫힌 제품 케이스가 받침대 위에 놓인 상태'] },
    { field: 'composition', label: '첫 시점과 배치', question: '처음 보이는 시점과 대상의 배치를 어떻게 할까요?', why: '첫 시점과 크기는 탐색을 시작할 때 보이는 정보와 공간감을 정해요.', examples: ['정면보다 조금 위에서 전체 대상을 보기', '주요 대상은 중앙, 설명 영역은 오른쪽에 배치'] },
    { field: 'style', label: '분위기와 표현', question: '색·빛·재질로 어떤 공간의 분위기를 만들고 싶나요?', why: '시각적 단서가 있으면 공간의 분위기와 대상의 구분을 함께 설계할 수 있어요.', examples: ['짙은 배경에 부드러운 보라빛과 반투명 재질', '밝은 배경에 무광 재질과 자연스러운 그림자'] },
    { field: 'details', label: '조작과 반응', question: '클릭·드래그를 하면 장면이 어떻게 반응하나요?', why: '조작과 그 결과를 짝지으면 실제로 만들 기능과 화면 상태가 명확해져요.', examples: ['드래그하면 대상을 회전하고 버튼으로 처음 시점에 복귀', '작품을 클릭하면 설명을 열고 닫기 버튼으로 돌아오기'] },
    { field: 'constraints', label: '기기와 제약', question: '사용할 기기나 꼭 지켜야 할 조작 조건이 있나요?', why: '기기와 입력 방식에 따라 화면 크기와 가능한 조작이 달라져요.', examples: ['휴대폰 터치와 데스크톱 마우스에서 모두 조작 가능', '자동 회전은 끌 수 있고 키보드로 설명을 열 수 있게'] },
    { field: 'success', label: '결과 확인 기준', question: '직접 조작해 보며 무엇을 확인하면 성공인가요?', why: '보기 좋은 화면과 함께 조작 후 상태도 확인해야 체험을 검토할 수 있어요.', examples: ['대상을 돌려 본 뒤 처음 시점으로 돌아올 수 있다', '휴대폰에서도 설명을 열고 닫는 버튼을 누를 수 있다'] },
  ],
}

/** Prepared questions, not an AI diagnosis of the user's scene. */
export function getCoachingQuestions(brief: FreePromptBrief): CoachingQuestion[] {
  return QUESTIONS[brief.mode].map((question) => ({ ...question, examples: [...question.examples] }))
}

export function createGuidedSession(brief: FreePromptBrief, source: string): GuidedSession {
  return { source, mode: brief.mode, answers: {}, drafts: {}, completed: false }
}

/** Only checks whether a field is filled; it does not infer answers from other fields. */
export function nextCoachingQuestion(brief: FreePromptBrief, session: GuidedSession): CoachingQuestion | undefined {
  return getCoachingQuestions(brief).find(({ field }) => !brief[field].trim()
    && (session.mode !== brief.mode || !session.answers[field]))
}

/** Read older answer layers until an explicit edit moves them into the scene conditions. */
export function guidedBrief(brief: FreePromptBrief, session: GuidedSession | undefined, baseSource: string): FreePromptBrief {
  const result = { ...brief }
  if (!session || session.conditionsApplied || session.source !== baseSource || session.mode !== brief.mode) return result
  for (const field of FIELDS) {
    const answer = session.answers[field]
    if (!brief[field].trim() && answer?.status === 'answered' && answer.text.trim()) result[field] = answer.text
  }
  return result
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Object.prototype.toString.call(value) !== '[object Object]') return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null) return true
  // JSON parsed in another browser realm has its own Object.prototype identity.
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  return Object.getPrototypeOf(prototype) === null
    && typeof constructor === 'function'
    && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && keys.includes(key))
}

function isAnswer(value: unknown): value is GuidedAnswer {
  return isPlainRecord(value)
    && hasOnlyKeys(value, ['status', 'text'])
    && Object.hasOwn(value, 'status') && Object.hasOwn(value, 'text')
    && typeof value.text === 'string' && value.text.length <= COACHING_ANSWER_LIMIT
    && ((value.status === 'answered' && value.text.trim().length > 0) || (value.status === 'deferred' && value.text === ''))
}

/** Validate imported state without truncating the user's answers or unsent drafts. */
export function isGuidedSession(value: unknown): value is GuidedSession {
  if (!isPlainRecord(value)
    || !hasOnlyKeys(value, ['source', 'mode', 'answers', 'drafts', 'completed', 'conditionsApplied'])
    || !['source', 'mode', 'answers', 'drafts', 'completed'].every((key) => Object.hasOwn(value, key))
    || typeof value.source !== 'string' || !value.source.trim() || value.source.length > SOURCE_LIMIT
    || !MODES.includes(value.mode as FreePromptMode)
    || typeof value.completed !== 'boolean'
    || (value.conditionsApplied !== undefined && value.conditionsApplied !== true)
    || !isPlainRecord(value.answers) || !hasOnlyKeys(value.answers, FIELDS)
    || !isPlainRecord(value.drafts) || !hasOnlyKeys(value.drafts, FIELDS)) return false

  return Object.values(value.answers).every(isAnswer)
    && Object.values(value.drafts).every((draft) => typeof draft === 'string' && draft.length <= COACHING_ANSWER_LIMIT)
}
