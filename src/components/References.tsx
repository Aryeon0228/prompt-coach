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
      <div className="note">
        참고할 이미지가 있다면 <b>역할</b>을 골라 주세요. 구도, 색, 대상의 모양 중 무엇을 가져올지 메모하면 요청이 구체적이 돼요. 프롬프트에는 "이미지 2는 구름 모양만 참고"처럼 번호와 역할이 적혀요. 사용하는 AI 도구가 이미지 입력을 지원한다면, 이미지도 같은 순서로 직접 첨부하세요.
      </div>
      <label className="upload">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => add(e.target.files)} />
        <span>
          + 이미지 추가 (여러 장 가능)
          <br />
          <span className="small" style={{ fontWeight: 400 }}>
            PNG · JPG · WebP, 기기 안에서 작게 줄여 저장해요
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
            <select aria-label={`참고 이미지 ${i + 1}의 역할`} value={r.role} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, role: e.target.value } : x)) }))}>
              {template.referenceRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
            <input aria-label={`참고 이미지 ${i + 1} 메모`} type="text" placeholder="메모 (예: 구름 모양만)" value={r.note ?? ''} onChange={(e) => updateProject((p) => ({ ...p, references: p.references.map((x) => (x.id === r.id ? { ...x, note: e.target.value } : x)) }))} />
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
      {!project.references.length && <p className="small muted">참고 이미지는 선택 사항이에요. 없으면 작성한 장면 설명으로 요청문을 만들어요.</p>}
    </div>
  )
}
