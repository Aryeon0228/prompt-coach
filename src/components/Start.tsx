import { useRef, useState } from 'react'
import { useStore } from '../store'
import type { TemplateIndexEntry } from '../types'
import { createFreeBrief, type FreePromptMode } from '../lib/free-prompt'
import { FREE_MODES } from '../lib/free-modes'
import { useToast } from './ui'

export function Start({ onCreated }: { onCreated: () => void }) {
  const { index, projects, createProject, openProject, importProject } = useStore()
  const [picked, setPicked] = useState<TemplateIndexEntry | null>(null)
  const [name, setName] = useState('')
  const [idea, setIdea] = useState('')
  const [mode, setMode] = useState<FreePromptMode>('image')
  const [creating, setCreating] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const freeEntry = index.find(e => e.id === 'free-scene')

  return (
    <div className="stack start-stack">
      <section className="start-intro">
        <div><div className="eyebrow">MAKE · OBSERVE · REFINE</div><h1>만들고 싶은 장면을 프롬프트로</h1></div>
        <p className="muted">이미지부터 영상, 3D 웹까지. 아이디어를 적고, 필요한 조건을 배우며 요청문을 만들어 보세요.</p>
        <ol className="start-steps" aria-label="사용 흐름">
          <li><span>01</span><div><strong>아이디어 적기</strong><p>만들고 싶은 장면을 자유롭게 적어요.</p></div></li>
          <li><span>02</span><div><strong>조건 구체화하기</strong><p>예시를 보며 중요한 조건을 더해요.</p></div></li>
          <li><span>03</span><div><strong>요청문 확인하기</strong><p>AI 도구에 전달하고 결과를 다듬어요.</p></div></li>
        </ol>
      </section>

      <section className="card stack free-start">
        <div className="section-title"><h2>어떤 장면을 만들고 싶나요?</h2><span className="small muted">한 문장으로 시작해도 좋아요</span></div>
        <form className="stack" onSubmit={async e => {
          e.preventDefault()
          if (!freeEntry || !idea.trim() || creating) return
          setCreating(true)
          try { await createProject(freeEntry, idea.trim().split('\n')[0].slice(0, 48), createFreeBrief(idea, mode)); onCreated() }
          catch (err) { toast((err as Error).message) }
          finally { setCreating(false) }
        }}>
          <fieldset className="free-mode-fieldset"><legend>만들 결과물</legend><div className="free-mode-grid">{FREE_MODES.map(item => <button type="button" key={item.id} className={`choice big ${mode === item.id ? 'on' : ''}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><span>{item.label}</span><span className="hint">{item.hint}</span></button>)}</div></fieldset>
          <label className="stack free-start-input"><span>장면 아이디어</span><textarea required rows={4} value={idea} onChange={e => setIdea(e.target.value)} placeholder="예: 비 오는 밤, 작은 우산 아래에서 버스를 기다리는 고양이" aria-describedby="free-start-hint" /></label>
          <div className="free-start-action"><p className="small muted" id="free-start-hint">입력한 내용을 바탕으로 목적·구도·표현을 차근차근 정해요.<br />아직 정하지 않은 조건은 비워 두어도 괜찮아요.</p><button disabled={!freeEntry || !idea.trim() || creating}>{creating ? '만드는 중…' : '내 장면으로 시작하기'} <span aria-hidden="true">→</span></button></div>
          {!freeEntry && <p className="small muted" role="status">시작 화면을 불러오지 못했어요. 잠시 후 새로고침해 주세요.</p>}
        </form>
      </section>

      <details className="card example-templates">
        <summary>예시 장면으로 시작하기 <span className="small muted">3D 웹 템플릿</span></summary>
        <div className="stack">
          <p className="small muted">정해진 선택지를 따라가며 시작하고 싶다면 아래 장면을 골라 보세요.</p>
          <div className="template-grid">{index.filter(e => e.id !== 'free-scene').map((e, i) => <button key={e.id} className={`choice big template-card ${picked?.id === e.id ? 'on' : ''}`} onClick={() => setPicked(e)} aria-pressed={picked?.id === e.id}><span className="template-number" aria-hidden="true">0{i + 1}<span>{picked?.id === e.id ? '✓' : '↗'}</span></span><span className="template-title">{e.name}</span><span className="hint">{e.description}</span></button>)}</div>
          {picked && <form className="project-create" onSubmit={async e => { e.preventDefault(); if (creating) return; setCreating(true); try { await createProject(picked, name.trim()); onCreated() } catch (err) { toast((err as Error).message) } finally { setCreating(false) } }}><label className="stack"><span className="small">프로젝트 이름 <span className="muted">(선택)</span></span><input type="text" placeholder={picked.name} value={name} onChange={e => setName(e.target.value)} /></label><button type="submit" disabled={creating}>{creating ? '만드는 중…' : '이 장면으로 시작하기'} <span aria-hidden="true">→</span></button></form>}
        </div>
      </details>

      {projects.length > 0 && <section className="card"><div className="section-title"><h2>내 프로젝트</h2></div>{projects.map(p => <div className="project-row" key={p.id}><div className="grow"><div className="name">{p.name}</div><div className="small muted">{p.freeform ? `자유 장면 · ${FREE_MODES.find(m => m.id === p.freeform?.mode)?.label ?? ''}` : index.find(e => e.id === p.templateId)?.name ?? p.templateId} · 마지막 수정 {new Date(p.updatedAt).toLocaleDateString()} · 수정 요청 {p.iterations.length}회</div></div><button className="secondary" onClick={() => openProject(p.id)}>열기</button></div>)}</section>}

      <section className="import-project row">
        <div><h3>저장한 프로젝트 불러오기</h3><p className="small muted">전에 내보낸 JSON 파일을 열어요. 참고 이미지와 기록까지 그대로 돌아와요.</p></div>
        <button className="secondary" onClick={() => file.current?.click()}>JSON 열기</button>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { await importProject(await f.text()); onCreated(); toast('프로젝트를 불러왔어요.') } catch (err) { toast((err as Error).message) } e.target.value = '' }} />
      </section>
      <p className="local-storage-note">내용은 이 브라우저에 저장돼요. 보관 · 설정에서 JSON 파일로 내보내면 다른 기기에서도 이어갈 수 있어요.</p>
    </div>
  )
}
