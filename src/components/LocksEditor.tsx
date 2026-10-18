import { useState } from 'react'
import { useStore } from '../store'

/** Persistent conditions that belong alongside the requested change. */
export function LocksEditor() {
  const { project, updateProject } = useStore()
  const [value, setValue] = useState('')
  if (!project) return null

  const add = () => {
    const next = value.trim()
    if (!next) return
    updateProject((p) => ({ ...p, locks: p.locks.includes(next) ? p.locks : [...p.locks, next] }))
    setValue('')
  }

  return (
    <section className="revision-change-panel revision-preserve-panel" aria-labelledby="revision-locks-title">
      <div className="question-copy">
        <h3 className="question-title" id="revision-locks-title"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>유지할 내용</h3>
        <p className="question-help">이미 마음에 드는 부분을 적어 두세요. 추가한 조건은 다음 수정 요청에도 계속 반영돼요.</p>
      </div>
      {project.locks.length > 0 && (
        <ul className="locks-list">
          {project.locks.map((lock, index) => (
            <li key={index} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{lock}</span>
              <button type="button" className="ghost" aria-label={`유지할 내용 삭제: ${lock}`} onClick={() => updateProject((p) => ({ ...p, locks: p.locks.filter((_, i) => i !== index) }))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="revision-lock-input">
        <label className="question-answer-label" htmlFor="revision-preserve-input">그대로 둘 부분 <span className="small muted">선택</span></label>
        <div className="revision-lock-add">
        <input id="revision-preserve-input" type="text" aria-describedby="revision-preserve-help" value={value} placeholder="예: 대상의 색과 카메라 시점" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add()
          }
        }} />
        <button type="button" className="secondary" disabled={!value.trim()} onClick={add}>추가</button>
        </div>
        <p className="question-help" id="revision-preserve-help">입력 후 ‘추가’를 눌러 유지 조건에 반영하세요.</p>
      </div>
    </section>
  )
}
