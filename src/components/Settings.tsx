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
          템플릿 {template.name} v{template.version} · 참고 이미지 {project.references.length}장 · 반복 {project.iterations.length}회 · 약 {size} KB
        </p>
      </section>

      <section className="card stack">
        <h2>내보내기 · 제출</h2>
        <p className="small muted">결정·참고 이미지·잠금·모든 반복 기록이 한 파일에 담겨요. 과제 제출이나 다른 기기로 옮길 때 쓰세요. 시작 화면의 "JSON 열기"로 다시 불러옵니다.</p>
        <div className="row">
          <button
            onClick={() => {
              downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}.prompt-coach.json`, JSON.stringify(project, null, 2))
              toast('JSON 파일로 저장을 요청했어요.')
            }}
          >
            프로젝트 JSON 내보내기
          </button>
        </div>
      </section>

      <section className="card stack">
        <h2>템플릿 바꾸기 · 만들기</h2>
        <p className="small muted">
          템플릿은 <code>public/templates/</code>의 JSON 파일이에요. 결정 항목, 프롬프트 문장(영/한), 검수 기준, 진단 트리, 느낌 사전이 모두 그 안에 있어서, 코드를 건드리지 않고 다른 과제용 템플릿을 추가할 수 있어요. <code>index.json</code>에 한 줄 등록하면 시작 화면에 나타납니다.
        </p>
      </section>

      <section className="card stack">
        <h2>위험 구역</h2>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`"${project.name}"을(를) 이 기기에서 지울까요? 내보낸 JSON이 없으면 복구할 수 없어요.`)) deleteProject(project.id)
          }}
        >
          이 프로젝트 삭제
        </button>
      </section>
    </div>
  )
}
