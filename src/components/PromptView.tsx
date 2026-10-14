import { useState } from 'react'
import { assembleBrief, checklist, undecided } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** The first prompt, plus the two things a beginner cannot see: what is missing, and what counts as done. */
export function PromptView({ onGoBrief }: { onGoBrief: () => void }) {
  const { project, template, updateProject } = useStore()
  const [lock, setLock] = useState('')
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

      <section className="card stack">
        <div>
          <h3>잠금: 이미 마음에 드는 것</h3>
          <p className="small muted">결과를 보고 나서 채우는 칸이에요. 여기 적은 내용은 첫 프롬프트와 모든 수정 프롬프트 끝에 "이건 바꾸지 마"로 붙어요. 하나 고치다가 다른 게 망가지는 일을 막아 줘요.</p>
        </div>
        {project.locks.map((l, i) => (
          <div className="row" key={i} style={{ justifyContent: 'space-between' }}>
            <span>잠금 · {l}</span>
            <button className="ghost" onClick={() => updateProject((p) => ({ ...p, locks: p.locks.filter((_, k) => k !== i) }))}>
              해제
            </button>
          </div>
        ))}
        <div className="row">
          <input type="text" aria-label="유지할 내용" value={lock} placeholder="예: 섬의 색과 야자수 모양" onChange={(e) => setLock(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button
            className="secondary"
            disabled={!lock.trim()}
            onClick={() => {
              updateProject((p) => ({ ...p, locks: [...p.locks, lock.trim()] }))
              setLock('')
            }}
          >
            잠그기
          </button>
        </div>
      </section>
    </div>
  )
}
