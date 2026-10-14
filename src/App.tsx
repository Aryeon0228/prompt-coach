import { useEffect, useRef, useState } from 'react'
import { FreeBrief } from './components/FreeBrief'
import { FreePromptView } from './components/FreePromptView'
import './free-prompt.css'
import { Brief } from './components/Brief'
import { Coach } from './components/Coach'
import { History } from './components/History'
import { PromptView } from './components/PromptView'
import { References } from './components/References'
import { Settings } from './components/Settings'
import { Start } from './components/Start'
import { ToastProvider } from './components/ui'
import { useStore } from './store'

type Tab = 'brief' | 'refs' | 'prompt' | 'coach' | 'history' | 'settings'
const TABS: Array<{ id: Tab; label: string; description: string; group: string }> = [
  { id: 'brief', label: '장면 설정', description: '원하는 장면의 조건을 하나씩 정해 보세요.', group: '첫 프롬프트 만들기' },
  { id: 'refs', label: '참고 이미지', description: '무엇을 참고할 이미지인지 역할을 정해 주세요. 선택 사항이에요.', group: '첫 프롬프트 만들기' },
  { id: 'prompt', label: '첫 프롬프트', description: '정리된 요청문을 복사해 사용하는 AI 도구에 붙여 넣으세요.', group: '첫 프롬프트 만들기' },
  { id: 'coach', label: '수정 코치', description: '결과에서 아쉬운 부분을 짚고, 한 가지씩 수정 요청을 만드세요.', group: '결과 다듬기' },
  { id: 'history', label: '수정 기록', description: '어떤 요청이 효과가 있었는지 결과를 비교해 보세요.', group: '결과 다듬기' },
  { id: 'settings', label: '보관 · 설정', description: '프로젝트 이름을 바꾸거나 작업을 파일로 보관하세요.', group: '프로젝트' },
]
const GROUPS = [...new Set(TABS.map(t => t.group))]

export function App() {
  const { ready, error, project, template, openProject } = useStore()
  const [tab, setTab] = useState<Tab>(() => {
    const stored = localStorage.getItem('prompt-coach:tab')
    return TABS.find(t => t.id === stored)?.id ?? 'brief'
  })
  const heading = useRef<HTMLHeadingElement>(null)
  const isFree = project?.templateId === 'free-scene'
  const current = TABS.find(t => t.id === tab)!
  useEffect(() => { localStorage.setItem('prompt-coach:tab', tab) }, [tab])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [tab, project?.id])
  const navigate = (next: Tab) => {
    setTab(next)
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
  }

  return (
    <ToastProvider>
      <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
      <header className="site-header">
        <div className="site-header-inner">
          <a className="wordmark" href="https://studio-penumbra.com/" aria-label="Studio Penumbra 처음으로">
            <svg viewBox="0 0 36 28" aria-hidden="true"><ellipse cx="18" cy="14" rx="17" ry="4" fill="none" stroke="currentColor" opacity=".5"/><circle cx="18" cy="14" r="10.5" fill="var(--paper)" stroke="currentColor" opacity=".8"/><path d="M18 3.5A10.5 10.5 0 0 0 18 24.5M1 14A17 4 0 0 0 35 14" fill="none" stroke="currentColor"/></svg>
            <span><small>STUDIO</small>PENUMBRA</span>
          </a>
          <a className="portfolio-link" href="https://studio-penumbra.com/#lab">모든 Lab <span aria-hidden="true">↗</span></a>
        </div>
      </header>
      <div className="lab-shell">
        <div className="lab-heading">
          <div>
            <div className="eyebrow"><a href="https://studio-penumbra.com/#lab">LAB</a><span>/</span>프롬프트 만들기와 다듬기</div>
            <div className="lab-title-line"><span className="lab-name">Prompt <b>Lab</b></span><span className="lab-subtitle">프롬프트 코치</span></div>
          </div>
          {project && <button className="secondary project-list-button" onClick={() => openProject(null)}>← 프로젝트 목록</button>}
        </div>
        {project && template ? (
          <div className="workspace">
            <aside className="workspace-sidebar">
              <div className="project-context"><span className="eyebrow">PROJECT</span><strong>{project.name}</strong><span className="small muted">{template.name}</span></div>
              <nav className="nav" aria-label="프로젝트 작업">
                {GROUPS.map(group => <div className="nav-group" key={group}><p className="nav-group-label">{group}</p>{TABS.filter(t => t.group === group).map(t => (
                  <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => navigate(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                    <span className="nav-index" aria-hidden="true">{String(TABS.indexOf(t) + 1).padStart(2, '0')}</span>{t.label}<span className="nav-arrow" aria-hidden="true">↗</span>
                  </button>
                ))}</div>)}
              </nav>
              <label className="mobile-navigation"><span className="small muted">작업 단계</span><select value={tab} onChange={e => navigate(e.target.value as Tab)}>{GROUPS.map(group => <optgroup label={group} key={group}>{TABS.filter(t => t.group === group).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>)}</select></label>
              <p className="local-note">작업 내용은 이 브라우저에 보관돼요.</p>
            </aside>
            <main className="content" id="main-content" tabIndex={-1}>
              <header className="page-heading"><span className="page-number" aria-hidden="true">{String(TABS.indexOf(current) + 1).padStart(2, '0')}</span><div><h1 ref={heading} tabIndex={-1}>{current.label}</h1><p>{current.description}</p></div></header>
              {error ? <div className="note warn" role="alert">{error}</div> : null}
              <div hidden={tab !== 'brief'} key={`brief-${project.id}`}>{isFree ? <FreeBrief onPreview={() => navigate('prompt')} /> : <Brief />}</div>
              {tab === 'refs' && <References />}
              {tab === 'prompt' && (isFree ? <FreePromptView key={project.id} onEdit={() => navigate('brief')} /> : <PromptView onGoBrief={() => navigate('brief')} />)}
              <div hidden={tab !== 'coach'} key={`coach-${project.id}`}><Coach onSaved={() => navigate('history')} /></div>
              {tab === 'history' && <History />}
              {tab === 'settings' && <Settings />}
              {(tab === 'brief' || tab === 'refs' || tab === 'prompt') && <nav className="page-pager" aria-label="이전 다음 작업">
                {tab !== 'brief' ? <button className="ghost" onClick={() => navigate(tab === 'refs' ? 'brief' : 'refs')}>← {tab === 'refs' ? '장면 설정' : '참고 이미지'}</button> : <span />}
                <button className="secondary" onClick={() => navigate(tab === 'brief' ? 'refs' : tab === 'refs' ? 'prompt' : 'coach')}>{tab === 'brief' ? '다음: 참고 이미지' : tab === 'refs' ? '첫 프롬프트 보기' : '결과를 수정 코치로 다듬기'} <span aria-hidden="true">→</span></button>
              </nav>}
            </main>
          </div>
        ) : (
          <main className="start-content" id="main-content" tabIndex={-1}>
            {!ready ? <p className="muted" role="status">불러오는 중…</p> : <Start onCreated={() => setTab('brief')} />}
            {error ? <div className="note warn" role="alert">{error}</div> : null}
          </main>
        )}
        <footer className="lab-footer"><span>© 2026 Studio Penumbra</span><a href="https://studio-penumbra.com/#lab">Back to Lab ↗</a></footer>
      </div>
    </ToastProvider>
  )
}
