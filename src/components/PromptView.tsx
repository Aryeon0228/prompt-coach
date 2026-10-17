import { useId } from 'react'
import { assembleBrief, checklist, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** The prompt is ready to take to a creation tool; checks and revision stay optional. */
export function PromptView({ onGoBrief, onRevise }: { onGoBrief: () => void; onRevise: () => void }) {
  const { project, template } = useStore()
  const readyTitleId = useId()
  if (!project || !template) return null
  const missing = undecided(template, project)
  const en = assembleBrief(template, project, 'en')
  const ko = assembleBrief(template, project, 'ko')

  return (
    <div className="stack prompt-result-page">
      <section className="prompt-ready stack" aria-labelledby={readyTitleId}>
        <h2 id={readyTitleId}>프롬프트 준비 완료</h2>
        <p className="prompt-output-help">3D 웹 · 장면 설정을 제작 요청문으로 정리했어요.</p>
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
      <details className="card prompt-secondary">
        <summary>
          <span className="prompt-secondary-copy">
            <span>검수 기준 {checklist(template, project, 'ko').length}개</span>
            <small>프롬프트에 포함된 결과 확인 기준</small>
          </span>
        </summary>
        <ol className="small" style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>
          {checklist(template, project, 'ko').map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
        <p className="small muted" style={{ marginTop: 8 }}>
          결정을 바꾸면 기준도 따라 바뀌어요. AI에게는 이 목록이 "하나라도 어긋나면 버그"라는 뜻으로 전달돼요.
        </p>
      </details>

      <details className="card prompt-secondary">
        <summary>
          <span className="prompt-secondary-copy">
            <span>결과를 받은 뒤</span>
            <small>선택 · 수정 코치</small>
          </span>
        </summary>
        <p className="small muted">제작 도구에서 받은 결과를 확인하고, 바꿀 부분과 유지할 부분을 함께 정해요.</p>
        <button type="button" className="secondary" onClick={onRevise}>수정 코치 열기 →</button>
      </details>
    </div>
  )
}
