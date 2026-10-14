import { useEffect, useState } from 'react'
import { Brief } from './components/Brief'
import { Coach } from './components/Coach'
import { History } from './components/History'
import { PromptView } from './components/PromptView'
import { References } from './components/References'
import { Settings } from './components/Settings'
import { Start } from './components/Start'
import { ToastProvider } from './components/ui'
import { undecided } from './lib/assemble'
import { useStore } from './store'

type Tab = 'brief' | 'refs' | 'prompt' | 'coach' | 'history' | 'settings'

const TABS: Array<{ id: Tab; label: string; ico: string }> = [
  { id: 'brief', label: '결정', ico: '☑' },
  { id: 'refs', label: '참고', ico: '🖼' },
  { id: 'prompt', label: '첫 프롬프트', ico: '✎' },
  { id: 'coach', label: '코치', ico: '◎' },
  { id: 'history', label: '기록', ico: '≡' },
  { id: 'settings', label: '설정', ico: '⚙' },
]

export function App() {
  const { ready, error, project, template, openProject } = useStore()
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('prompt-coach:tab') as Tab) || 'brief')
  useEffect(() => {
    localStorage.setItem('prompt-coach:tab', tab)
  }, [tab])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab, project?.id])

  const missing = project && template ? undecided(template, project).length : 0

  return (
    <ToastProvider>
      <div className="app">
        <header className="topbar">
          {project ? (
            <button className="ghost" onClick={() => openProject(null)} aria-label="프로젝트 목록으로">
              ‹ 목록
            </button>
          ) : null}
          <div className="grow">
            <div className="title">{project ? project.name : '프롬프트 코치'}</div>
            {project && template ? <div className="small muted">{template.name}</div> : <div className="small muted">원하는 장면을 구체화하고, 결과를 보며 프롬프트를 다듬는 도구</div>}
          </div>
          <a className="portfolio-link" href="https://studio-penumbra.com/#lab" aria-label="Studio Penumbra Lab으로 돌아가기">← Lab</a>
        </header>

        {project && template ? (
          <>
            <nav className="nav" aria-label="구역">
              {TABS.map((t) => (
                <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
                  <span className="ico" aria-hidden="true">
                    {t.ico}
                  </span>
                  {t.label}
                  {t.id === 'brief' && missing > 0 ? <span className="badge">{missing}</span> : null}
                </button>
              ))}
            </nav>
            <main className="content">
              {error ? <div className="note warn">{error}</div> : null}
              {tab === 'brief' && <Brief />}
              {tab === 'refs' && <References />}
              {tab === 'prompt' && <PromptView onGoBrief={() => setTab('brief')} />}
              {tab === 'coach' && <Coach onSaved={() => setTab('history')} />}
              {tab === 'history' && <History />}
              {tab === 'settings' && <Settings />}
            </main>
          </>
        ) : (
          <main className="content" style={{ gridColumn: '1 / -1' }}>
            {!ready ? <p className="muted">불러오는 중…</p> : <Start />}
            {error ? <div className="note warn" style={{ marginTop: 12 }}>{error}</div> : null}
          </main>
        )}
      </div>
    </ToastProvider>
  )
}
