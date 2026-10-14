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
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        const dataUrl = await loadImage(f)
        updateProject((p) => ({ ...p, references: [...p.references, { id: uid(), role: template.referenceRoles[0]?.id ?? 'any', name: f.name, dataUrl }] }))
      } catch (e) {
        toast((e as Error).message)
      }
    }
  }

  return (
    <div className="stack">
      <div className="note">
        참고 이미지는 글보다 힘이 세요. <b>역할</b>을 꼭 고르세요 — "구도용"인지 "색감용"인지 "이 생물처럼"인지 모르면 AI는 이미지 전체를 따라 하려다 엉뚱한 걸 가져옵니다. 프롬프트에는 "이미지 2는 구름 스타일 참고" 처럼 번호와 역할이 적히고, 코딩 AI에는 같은 순서로 직접 첨부하세요.
      </div>
      <label className="upload">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => add(e.target.files)} />
        <span>
          + 이미지 추가 (여러 장 가능)
          <br />
          <span className="small" style={{ fontWeight: 400 }}>
            PNG · JPG · WebP · 기기에서 줄여서 저장
          </span>
        </span>
      </label>
      <div className="refs">
        {project.references.map((r, i) => (
          <div className="ref" key={r.id}>
            <div style={{ position: 'relative' }}>
              <span className="num">{i + 1}</span>
              <img src={r.dataUrl} alt={r.name} />
            </div>
            <select value={r.role} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, role: e.target.value } : x)) }))}>
              {template.referenceRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
            <input type="text" placeholder="메모 (예: 구름 모양만)" value={r.note ?? ''} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)) }))} />
            <div className="row" style={{ padding: '0 8px', justifyContent: 'space-between' }}>
              <span className="small muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90 }}>
                {r.name}
              </span>
              <button className="ghost" onClick={() => updateProject((p) => ({ ...p, references: p.references.filter((x) => x.id !== r.id) }))}>
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
      {!project.references.length && <p className="small muted">아직 없어요. 없어도 프롬프트는 만들어지지만, 한 장이라도 있으면 결과가 크게 달라져요.</p>}
    </div>
  )
}
