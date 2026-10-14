import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { TemplateIndexEntry } from '../types'
import { useToast } from './ui'

export function Start() {
  const { index, projects, createProject, openProject, deleteProject, importProject } = useStore()
  const [picked, setPicked] = useState<TemplateIndexEntry | null>(null)
  const [name, setName] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const toast = useToast()

  return (
    <div className="stack">
      <section className="card stack">
        <div>
          <div className="eyebrow">프롬프트 코치</div>
          <h1>프롬프트를 만들고, 고치는 연습</h1>
        </div>
        <p className="muted">
          먼저 <b>결정</b> 탭에서 항목을 하나씩 정하면 빠진 것 없는 <b>첫 프롬프트</b>가 만들어져요. 결과가 어딘가 어색하면 <b>코치</b> 탭에서 어디가, 무엇이, 어떻게 이상한지 고르기만 하면 <b>고치는 프롬프트</b>가 나와요. 내용은 전부 이 기기에만 저장되고, 과제는 JSON 파일로 내보내서 제출해요.
        </p>
      </section>

      {projects.length > 0 && (
        <section className="card">
          <div className="section-title">
            <h2>내 프로젝트</h2>
          </div>
          {projects.map((p) => (
            <div className="project-row" key={p.id}>
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="small muted">
                  {index.find((e) => e.id === p.templateId)?.name ?? p.templateId} · 마지막 수정 {new Date(p.updatedAt).toLocaleDateString()} · 수정 요청 {p.iterations.length}회
                </div>
              </div>
              <button className="secondary" onClick={() => openProject(p.id)}>
                열기
              </button>
              <button
                className="ghost"
                aria-label="삭제"
                onClick={() => {
                  if (confirm(`"${p.name}" 프로젝트를 지울까요? 되돌릴 수 없어요.`)) deleteProject(p.id)
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="card stack">
        <div className="section-title">
          <h2>새 프로젝트</h2>
          <span className="small muted">과제 템플릿을 고르세요</span>
        </div>
        <div className="stack">
          {index.map((e) => (
            <button key={e.id} className={`choice big template-card ${picked?.id === e.id ? 'on' : ''}`} onClick={() => setPicked(e)}>
              <h3>{e.name}</h3>
              <span className="hint">{e.description}</span>
            </button>
          ))}
          {!index.length && <p className="muted">템플릿이 없어요. public/templates/index.json을 확인하세요.</p>}
        </div>
        {picked && (
          <div className="row">
            <input type="text" placeholder={`프로젝트 이름 (비우면 "${picked.name}")`} value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
            <button onClick={() => createProject(picked, name.trim())}>시작하기</button>
          </div>
        )}
      </section>

      <section className="card row" style={{ justifyContent: 'space-between' }}>
        <div>
          <h3>저장한 프로젝트 불러오기</h3>
          <p className="small muted">전에 내보낸 JSON 파일을 열어요. 참고 이미지와 기록까지 그대로 돌아와요.</p>
        </div>
        <button className="secondary" onClick={() => file.current?.click()}>
          JSON 열기
        </button>
        <input
          ref={file}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              await importProject(await f.text())
              toast('프로젝트를 불러왔어요.')
            } catch (err) {
              toast((err as Error).message)
            }
            e.target.value = ''
          }}
        />
      </section>
    </div>
  )
}
