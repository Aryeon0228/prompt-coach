export type CoachingMethod = 'guide' | 'chatgpt'

/** Describe the destination before the user chooses how to refine their scene. */
export function CoachingMethodChoices({ onChoose, disabled = false }: {
  onChoose: (method: CoachingMethod) => void
  disabled?: boolean
}) {
  return <div className="coaching-choice-grid" role="group" aria-label="구체화 방법 선택">
    <button type="button" className="choice coaching-choice" disabled={disabled} onClick={() => onChoose('guide')}>
      <strong>사이트 기본 질문</strong>
      <span>설치 없이 이 페이지에서 준비된 질문에 답해요. 빈 조건을 하나씩 정리할 수 있어요.</span>
      <small>기본 질문 열기 →</small>
    </button>
    <button type="button" className="choice coaching-choice" disabled={disabled} onClick={() => onChoose('chatgpt')}>
      <strong>내 AI와 대화</strong>
      <span>요청문을 복사해 ChatGPT·Claude에서 내 장면에 맞는 질문을 받아요.</span>
      <small>내 AI로 이어가는 방법 →</small>
    </button>
  </div>
}
