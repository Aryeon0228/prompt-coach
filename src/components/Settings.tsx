import { useStore } from '../store'
import { downloadText, useToast } from './ui'

export function Settings() {
  const { project, template, updateProject, deleteProject } = useStore()
  const toast = useToast()
  if (!project || !template) return null
  const size = Math.round(JSON.stringify(project).length / 1024)

  return (
    <div className="stack">
      <section className="card stack">
        <h2>프로젝트</h2>
        <label className="stack" style={{ gap: 6 }}>
          <span className="small muted">이름</span>
          <input type="text" value={project.name} onChange={(e) => updateProject((p) => ({ ...p, name: e.target.value }))} />
        </label>
        <p className="small muted">
          템플릿 {template.name} v{template.version} · 참고 이미지 {project.references.length}장 · 수정 요청 {project.iterations.length}회 · 약 {size} KB
        </p>
      </section>

      <section className="card stack">
        <h2>프로젝트 보관 · 내보내기</h2>
        <p className="small muted">결정, 참고 이미지, 잠금, 수정 기록이 전부 한 파일에 담겨요. 작업을 보관하거나 다른 기기에서 이어갈 때 쓰세요. 시작 화면의 "JSON 열기"로 다시 불러올 수 있어요.</p>
        <div className="row">
          <button
            onClick={() => {
              downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}.prompt-coach.json`, JSON.stringify(project, null, 2))
              toast('JSON 파일을 내려받아요.')
            }}
          >
            프로젝트 JSON 내보내기
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>장면별 템플릿</h2>
        <p className="small muted">
          새 프로젝트에서 미니어처 섬이나 제품 연출처럼 만들고 싶은 장면을 골라 시작하세요. 템플릿마다 결정할 항목과 결과를 살펴볼 기준이 준비되어 있어요.
        </p>
      </section>

      <section className="card stack">
        <h2>삭제</h2>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`"${project.name}" 프로젝트를 이 기기에서 지울까요? 내보낸 JSON 파일이 없으면 되살릴 수 없어요.`)) deleteProject(project.id)
          }}
        >
          이 프로젝트 삭제
        </button>
      </section>
    </div>
  )
}
