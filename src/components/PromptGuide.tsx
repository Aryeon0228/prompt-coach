import { useId, useState } from 'react'

type GuideMode = 'image' | 'video' | 'web'
type DetailKey = 'purpose' | 'subject' | 'look' | 'checks'
type ExampleDetail = { key: DetailKey; label: string; text: string; why: string }

const examples: Record<GuideMode, { short: string; note: string; details: ExampleDetail[] }> = {
  image: {
    short: '밤 기차역에 있는 고양이 이미지를 만들어 주세요.',
    note: '이미지는 한 화면 안에서 무엇을 먼저 보게 할지 정해 보세요.',
    details: [
      { key: 'purpose', label: '목적·출력', text: '여행 에세이 표지에 쓸 세로 2:3 일러스트입니다. 위쪽 1/3에는 제목을 넣을 여백을 남겨 주세요.', why: '사용할 곳과 화면 비율을 알면 구도와 여백의 기준을 세울 수 있어요.' },
      { key: 'subject', label: '대상·배치', text: '주황색 고양이 한 마리가 화면 오른쪽 아래 벤치에 앉아, 왼쪽 멀리 있는 열차를 바라봅니다. 시선은 고양이에 먼저 머물게 해 주세요.', why: '대상의 수, 위치, 바라보는 방향을 쓰면 머릿속 장면을 전달하기 쉬워져요.' },
      { key: 'look', label: '빛·스타일', text: '작은 노란 역등이 고양이의 얼굴과 등을 비추고, 배경은 차분한 남색으로 표현해 주세요. 종이 질감이 약하게 보이는 수채화 느낌입니다.', why: '“분위기 있게”를 빛의 위치, 색, 재료처럼 눈으로 확인할 수 있는 조건으로 바꿨어요.' },
      { key: 'checks', label: '제약·확인', text: '이미지 안에 글자는 넣지 마세요. 수채화 질감보다 고양이의 실루엣과 제목 여백 확보를 우선해 주세요.', why: '피할 요소와 우선순위를 정하면 결과를 볼 때 무엇부터 고칠지 알 수 있어요.' },
    ],
  },
  video: {
    short: '밤 기차역에 있는 고양이 영상을 만들어 주세요.',
    note: '영상은 시간 안에서 대상과 카메라가 각각 어떻게 움직이는지 나누어 보세요.',
    details: [
      { key: 'purpose', label: '목적·출력', text: '여행 에세이를 소개하는 세로 9:16, 6초 영상입니다. 컷 전환 없이 한 장면으로 보여 주세요.', why: '상영 시간과 화면 비율, 장면 수가 움직임을 설계하는 기준이 돼요.' },
      { key: 'subject', label: '대상·움직임', text: '고양이 한 마리가 오른쪽 벤치에 앉아 있습니다. 처음 2초는 정면을 보고, 이후 4초 동안 왼쪽 멀리 들어오는 열차 쪽으로 천천히 고개를 돌립니다. 카메라는 눈높이에서 고정해 주세요.', why: '시간 순서와 대상의 움직임을 카메라 움직임과 나누어 쓰면 해석할 여지가 줄어요.' },
      { key: 'look', label: '빛·스타일', text: '노란 역등 아래의 주황색 고양이와 남색 밤 배경을 수채화 애니메이션으로 표현해 주세요. 빛의 방향과 고양이의 털무늬는 장면 내내 유지해 주세요.', why: '화면의 분위기와 시간에 따라 유지할 특징을 함께 정했어요.' },
      { key: 'checks', label: '제약·확인', text: '자막과 추가 등장인물은 넣지 마세요. 세부 질감보다 고양이의 형태 유지와 자연스러운 고개 움직임을 우선해 주세요.', why: '결과를 다시 보며 형태의 일관성과 동작을 먼저 확인할 수 있어요.' },
    ],
  },
  web: {
    short: '밤 기차역에 있는 고양이의 3D 웹 장면을 만들어 주세요.',
    note: '3D 웹은 보이는 모습에 더해 사용자의 조작과 그 반응을 정해 보세요.',
    details: [
      { key: 'purpose', label: '목적·출력', text: '브라우저에서 둘러보는 작은 3D 기차역을 만들어 주세요. 데스크톱과 휴대폰 화면 안에 역과 고양이가 처음부터 모두 보이게 해 주세요.', why: '어디에서 어떻게 사용할지 알면 화면 구성과 구현 범위를 정하기 쉬워져요.' },
      { key: 'subject', label: '대상·상호작용', text: '오른쪽 벤치에 고양이 한 마리, 왼쪽에 철로를 배치해 주세요. 드래그하면 역을 중심으로 시점이 회전하고, 고양이를 클릭하거나 터치하면 고양이가 한 번 고개를 돌립니다.', why: '사용자의 입력과 화면의 반응을 짝지으면 동작을 확인할 기준이 생겨요.' },
      { key: 'look', label: '빛·스타일', text: '주황색 고양이, 노란 역등, 남색 밤 배경을 단순한 로우폴리 형태로 표현해 주세요. 역등이 고양이를 밝히고 바닥에 부드러운 그림자를 만듭니다.', why: '스타일 이름에 형태, 색, 빛의 관계를 덧붙여 원하는 모습을 좁혔어요.' },
      { key: 'checks', label: '제약·확인', text: '자동 카메라 회전과 배경음은 넣지 마세요. 정교한 장식보다 모바일에서의 드래그·터치 동작을 우선해 주세요. 장면을 만든 뒤 화면 크기를 바꾸며 두 조작을 확인해 주세요.', why: '기능의 우선순위와 직접 해 볼 확인 절차까지 요청에 담았어요.' },
    ],
  },
}

const principles = [
  { title: '목표와 쓰임부터', text: '무엇을 만들고 어디에 쓸지 적어 보세요. 표지, 짧은 영상, 조작하는 웹 장면은 필요한 정보가 달라요.' },
  { title: '느낌을 관찰 가능한 조건으로', text: '“멋지게”만 쓰기보다 대상의 수, 위치, 크기, 빛의 방향처럼 결과에서 확인할 수 있는 특징을 더해 보세요. 필요한 만큼만 구체화하면 돼요.' },
  { title: '출력과 우선순위를 분명하게', text: '화면 비율·길이·동작 등 결과의 형태와 피할 요소를 정하세요. 조건이 충돌한다면 무엇을 먼저 지킬지 쓰고, 중요하지 않은 부분은 열어 두어도 좋아요.' },
  { title: '참고 자료는 역할과 함께', text: '참고 이미지에서 구도, 색, 재질 중 무엇을 가져올지 적어 보세요. 자료 여러 개를 쓴다면 각각의 역할과 따르지 않을 부분을 구분해 주세요.' },
  { title: '결과를 비교하고 한 번 더', text: '처음에 정한 조건과 실제 결과를 비교하세요. 유지할 부분과 바꿀 부분을 나누고, 한 번에 하나 또는 적은 수의 조건을 바꾸면 영향을 비교하기 쉬워요.' },
]

/** A self-contained teaching example. It never reads or writes the user's project. */
export function PromptGuide({ mode }: { mode: GuideMode }) {
  const id = useId()
  const [enabled, setEnabled] = useState<DetailKey[]>([])
  const example = examples[mode]
  const selected = example.details.filter((detail) => enabled.includes(detail.key))

  const toggle = (key: DetailKey) => setEnabled((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])

  return (
    <section className="card stack prompt-guide" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>프롬프트를 구체적으로 쓰는 법</h2>
      <p className="muted">원하는 결과를 판단할 수 있도록, 목적과 중요한 조건을 알려 주세요.</p>

      <details className="guide-example">
        <summary>조건을 눌러, 요청이 어떻게 달라지는지 비교하기</summary>
        <div className="stack">
          <p className="small muted" id={`${id}-example-note`}>아래는 설명용 예시예요. 조건을 켜고 꺼도 작성 중인 장면이나 프롬프트는 바뀌지 않아요.</p>
          <div className="choices guide-toggles" role="group" aria-label="예시에 더할 조건" aria-describedby={`${id}-example-note`}>
            {example.details.map((detail) => (
              <button key={detail.key} type="button" className={`choice ${enabled.includes(detail.key) ? 'on' : ''}`} aria-pressed={enabled.includes(detail.key)} aria-controls={`${id}-result`} onClick={() => toggle(detail.key)}>
                {enabled.includes(detail.key) && <span aria-hidden="true">✓ </span>}{detail.label}
              </button>
            ))}
          </div>
          <div className="guide-compare">
            <div className="guide-prompt stack">
              <h3>짧은 요청</h3>
              <p>{example.short}</p>
              <p className="small muted">기본 장면을 전달하지만, 구체적인 모습은 많이 열려 있어요.</p>
            </div>
            <div className="guide-prompt guide-prompt-result stack" id={`${id}-result`}>
              <h3>조건을 더한 요청</h3>
              <p>{example.short}</p>
              {selected.map((detail) => <p key={detail.key} className="guide-added-detail">{detail.text}</p>)}
              {selected.length === 0 && <p className="small muted">위에서 조건을 눌러 예시를 바꿔 보세요.</p>}
            </div>
          </div>
          <div className="guide-reasons stack">
            <p className="small muted" role="status">{selected.length > 0 ? `${selected.map((detail) => detail.label).join(', ')} 조건을 더했어요.` : '추가한 조건이 없어요. 어떤 정보가 필요한지 하나씩 비교해 보세요.'}</p>
            {selected.map((detail) => <p key={detail.key} className="small"><strong>{detail.label}</strong> · {detail.why}</p>)}
            <p className="small muted">{example.note}</p>
          </div>
        </div>
      </details>

      <details className="guide-principles">
        <summary>작성하면서 살펴볼 다섯 가지</summary>
        <ol className="guide-principle-list stack">
          {principles.map((principle) => <li key={principle.title}><h3>{principle.title}</h3><p className="muted">{principle.text}</p></li>)}
        </ol>
      </details>

      <details className="guide-sources">
        <summary>참고 자료</summary>
        <div className="stack small muted">
          <p>모델과 도구에 따라 잘 반영되는 표현과 지원하는 설정이 달라요. 이 예시를 목적에 맞게 고치고, 화면 비율이나 영상 길이 같은 설정은 사용하는 도구에서도 확인해 주세요.</p>
          <ul>
            <li><a href="https://developers.openai.com/api/docs/guides/prompt-engineering" target="_blank" rel="noopener noreferrer">OpenAI · Prompt engineering (영문, 새 탭) ↗</a></li>
            <li><a href="https://developers.openai.com/api/docs/guides/image-prompting" target="_blank" rel="noopener noreferrer">OpenAI · Image prompting (영문, 새 탭) ↗</a></li>
          </ul>
        </div>
      </details>
    </section>
  )
}
