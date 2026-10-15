import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { TemplateIndexEntry } from '../types'
import { createFreeBrief, type FreePromptMode } from '../lib/free-prompt'
import { FREE_MODES } from '../lib/free-modes'
import { useToast } from './ui'
import { CoachConnection } from './CoachConnection'

export function Start({ onCreated, onOpening }: { onCreated: () => void; onOpening?: () => void }) {
  const { index, projects, createProject, openProject, deleteProject, importProject } = useStore()
  const [picked, setPicked] = useState<TemplateIndexEntry | null>(null)
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [mode, setMode] = useState<FreePromptMode | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const deletePending = useRef(false)
  const file = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const freeEntry = index.find(e => e.id === 'free-scene')

  return (
    <div className="stack start-stack">
      <section className="start-intro">
        <div><div className="eyebrow">MAKE · OBSERVE · REFINE</div><h1>만들고 싶은 장면을 프롬프트로</h1></div>
        <p className="muted">장면을 적고 필요한 조건을 하나씩 정해 보세요. 사이트의 기본 질문이나 내 AI와의 대화를 선택해 프롬프트를 완성할 수 있어요.</p>
        <ol className="start-steps" aria-label="사용 흐름">
          <li><span>01</span><div><strong>장면 입력</strong><p>만들 결과물과 떠오르는 아이디어를 적어요.</p></div></li>
          <li><span>02</span><div><strong>구체화 방법 선택</strong><p>사이트 기본 질문 또는 내 AI와 대화해요.</p></div></li>
          <li><span>03</span><div><strong>프롬프트로 제작 시작</strong><p>완성한 프롬프트를 복사해 제작 도구에서 사용해요.</p></div></li>
        </ol>
      </section>

      <section className="card stack free-start">
        <div className="section-title"><h2>어떤 장면을 만들고 싶나요?</h2><span className="small muted">한 문장으로 시작해도 좋아요</span></div>
        <p className="small muted">별도 설치 없이 사이트의 기본 질문으로 시작할 수 있어요.</p>
        <form id="free-scene-form" className="stack" onSubmit={async e => {
          e.preventDefault()
          if (!freeEntry || !mode || !idea.trim() || creating) return
          setCreating(true)
          try { await createProject(freeEntry, idea.trim().split('\n')[0].slice(0, 48), createFreeBrief(idea, mode)); onCreated() }
          catch (err) { toast((err as Error).message) }
          finally { setCreating(false) }
        }}>
          <fieldset className="free-mode-fieldset" aria-describedby="free-mode-guide"><legend>완성할 결과물을 골라 주세요</legend><div className="free-mode-grid">{FREE_MODES.map(item => <button type="button" key={item.id} className={`choice big ${mode === item.id ? 'on' : ''}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><span>{item.label}</span><span className="hint">{item.hint}</span></button>)}</div><p className="small muted" id="free-mode-guide">3D 웹이 목표라면 <strong>3D Web</strong>부터 시작하세요. 이미지는 참고 자료로 준비해 추가할 수 있어요.</p></fieldset>
          <label className="stack free-start-input"><span>장면 아이디어</span><textarea required rows={4} value={idea} onChange={e => setIdea(e.target.value)} placeholder="예: 비 오는 밤, 작은 우산 아래에서 버스를 기다리는 고양이" aria-describedby="free-start-hint" /></label>
        </form>

        <details className="example-templates">
          <summary><span>예시 장면으로 시작하기</span><span className="small muted">생각나는 장면이 없다면 눌러보세요.</span></summary>
          <div className="stack">
            <p className="small muted">3D 웹 예시예요. 장면을 고르면 정해진 선택지를 따라 새 프로젝트를 시작할 수 있어요.</p>
            <div className="template-grid">{index.filter(e => e.id !== 'free-scene').map(e => <button type="button" key={e.id} className={`choice template-card ${picked?.id === e.id ? 'on' : ''}`} onClick={() => setPicked(e)} aria-pressed={picked?.id === e.id}><span className="template-title">{e.name}</span><span className="hint">{e.description}</span></button>)}</div>
            {picked && <form className="project-create" onSubmit={async e => { e.preventDefault(); if (creating) return; setCreating(true); try { await createProject(picked, name.trim()); onCreated() } catch (err) { toast((err as Error).message) } finally { setCreating(false) } }}><label className="stack"><span className="small">프로젝트 이름 <span className="muted">(선택)</span></span><input type="text" placeholder={picked.name} value={name} onChange={e => setName(e.target.value)} /></label><button type="submit" disabled={creating}>{creating ? '만드는 중…' : '이 예시로 시작하기'} <span aria-hidden="true">→</span></button></form>}
          </div>
        </details>

        <div className="free-start-action"><p className="small muted" id="free-start-hint">입력한 내용을 바탕으로 목적·구도·표현을 차근차근 정해요.<br />아직 정하지 않은 조건은 비워 두어도 괜찮아요.</p><button type="submit" form="free-scene-form" disabled={!freeEntry || !mode || !idea.trim() || creating}>{creating ? '만드는 중…' : !mode ? '결과물을 먼저 골라 주세요' : '내 장면으로 시작하기'} <span aria-hidden="true">→</span></button></div>
        {!freeEntry && <p className="small muted" role="status">시작 화면을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>}
      </section>

      <section className="card saved-projects"><div className="section-title"><h2>내 프로젝트</h2><span className="small muted">저장한 장면 이어서 작업하기</span></div>{projects.map(p => <div className="project-row" key={p.id}><div className="grow"><div className="name">{p.name}</div><div className="small muted">{p.freeform ? `자유 장면 · ${FREE_MODES.find(m => m.id === p.freeform?.mode)?.label ?? ''}` : index.find(e => e.id === p.templateId)?.name ?? p.templateId} · 마지막 수정 {new Date(p.updatedAt).toLocaleDateString()} · 수정 요청 {p.iterations.length}회</div></div><div className="project-row-actions"><button type="button" className="secondary" disabled={deleting !== null} onClick={() => { onOpening?.(); openProject(p.id) }}>열기</button><button type="button" className="project-delete" title="프로젝트 삭제" aria-label={`${p.name} 프로젝트 삭제`} disabled={deleting !== null} onClick={async () => {
        if (deletePending.current || !window.confirm(`“${p.name}” 프로젝트를 이 브라우저에서 삭제할까요?\n내보낸 JSON 파일이 없으면 되살릴 수 없어요.`)) return
        deletePending.current = true
        setDeleting(p.id)
        try { await deleteProject(p.id); toast('프로젝트를 삭제했어요.') }
        catch (err) { toast(`프로젝트를 삭제하지 못했어요. ${(err as Error).message}`) }
        finally { deletePending.current = false; setDeleting(null) }
      }}><span aria-hidden="true">×</span></button></div></div>)}
        {projects.length === 0 && <p className="small muted projects-empty">아직 저장한 프로젝트가 없어요.</p>}

        <div className="import-project row">
          <div><h3>저장한 프로젝트 불러오기</h3><p className="small muted" id="project-import-help">내보낸 JSON 파일로 참고 이미지와 기록까지 불러와요.</p></div>
          <button type="button" className="ghost" aria-describedby="project-import-help" disabled={deleting !== null} onClick={() => file.current?.click()}>JSON 열기</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await importProject(await f.text()); onCreated(); toast('프로젝트를 불러왔어요.') } catch (err) { toast((err as Error).message) } e.target.value = '' }} />
        </div>
        <p className="local-storage-note">내용은 이 브라우저에 저장돼요. 보관 · 설정에서 JSON 파일로 내보내면 다른 기기에서도 이어갈 수 있어요.</p>
      </section>

      <CoachConnection collapsed setupOnly />
    </div>
  )
}
