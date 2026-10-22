import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import type { Reference, TemplateIndexEntry } from '../types'
import { createFreeBrief, type FreePromptMode } from '../lib/free-prompt'
import { FREE_MODES } from '../lib/free-modes'
import { createImagePrompt, IMAGE_PROMPT_LIMITS } from '../lib/image-prompt'
import { loadImage } from '../lib/image'
import { uid } from '../lib/db'
import { useToast } from './ui'
import '../image-start.css'

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function ImageStart({ entry, active, disabled, onBusyChange, onCreated }: {
  entry?: TemplateIndexEntry
  active: boolean
  disabled: boolean
  onBusyChange: (busy: boolean) => void
  onCreated: (destination?: 'brief' | 'image') => void
}) {
  const { createProject } = useStore()
  const toast = useToast()
  const [mode, setMode] = useState<FreePromptMode | null>(null)
  const [reference, setReference] = useState<Reference | null>(null)
  const [sourceUrl, setSourceUrl] = useState('')
  const [intent, setIntent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const loadSequence = useRef(0)
  const submitting = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function chooseImage(file: File) {
    if (disabled || submitting.current) return
    const sequence = ++loadSequence.current
    setError('')
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setLoading(false)
      const message = !IMAGE_TYPES.includes(file.type) ? 'PNG, JPG 또는 WebP 이미지 파일을 골라 주세요.' : '20MB 이하의 이미지 파일을 골라 주세요.'
      setError(message)
      toast(message)
      return
    }
    setLoading(true)
    try {
      const dataUrl = await loadImage(file)
      if (!mounted.current || sequence !== loadSequence.current) return
      setReference({ id: uid(), role: 'any', name: file.name, dataUrl })
    } catch (err) {
      if (!mounted.current || sequence !== loadSequence.current) return
      const message = `이미지를 불러오지 못했어요. ${(err as Error).message}`
      setError(message)
      toast(message)
    } finally {
      if (mounted.current && sequence === loadSequence.current) setLoading(false)
    }
  }

  return <form className="stack image-start" hidden={!active} aria-label="이미지로 장면 시작" onSubmit={async e => {
    e.preventDefault()
    if (!active || !entry || !mode || !reference || loading || disabled || submitting.current) return
    const source = sourceUrl.trim()
    if (source) {
      try {
        if (!['https:', 'http:'].includes(new URL(source).protocol)) throw new Error('Invalid protocol')
      } catch {
        setError('이미지 출처는 https:// 또는 http://로 시작하는 링크로 적어 주세요.')
        return
      }
    }
    submitting.current = true
    onBusyChange(true)
    setError('')
    try {
      const idea = '첨부한 참고 이미지에서 출발하는 장면'
      const name = intent.trim().split('\n')[0].slice(0, 48) || reference.name.replace(/\.[^.]+$/, '').slice(0, 48) || '이미지에서 시작한 장면'
      await createProject(entry, name, createFreeBrief(idea, mode), { references: [reference], imagePrompt: { ...createImagePrompt(reference.id, source), changes: intent.trim() } })
      onCreated('image')
    } catch (err) {
      const message = `프로젝트를 만들지 못했어요. ${(err as Error).message}`
      if (mounted.current) setError(message)
      toast(message)
    } finally {
      submitting.current = false
      onBusyChange(false)
    }
  }}>
    <fieldset className="free-mode-fieldset" disabled={disabled} aria-describedby="image-start-mode-help">
      <legend>이 이미지에서 어떤 결과물로 발전시킬까요?</legend>
      <div className="free-mode-grid">{FREE_MODES.map(item => <button type="button" key={item.id} className={`choice big ${mode === item.id ? 'on' : ''}`} aria-pressed={mode === item.id} onClick={() => setMode(item.id)}><span>{item.label}</span><span className="hint">{item.hint}</span></button>)}</div>
      <p className="small muted" id="image-start-mode-help">새 이미지를 만들려면 <strong>2D Image</strong>, 이미지를 참고해 웹 장면을 구현하려면 <strong>3D Web</strong>을 고르세요.</p>
    </fieldset>

    <div className="stack image-start-source">
      <div><h3>참고 이미지</h3><p className="small muted">핀터레스트 등에서 찾은 이미지를 파일로 가져오세요.</p></div>
      <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={disabled} aria-label="참고 이미지 파일" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void chooseImage(file) }} />
      {reference ? <div className="image-start-preview">
        <img src={reference.dataUrl} alt={`참고 이미지: ${reference.name}`} />
        <div className="image-start-preview-info"><strong>{reference.name}</strong><span className="small muted">이 이미지의 특징을 먼저 글로 정리해요.</span><div className="image-start-file-actions"><button type="button" className="secondary" disabled={disabled} onClick={() => fileInput.current?.click()}>이미지 바꾸기</button><button type="button" className="ghost" disabled={disabled} onClick={() => { loadSequence.current++; setReference(null); setLoading(false); setError('') }}>제거</button></div></div>
      </div> : <button type="button" className="image-start-upload" disabled={disabled} onClick={() => fileInput.current?.click()} aria-describedby="image-file-help"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 4 4 3-3 5 5" /></svg><strong>이미지 파일 선택</strong><span id="image-file-help">PNG · JPG · WebP, 최대 20MB</span></button>}
      {loading && <p className="small muted" role="status">이미지를 불러오는 중…</p>}
      <label className="stack image-start-url"><span>이미지 출처 <span className="small muted">(선택)</span></span><input type="url" inputMode="url" value={sourceUrl} maxLength={IMAGE_PROMPT_LIMITS.sourceUrl} disabled={disabled} onChange={e => setSourceUrl(e.target.value)} placeholder="https://www.pinterest.com/pin/…" aria-describedby="image-source-help" /><span className="small muted" id="image-source-help">링크는 출처 기록용이에요. 이미지 파일도 함께 선택해 주세요.</span></label>
    </div>

    <label className="stack image-start-intent"><span>어떤 장면으로 바꾸고 싶나요? <span className="small muted">(선택)</span></span><textarea rows={3} value={intent} maxLength={10000} disabled={disabled} onChange={e => setIntent(e.target.value)} placeholder="예: 이 이미지의 구도를 살려, 밤에 빛나는 작은 도서관으로 만들고 싶어요." /></label>
    {error && <p className="image-start-error" role="alert">{error}</p>}
    <div className="image-start-next"><div><strong>다음: 이미지 특징을 프롬프트로</strong><p>내 ChatGPT·Claude에 같은 이미지를 첨부해 설명을 받아와요.<br />여기에서 유지할 특징과 바꿀 부분을 이어서 정할 수 있어요.</p></div><button type="submit" disabled={!entry || !mode || !reference || loading || disabled}>{disabled ? '만드는 중…' : !mode ? '결과물을 먼저 골라 주세요' : !reference ? '이미지를 먼저 골라 주세요' : '이미지로 시작하기'} <span aria-hidden="true">→</span></button></div>
  </form>
}
