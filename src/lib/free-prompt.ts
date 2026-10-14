import type { Reference } from '../types'

export type FreePromptMode = 'image' | 'video' | 'web'

export interface FreePromptBrief {
  mode: FreePromptMode
  idea: string
  purpose: string
  subject: string
  composition: string
  style: string
  details: string
  constraints: string
  success: string
}

type BriefField = Exclude<keyof FreePromptBrief, 'mode'>

const FIELD_LABELS: Record<BriefField, string> = {
  idea: '만들고 싶은 장면',
  purpose: '목적과 보는 사람',
  subject: '주요 대상과 행동',
  composition: '구도와 배치',
  style: '분위기와 표현',
  details: '구체적인 조건',
  constraints: '지켜야 할 조건',
  success: '결과 확인 기준',
}

const REFERENCE_ROLES: Record<string, string> = {
  composition: '구도·배치',
  appearance: '색·재질·분위기',
  subject: '대상·형태',
  motion: '움직임',
  avoid: '피할 표현',
}

const OUTPUT_REQUESTS: Record<FreePromptMode, string> = {
  image: '위 조건에 맞는 이미지를 만들어 주세요.',
  video: '위 조건에 맞는 영상을 만들어 주세요. 적어 둔 동작과 장면의 흐름을 반영해 주세요.',
  web: '위 조건을 브라우저에서 실행할 수 있는 3D 웹 장면으로 구현해 주세요. 실행 방법도 함께 알려 주세요.',
}

export function createFreeBrief(idea = '', mode: FreePromptMode = 'image'): FreePromptBrief {
  return { mode, idea, purpose: '', subject: '', composition: '', style: '', details: '', constraints: '', success: '' }
}

/** Only decide whether a field is present; never rewrite the user's actual words. */
function hasText(value: string): boolean {
  return value.trim().length > 0
}

/** A deterministic brief, not an AI rewrite: examples and unanswered fields never enter it. */
export function assembleFreePrompt(brief: FreePromptBrief, references: Reference[] = [], locks: string[] = []): string {
  const parts: string[] = []
  for (const field of Object.keys(FIELD_LABELS) as BriefField[]) {
    if (hasText(brief[field])) parts.push(`[${FIELD_LABELS[field]}]\n${brief[field]}`)
  }

  if (references.length) {
    const lines = references.map((reference, index) => {
      const role = REFERENCE_ROLES[reference.role] ?? '참고 이미지'
      const name = hasText(reference.name) ? ` — ${reference.name}` : ''
      const note = reference.note && hasText(reference.note) ? `\n참고할 점: ${reference.note}` : ''
      return `이미지 ${index + 1}: ${role}${name}${note}`
    })
    parts.push('[참고 이미지]\n' + lines.join('\n\n') + '\n\n전달할 때 이미지 파일도 이 번호 순서대로 함께 첨부하세요. 텍스트를 복사해도 이미지는 포함되지 않습니다.')
  }

  const activeLocks = locks.filter(hasText)
  if (activeLocks.length) parts.push('[유지할 부분]\n이미 정한 아래 내용은 바꾸지 말아 주세요.\n' + activeLocks.map((lock) => `- ${lock}`).join('\n'))

  if (!parts.length) return ''
  parts.push(`[출력 요청]\n${OUTPUT_REQUESTS[brief.mode]}`)
  return parts.join('\n\n')
}

/** Presence checks only. A filled field is not a claim that its content is good or correct. */
export function reviewFreeBrief(brief: FreePromptBrief): Array<{ id: string; label: string; filled: boolean; hint: string }> {
  const hints: Record<BriefField, string> = {
    idea: '무엇을 만들고 싶은지 한 문장으로 적어 보세요. 나머지 조건은 이 장면을 구체화해요.',
    purpose: '누가 어디에서 볼 결과인지 적으면, 강조할 내용과 표현을 정하기 쉬워져요.',
    subject: '주요 대상의 수, 특징, 행동과 주변 대상과의 관계를 적어 보세요.',
    composition: brief.mode === 'video'
      ? '무엇을 먼저 보여 주고 어떻게 이어질지, 카메라의 위치와 움직임을 적어 보세요.'
      : brief.mode === 'web'
        ? '처음 보이는 시점, 대상의 배치와 크기, 사용자가 움직일 수 있는 범위를 적어 보세요.'
        : '대상의 위치와 크기, 보는 각도, 여백과 화면 비율을 적어 보세요.',
    style: '느낌을 나타내는 말에 색, 빛, 재질처럼 눈으로 확인할 수 있는 단서를 붙여 보세요.',
    details: brief.mode === 'video'
      ? '길이, 화면 비율, 동작의 속도와 순서, 소리가 필요한지 등 중요한 조건만 적어 보세요.'
      : brief.mode === 'web'
        ? '클릭·드래그에 대한 반응과 필요한 화면 상태, 사용할 기기 등 구현 조건을 적어 보세요.'
        : '대상에서 꼭 보일 특징, 배경, 빛 방향과 필요한 문구 등 빠지면 안 되는 것을 적어 보세요.',
    constraints: '반드시 지킬 조건과 피할 표현을 구분하세요. 여러 조건이 충돌하면 무엇을 우선할지도 적어 보세요.',
    success: '완성된 결과를 보고 충족 여부를 확인할 수 있는 기준을 적어 보세요. 막연한 칭찬보다 관찰할 항목이 도움이 돼요.',
  }

  return (Object.keys(FIELD_LABELS) as BriefField[]).map((field) => ({
    id: field,
    label: FIELD_LABELS[field],
    filled: hasText(brief[field]),
    hint: hints[field],
  }))
}
