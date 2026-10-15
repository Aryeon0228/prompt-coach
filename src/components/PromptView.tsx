import { assembleBrief, checklist, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** The prompt is ready to take to a creation tool; checks and revision stay optional. */
export function PromptView({ onGoBrief, onRevise }: { onGoBrief: () => void; onRevise: () => void }) {
  const { project, template } = useStore()
  if (!project || !template) return null
  const missing = undecided(template, project)
  const en = assembleBrief(template, project, 'en')
  const ko = assembleBrief(template, project, 'ko')

  return (
    <div className="stack">
      <section className="prompt-ready stack">
        <h2>프롬프트 준비 완료</h2>
        <p className="muted">프롬프트를 복사한 뒤, 사용할 AI에 붙여 넣고 제작을 요청하세요.</p>
        <p className="small muted">장면 설정을 요청문으로 정리했어요. 3D 장면의 제작은 사용하는 AI 도구에서 이어가요.</p>
      </section>
      <PromptBox en={en} ko={ko} filename={`${project.name}-first-prompt.txt`} />
      {missing.length > 0 && (
        <div className="note warn row" style={{ justifyContent: 'space-between' }}>
          <span>
            <b>아직 정하지 않은 항목 {missing.length}개</b>: {missing.map((d) => d.label).join(', ')}
          </span>
          <button className="secondary" onClick={onGoBrief}>
            장면 설정으로
          </button>
        </div>
      )}
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>검수 기준 {checklist(template, project, 'ko').length}개 (프롬프트에 들어 있어요)</summary>
        <ol className="small" style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
          {checklist(template, project, 'ko').map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
        <p className="small muted" style={{ marginTop: 8 }}>
          결정을 바꾸면 기준도 따라 바뀌어요. AI에게는 이 목록이 "하나라도 어긋나면 버그"라는 뜻으로 전달돼요.
        </p>
      </details>

      <details className="card">
        <summary>결과를 받은 뒤 <span className="small muted">선택 · 수정 코치</span></summary>
        <p className="small muted">제작 도구에서 받은 결과를 확인하고, 바꿀 부분과 유지할 부분을 함께 정해요.</p>
        <button type="button" className="secondary" onClick={onRevise}>수정 코치 열기 →</button>
      </details>
    </div>
  )
}
