import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'

// ---- toast -------------------------------------------------------------------------------
const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export const useToast = () => useContext(ToastCtx)

/** Copy text; falls back to a selectable textarea when the clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.append(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- segmented control ---------------------------------------------------------------
export function Segmented<T extends string>({ value, options, onChange, label }: { label?: string; value: T; options: Array<{ value: T; label: string; className?: string }>; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
      e.preventDefault()
      const index = options.findIndex(o => o.value === value)
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : (index + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      onChange(options[next].value)
      e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
    }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" tabIndex={o.value === value ? 0 : -1} aria-checked={o.value === value} className={`${o.value === value ? 'on' : ''} ${o.className ?? ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- language tabs + copy ------------------------------------------------------------
export function PromptBox({ en, ko, filename, initialLang = 'en' }: { en: string; ko: string; filename: string; initialLang?: 'en' | 'ko' }) {
  const [lang, setLang] = useState<'en' | 'ko'>(initialLang)
  const toast = useToast()
  const text = lang === 'en' ? en : ko
  const titleId = useId()
  const helpId = useId()
  const languageNote = useId()
  return (
    <section className="card prompt-document" aria-labelledby={titleId}>
      <div className="prompt-document-heading">
        <div className="prompt-document-copy">
          <h2 id={titleId}>프롬프트 본문</h2>
          <p className="prompt-output-help" id={helpId}>복사한 뒤 사용할 AI에 붙여 넣으세요.</p>
        </div>
        <button type="button" className="prompt-copy-button" aria-describedby={`${helpId} ${languageNote}`} disabled={!text.trim()} onClick={async () => toast((await copyText(text)) ? '프롬프트를 복사했어요. 사용할 AI에 붙여 넣으세요.' : '복사할 수 없어요. 글을 직접 선택해서 복사해 주세요.')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
          프롬프트 복사
        </button>
      </div>
      <div className="prompt-document-options">
        <div className="tabs" role="group" aria-label="프롬프트 언어">
          <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
            영어 형식
          </button>
          <button type="button" className={lang === 'ko' ? 'on' : ''} aria-pressed={lang === 'ko'} onClick={() => setLang('ko')}>
            한국어
          </button>
        </div>
        <button type="button" className="ghost prompt-save-button" disabled={!en.trim() && !ko.trim()} onClick={() => downloadText(filename, `=== 영어 형식 · 직접 입력한 내용은 원문 유지 ===\n\n${en}\n\n=== 한국어 ===\n\n${ko}\n`)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg>
          두 언어 TXT 저장
        </button>
      </div>
      <p className="prompt-language-note" id={languageNote}>{lang === 'en' ? '정해진 요청문만 영어로 표시해요. 직접 입력한 대상·메모·유지 조건은 번역하지 않고 원문 그대로 담아요.' : '한국어 요청문이에요. 직접 입력한 내용은 원문 그대로 담아요.'}</p>
      <div className="mono prompt-document-body" role="region" aria-label={`${lang === 'en' ? '영어 형식' : '한국어'} 프롬프트 본문`} tabIndex={0} lang={lang}>
        {text || <span className="muted">아직 내용이 없어요.</span>}
      </div>
    </section>
  )
}

/** Runs `fn` once when a condition first becomes true (small helper for onboarding hints). */
export function useOnce(cond: boolean, fn: () => void) {
  const done = useRef(false)
  useEffect(() => {
    if (cond && !done.current) {
      done.current = true
      fn()
    }
  }, [cond, fn])
}
