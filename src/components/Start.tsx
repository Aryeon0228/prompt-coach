import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { TemplateIndexEntry } from '../types'
import { useToast } from './ui'

export function Start({ onCreated }: { onCreated: () => void }) {
  const { index, projects, createProject, openProject, importProject } = useStore()
  const [picked, setPicked] = useState<TemplateIndexEntry | null>(null)
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const toast = useToast()

  return (
    <div className="stack start-stack">
      <section className="start-intro">
        <div>
          <div className="eyebrow">MAKE · OBSERVE · REFINE</div>
          <h1>만들고 싶은 장면을 프롬프트로</h1>
        </div>
        <p className="muted">원하는 장면을 구체화하고, 결과를 보며 다음 요청을 다듬어 보세요.</p>
        <ol className="start-steps" aria-label="사용 흐름">
          <li><span>01</span><div><strong>장면 정하기</strong><p>템플릿을 고르고 조건을 정해요.</p></div></li>
          <li><span>02</span><div><strong>프롬프트 만들기</strong><p>요청문을 복사해 코딩 AI에 전달해요.</p></div></li>
          <li><span>03</span><div><strong>결과 다듬기</strong><p>아쉬운 부분을 수정 요청으로 바꿔요.</p></div></li>
        </ol>
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

            </div>
          ))}
        </section>
      )}

      <section className="card stack new-project">
        <div className="section-title">
          <h2>새 프로젝트</h2>
          <span className="small muted">만들고 싶은 장면을 고르세요</span>
        </div>
        <div className="template-grid">
          {index.map((e, i) => (
            <button key={e.id} className={`choice big template-card ${picked?.id === e.id ? 'on' : ''}`} onClick={() => setPicked(e)} aria-pressed={picked?.id === e.id}>
              <span className="template-number" aria-hidden="true">0{i + 1}<span>{picked?.id === e.id ? '✓' : '↗'}</span></span>
              <span className="template-title">{e.name}</span>
              <span className="hint">{e.description}</span>
            </button>
          ))}
          {!index.length && <p className="muted">템플릿을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>}
        </div>
        {picked && (
          <form className="project-create" onSubmit={async e => { e.preventDefault(); if (creating) return; setCreating(true); try { await createProject(picked, name.trim()); onCreated() } catch (err) { toast((err as Error).message) } finally { setCreating(false) } }}>
            <label className="stack"><span className="small">프로젝트 이름 <span className="muted">(선택)</span></span><input type="text" placeholder={picked.name} value={name} onChange={e => setName(e.target.value)} /></label>
            <button type="submit" disabled={creating}>{creating ? '만드는 중…' : '이 장면으로 시작하기'} <span aria-hidden="true">→</span></button>
          </form>
        )}
      </section>

      <section className="import-project row">
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
              onCreated()
              toast('프로젝트를 불러왔어요.')
            } catch (err) {
              toast((err as Error).message)
            }
            e.target.value = ''
          }}
        />
      </section>
      <p className="local-storage-note">내용은 이 브라우저에 저장돼요. 보관 · 설정에서 JSON 파일로 내보내면 다른 기기에서도 이어갈 수 있어요.</p>
    </div>
  )
}
