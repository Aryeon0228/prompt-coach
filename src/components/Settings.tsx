import { useRef, useState } from 'react'
import { useStore } from '../store'
import { downloadText, useToast } from './ui'

export function Settings() {
  const { project, template, updateProject, deleteProject } = useStore()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const deletionPending = useRef(false)
  if (!project || !template) return null
  const size = Math.round(JSON.stringify(project).length / 1024)

  return (
    <div className="stack">
      <section className="card stack project-management">
        <h2>프로젝트 관리</h2>
        <label className="stack" style={{ gap: 6 }}>
          <span className="small muted">프로젝트 이름</span>
          <input type="text" disabled={deleting} value={project.name} onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <p className="small muted">
          {template.name} · 참고 이미지 {project.references.length}장 · 수정 요청 {project.iterations.length}회 · 약 {size} KB
        </p>
        <section className="project-export stack">
          <div>
            <h3>파일로 보관하기</h3>
            <p className="small muted">입력한 내용, 참고 이미지, 프롬프트와 수정 기록을 한 파일에 담아요. 내 프로젝트의 ‘JSON 열기’로 다시 불러올 수 있어요.</p>
          </div>
          <div className="row">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}.prompt-coach.json`, JSON.stringify(project, null, 2))
                toast('JSON 파일을 내려받아요.')
              }}
            >
              프로젝트 JSON 내보내기
            </button>
          </div>
        </section>
        <p className="project-storage-note small muted">내용은 이 브라우저에 자동 저장돼요. 다른 기기에서 이어가거나 브라우저 데이터를 지우기 전에는 JSON 파일로 보관해 주세요.</p>
        <div className="project-danger row">
          <div>
            <h3>프로젝트 삭제</h3>
            <p className="small muted">현재 브라우저에서 이 프로젝트를 지워요.</p>
          </div>
          <button
            type="button"
            className="danger"
            disabled={deleting}
            onClick={async () => {
              if (deletionPending.current || !confirm(`"${project.name}" 프로젝트를 이 브라우저에서 지울까요? 내보낸 JSON 파일이 없으면 되살릴 수 없어요.`)) return
              deletionPending.current = true
              setDeleting(true)
              try {
                await deleteProject(project.id)
                toast('프로젝트를 삭제했어요.')
              } catch (error) {
                toast(`삭제하지 못했어요. ${error instanceof Error ? error.message : '다시 시도해 주세요.'}`)
              } finally {
                deletionPending.current = false
                setDeleting(false)
              }
            }}
          >
            {deleting ? '삭제 중…' : '이 프로젝트 삭제'}
          </button>
        </div>
      </section>
    </div>
  )
}
