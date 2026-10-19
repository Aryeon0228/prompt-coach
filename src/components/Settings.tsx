import { useRef, useState } from 'react'
import { useStore } from '../store'
import { downloadText, useToast } from './ui'

export function Settings() {
  const { project, template, updateProject, deleteProject } = useStore()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const deletionPending = useRef(false)
  if (!project || !template) return null

  return (
    <div className="stack project-settings">
      <section className="card settings-section" aria-labelledby="settings-name-title">
        <header className="settings-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/></svg>
          <div><h2 id="settings-name-title">프로젝트 이름 바꾸기</h2><p>목록에서 알아보기 쉬운 이름을 붙여 주세요.</p></div>
        </header>
        <label className="settings-name-field" htmlFor="settings-project-name">
          <span>프로젝트 이름</span>
          <input id="settings-project-name" type="text" aria-describedby="settings-name-help" disabled={deleting} value={project.name} onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <p className="settings-help" id="settings-name-help">이름을 바꾸면 이 브라우저에 자동 저장돼요.</p>
      </section>

      <section className="card settings-section" aria-labelledby="settings-export-title">
        <header className="settings-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2ZM3 9h18"/></svg>
          <div><h2 id="settings-export-title">파일로 저장하기</h2><p>장면 설정·참고 이미지·프롬프트·수정 기록을 한 파일에 담아요.</p></div>
        </header>
        <div className="settings-file">
          <div className="settings-file-info">
            <span className="settings-file-type" aria-label="JSON 파일">JSON</span>
            <div><h3>프로젝트 전체 파일</h3><p>참고 이미지 {project.references.length}장 · 수정 기록 {project.iterations.length}개</p></div>
          </div>
            <button
              type="button"
              className="settings-download"
              disabled={deleting}
              onClick={() => {
                downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}.prompt-coach.json`, JSON.stringify(project, null, 2))
                toast('JSON 파일을 내려받아요.')
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>
              프로젝트 파일 저장
            </button>
        </div>
        <div className="settings-storage-help">
          <p>작업은 이 브라우저에 자동 저장돼요. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에는 파일로 보관하세요.</p>
          <p><span>다시 불러오기</span> 내 프로젝트 → JSON 열기에서 저장한 파일을 선택하세요.</p>
        </div>
      </section>

      <section className="settings-delete" aria-labelledby="settings-delete-title">
        <header className="settings-section-heading">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
          <div>
            <h2 id="settings-delete-title">프로젝트 삭제</h2>
            <p>이 브라우저에서 프로젝트와 수정 기록을 지워요.</p>
            <p>삭제 전 파일로 저장해 두면 다시 불러올 수 있어요.</p>
          </div>
        </header>
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
      </section>
    </div>
  )
}
