import { useState } from 'react'
import { createFreeBrief, type FreePromptBrief, type FreePromptMode } from '../lib/free-prompt'
import { useStore } from '../store'
import { PromptGuide } from './PromptGuide'
import { FREE_MODES } from '../lib/free-modes'

type Field = Exclude<keyof FreePromptBrief, 'mode'>
type Question = { id: Field; label: string; why: string; example: string; required?: boolean }

function questions(mode: FreePromptMode): Array<{ title: string; summary: string; fields: Question[] }> {
  return [
    { title: '목표와 맥락', summary: '무엇을 만들고, 어디에 쓸까요?', fields: [
      { id: 'idea', label: '만들고 싶은 장면', required: true, why: '주인공과 상황부터 적으세요. 한 문장으로 시작해도 좋아요.', example: '비 오는 밤, 작은 기차역에서 빨간 우산을 든 고양이가 마지막 열차를 기다리는 장면.' },
      { id: 'purpose', label: '용도와 보는 사람', why: '같은 장면도 사용처에 따라 강조할 부분과 분위기가 달라져요.', example: mode === 'web' ? '포트폴리오 방문자가 30초 동안 둘러볼 수 있는 작은 인터랙티브 공간.' : mode === 'video' ? '여행 앱의 첫 화면에서 반복 재생할, 소리 없이도 분위기가 전해지는 영상.' : '어린이 동화책 표지. 제목을 올릴 공간이 필요해요.' },
    ] },
    { title: '대상과 구성', summary: '무엇이 어디에 있고, 어떤 관계인가요?', fields: [
      { id: 'subject', label: '대상 · 행동 · 배경', why: '수, 위치, 행동과 주변 대상의 관계를 적으면 추측할 부분이 줄어요.', example: '고양이는 한 마리. 화면 오른쪽 벤치 옆에 서 있고, 왼쪽에는 불 켜진 작은 대합실이 있어요.' },
      { id: 'composition', label: mode === 'video' ? '구도와 카메라 이동' : mode === 'web' ? '첫 화면과 시점' : '구도와 시점', why: '“멋진 구도” 대신 대상의 크기, 시선 높이, 여백처럼 확인할 수 있는 조건을 적어 보세요.', example: mode === 'video' ? '고양이 눈높이의 중경으로 시작해 천천히 가까워져요. 중간에 컷을 바꾸지 않아요.' : mode === 'web' ? '처음에는 역 전체가 보이는 비스듬한 시점. 회전해도 바닥 아래로 내려가지 않아요.' : '고양이는 화면 오른쪽 1/3, 눈높이 시점. 왼쪽 위에는 제목을 위한 여백을 남겨요.' },
    ] },
    { title: '표현과 결과물', summary: mode === 'video' ? '어떤 모습이 시간에 따라 바뀌나요?' : mode === 'web' ? '어떻게 보이고, 조작에 어떻게 반응하나요?' : '어떤 느낌의 한 장이 필요한가요?', fields: [
      { id: 'style', label: '스타일 · 색 · 빛', why: '분위기 단어를 시각적 단서와 함께 적어 보세요. 필요한 특징 몇 가지에 집중하면 돼요.', example: '고요한 수채화 느낌. 푸른 빗속에 대합실의 주황빛만 따뜻하게 비치고, 젖은 바닥에는 빛이 희미하게 반사돼요.' },
      { id: 'details', label: mode === 'video' ? '길이 · 동작 순서 · 소리' : mode === 'web' ? '상호작용 · 실행 환경' : '비율 · 형식 · 정확한 문구', why: mode === 'video' ? '몇 초에 무엇이 바뀌는지, 카메라와 대상 중 무엇이 움직이는지 구분하세요.' : mode === 'web' ? '입력 → 반응을 한 쌍으로 적으세요. 사용하는 기기나 기술 제약도 필요할 때만 더해요.' : '최종 결과물의 용도에 맞춰 비율과 형식을 적으세요. 들어갈 글자가 있다면 정확히 인용하세요.', example: mode === 'video' ? '6초 반복 영상. 0–2초에는 기다리고, 2–4초에는 고개를 돌리고, 4–6초에는 처음 자세로 돌아와요. 소리는 없어요.' : mode === 'web' ? '표지판을 누르면 안내 문구가 나타나요. 마우스 드래그와 한 손가락 드래그로 시점을 회전해요. 모바일 브라우저에서도 실행돼요.' : '세로 4:5, PNG. 이미지 안에는 글자를 만들지 않고 제목은 나중에 직접 넣을 거예요.' },
    ] },
    { title: '제약과 확인 기준', summary: '꼭 지킬 것과 결과를 확인할 기준을 정해요.', fields: [
      { id: 'constraints', label: '꼭 지킬 것 · 피할 것 · 우선순위', why: '“너무 복잡하지 않게”보다 남길 요소를 적어 주세요. 조건이 충돌할 때 무엇이 더 중요한지도 알려 주세요.', example: '고양이 한 마리와 빨간 우산은 반드시 유지해요. 배경 인물과 광고 문구는 넣지 않아요. 배경 디테일보다 고양이 실루엣이 잘 보이는 것이 우선이에요.' },
      { id: 'success', label: '결과에서 확인할 것', why: '“고퀄리티”처럼 판단하기 어려운 말보다, 완성 결과에서 직접 확인할 수 있는 기준을 적어 보세요.', example: mode === 'video' ? '처음과 마지막 자세가 이어지는지, 우산 색과 고양이 수가 중간에 바뀌지 않는지 확인해요.' : mode === 'web' ? '터치로 표지판이 열리는지, 닫기 버튼이 작동하는지, 작은 화면에서도 설명을 읽을 수 있는지 확인해요.' : '고양이와 우산 끝이 잘리지 않는지, 왼쪽 위 여백에 제목이 들어가는지 확인해요.' },
    ] },
  ]
}

export function FreeBrief({ onPreview, onRefine }: { onPreview: () => void; onRefine: () => void }) {
  const { project, updateProject } = useStore()
  const [opened, setOpened] = useState(0)
  if (!project) return null
  const brief = project.freeform ?? createFreeBrief()
  const groups = questions(brief.mode)
  const change = (field: keyof FreePromptBrief, value: string) => updateProject(p => ({ ...p, freeform: { ...(p.freeform ?? createFreeBrief()), [field]: value } }))

  return <div className="stack free-brief">
    <div className="note">핵심 장면부터 적고, 필요한 조건만 더해 보세요. 입력한 내용은 그대로 보관되고, 예시 문장은 요청문에 들어가지 않아요.</div>
    <fieldset className="free-mode-fieldset"><legend>만들 결과물</legend><div className="choices">{FREE_MODES.map(mode => <button type="button" key={mode.id} className={`choice ${brief.mode === mode.id ? 'on' : ''}`} aria-pressed={brief.mode === mode.id} onClick={() => change('mode', mode.id)}>{mode.label}</button>)}</div><p className="small muted">종류를 바꾸어도 작성한 내용은 유지돼요. 출력 조건은 새 결과물에 맞는지 다시 확인해 주세요.</p></fieldset>
    <PromptGuide mode={brief.mode} />
    {groups.map((group, i) => <section className="card free-question-group" key={group.title}>
      <h2><button type="button" className="free-group-toggle" aria-expanded={opened === i} aria-controls={`free-group-${i}`} onClick={() => setOpened(opened === i ? -1 : i)}><span className="free-group-index">0{i + 1}</span><span><strong>{group.title}</strong><small>{group.summary}</small></span><span className="free-group-count">{group.fields.filter(f => brief[f.id].trim()).length}/{group.fields.length} 작성</span><span aria-hidden="true">{opened === i ? '−' : '+'}</span></button></h2>
      <div className="stack free-group-body" id={`free-group-${i}`} hidden={opened !== i}>
        {group.fields.map(field => <div className="free-field" key={field.id}>
          <label htmlFor={`free-${field.id}`}>{field.label}{field.required && <span className="pill">필수</span>}</label>
          <p className="small muted" id={`why-${field.id}`}>{field.why}</p>
          <textarea id={`free-${field.id}`} value={brief[field.id]} onChange={e => change(field.id, e.target.value)} aria-describedby={`why-${field.id}`} required={field.required} rows={field.id === 'idea' ? 3 : 2} placeholder={field.required ? "만들고 싶은 대상과 상황을 한 문장으로 적어 주세요." : "내 장면에 맞게 적어 주세요. 아직 정하지 않았다면 비워 두어도 돼요."} />
          <details className="field-example"><summary>어느 정도로 구체적으로 쓸까요?</summary><p>{field.example}</p><small className="muted">작성 예시예요. 필요한 조건과 정도는 내 장면에 맞게 바꾸세요.</small></details>
        </div>)}
        <div className="row step-actions"><span className="small muted">{i === 0 ? '장면 아이디어만 있어도 시작할 수 있어요.' : '이 항목들이 필요하지 않으면 다음으로 넘어가도 돼요.'}</span>{i < groups.length - 1 ? <button className="secondary" onClick={() => {setOpened(i + 1); requestAnimationFrame(() => document.getElementById(`free-${groups[i + 1].fields[0].id}`)?.focus())}}>다음 조건 →</button> : <button onClick={onPreview} disabled={!brief.idea.trim()}>프롬프트 확인하기 →</button>}</div>
      </div>
    </section>)}
    <section className="card stack free-coaching-entry"><h2>어떤 조건을 더 정하면 좋을까요?</h2><p className="small muted">지금 쓴 내용을 바탕으로 내 ChatGPT에서 질문을 주고받아요. 무엇이 부족한지, 왜 필요한지 함께 짚어 볼 수 있어요.</p><div className="row"><button onClick={onRefine} disabled={!brief.idea.trim()}>질문으로 구체화하기 →</button><button className="ghost" onClick={onPreview} disabled={!brief.idea.trim()}>지금 내용으로 프롬프트 보기</button></div></section>
    {!brief.idea.trim() && <p className="small muted" role="status">‘만들고 싶은 장면’을 먼저 한 문장 적어 주세요.</p>}
  </div>
}
