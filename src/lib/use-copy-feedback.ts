import { useEffect, useRef, useState } from 'react'

type Feedback = { text: string; error?: boolean; copied?: boolean; context: string }

/** Feedback follows the displayed text; late clipboard results cannot label a different version. */
export function useCopyFeedback(text: string, scope: string, write: (text: string) => Promise<boolean>) {
  const context = `${scope}\0${text}`
  const [result, setResult] = useState<Feedback | null>(null)
  const [pending, setPending] = useState<{ context: string; run: number } | null>(null)
  const request = useRef(0)
  useEffect(() => {
    const token = request
    return () => { token.current++; setPending(current => current?.context === context ? null : current) }
  }, [context])
  const copying = pending?.context === context
  const copy = async () => {
    if (copying) return
    const run = ++request.current
    setPending({ context, run })
    let ok = false
    try { ok = await write(text) } catch { /* Keep the text selectable if copying is blocked. */ }
    if (run !== request.current) return
    setPending(null)
    setResult(ok
      ? { context, text: '복사 완료 · 사용할 AI에 붙여 넣으세요.', copied: true }
      : { context, text: '복사하지 못했어요. 본문을 직접 선택해서 복사해 주세요.', error: true })
  }
  return {
    feedback: result?.context === context ? result : null,
    copying,
    copy,
    downloadStarted: () => setResult({ context, text: 'TXT 다운로드를 시작했어요.' }),
  }
}
