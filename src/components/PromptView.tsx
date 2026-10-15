import { assembleBrief, checklist, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** The first prompt, plus the two things a beginner cannot see: what is missing, and what counts as done. */
export function PromptView({ onGoBrief, onRevise }: { onGoBrief: () => void; onRevise: () => void }) {
  const { project, template } = useStore()
  if (!project || !template) return null
  const missing = undecided(template, project)
  const en = assembleBrief(template, project, 'en')
  const ko = assembleBrief(template, project, 'ko')

  return (
    <div className="stack">
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
      <PromptBox en={en} ko={ko} filename={`${project.name}-first-prompt.txt`} />

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

      <div className="row step-actions">
        <p className="small muted">결과를 만든 뒤, 바꿀 부분과 유지할 부분을 함께 정해요.</p>
        <button type="button" className="secondary" onClick={onRevise}>결과 수정하기</button>
      </div>
    </div>
  )
}
