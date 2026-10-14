import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

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
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string; className?: string }>; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={`${o.value === value ? 'on' : ''} ${o.className ?? ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---- language tabs + copy ------------------------------------------------------------
export function PromptBox({ en, ko, filename }: { en: string; ko: string; filename: string }) {
  const [lang, setLang] = useState<'en' | 'ko'>('en')
  const toast = useToast()
  const text = lang === 'en' ? en : ko
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="tabs">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
            ENGLISH · AI에 입력
          </button>
          <button className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')}>
            한국어 · 같은 뜻
          </button>
        </div>
        <div className="row">
          <button onClick={async () => toast((await copyText(text)) ? (lang === 'en' ? '영어 요청문을 복사했어요. 코딩 AI에 붙여넣으세요.' : '한글 뜻을 복사했어요.') : '복사가 막혀 있어요. 텍스트를 직접 선택해 복사하세요.')}>
            복사
          </button>
          <button className="secondary" onClick={() => downloadText(filename, `=== ENGLISH ===\n\n${en}\n\n=== 한국어 ===\n\n${ko}\n`)}>
            TXT 저장
          </button>
        </div>
      </div>
      <div className="card mono" lang={lang}>
        {text || <span className="muted">아직 내용이 없어요.</span>}
      </div>
    </div>
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
