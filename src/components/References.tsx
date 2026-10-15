import { useRef } from 'react'
import { uid } from '../lib/db'
import { loadImage } from '../lib/image'
import { useStore } from '../store'
import { useToast } from './ui'

/** Reference images with a role each: the single most effective input a brief can carry. */
export function References() {
  const { project, template, updateProject } = useStore()
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  if (!project || !template) return null

  const add = async (files: FileList | null) => {
    if (!files?.length) return
    const projectId = project.id
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        const dataUrl = await loadImage(f)
        updateProject((p) => p.id !== projectId ? p : ({ ...p, references: [...p.references, { id: uid(), role: template.referenceRoles[0]?.id ?? 'any', name: f.name, dataUrl }] }))
      } catch (e) {
        toast((e as Error).message)
      }
    }
  }

  return (
    <div className="stack">
      <label className="upload">
        <input ref={input} type="file" aria-describedby="reference-upload-help" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => add(e.target.files)} />
        <span>
          + 참고 이미지 추가
          <br />
          <span id="reference-upload-help" className="small" style={{ fontWeight: 400 }}>
            선택 사항 · PNG · JPG · WebP 여러 장 가능
          </span>
        </span>
      </label>
      {project.references.length > 0 && <p className="small muted reference-order-note">이 순서대로 프롬프트에 번호가 붙어요. 각 이미지에서 참고할 특징을 골라 주세요.</p>}
      <div className="refs">
        {project.references.map((r, i) => (
          <div className="ref" key={r.id}>
            <div style={{ position: 'relative' }}>
              <span className="num">{i + 1}</span>
              <img src={r.dataUrl} alt={r.name} />
            </div>
            <label className="ref-field">
              <span className="small muted">참고할 특징</span>
              <select aria-label={`참고 이미지 ${i + 1}의 역할`} value={r.role} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, role: e.target.value } : x)) }))}>
                {template.referenceRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="ref-field">
              <span className="small muted">더 구체적으로 (선택)</span>
              <input aria-label={`참고 이미지 ${i + 1} 메모`} type="text" placeholder="예: 구름의 둥근 모양만" value={r.note ?? ''} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)) }))} />
            </label>
            <div className="row" style={{ padding: '0 8px', justifyContent: 'space-between' }}>
              <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                {r.name}
              </span>
              <button type="button" className="ghost" aria-label={`참고 이미지 ${i + 1} 삭제`} onClick={() => updateProject((p) => ({ ...p, references: p.references.filter((x) => x.id !== r.id) }))}>
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
