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
    <section className="revision-change-panel stack" aria-labelledby="revision-locks-title">
      <div>
        <h3 id="revision-locks-title">유지할 내용</h3>
        <p className="small muted">이미 마음에 드는 부분을 적어 두세요. 다음 수정 요청에도 계속 반영돼요.</p>
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
      <div className="row">
        <input type="text" aria-label="유지할 내용" value={value} placeholder="예: 대상의 색과 카메라 시점" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            add()
          }
        }} style={{ flex: 1, minWidth: 160 }} />
        <button type="button" className="secondary" disabled={!value.trim()} onClick={add}>추가</button>
      </div>
    </section>
  )
}
