import { useRef, useState } from 'react'
import { coachingContext } from '../lib/coaching-context'
import { buildImageAnalysisRequest, IMAGE_PROMPT_LIMITS, type ImagePromptDraft } from '../lib/image-prompt'
import { loadImage } from '../lib/image'
import { FREE_MODES } from '../lib/free-modes'
import { useStore } from '../store'
import { copyText, useToast } from './ui'
import '../image-prompt.css'

export function ImagePrompt({ onPreview, onRefine, onReferences }: { onPreview: () => void; onRefine: () => void; onReferences: () => void }) {
  const { project, template, updateProject } = useStore()
  const [step, setStep] = useState<'read' | 'change'>(() => project?.imagePrompt?.description.trim() ? 'change' : 'read')
  const [restoring, setRestoring] = useState(false)
  const pending = useRef(false)
  const composing = useRef(false)
  const sectionHeading = useRef<HTMLHeadingElement>(null)
  const toast = useToast()
  if (!project?.imagePrompt) return null
  const projectId = project.id
  const draft = project.imagePrompt
  const reference = project.references.find(item => item.id === draft.referenceId)
  const { brief } = coachingContext(project)
  const mode = FREE_MODES.find(item => item.id === brief.mode)!
  const intent = [brief.idea, draft.changes.trim() ? `원하는 변경:\n${draft.changes}` : ''].filter(Boolean).join('\n\n')
  const request = buildImageAnalysisRequest(brief.mode, intent)
  const ready = Boolean(reference && draft.description.trim())
  const currentStep = step === 'change' && ready ? 'change' : 'read'
  const update = (field: 'description' | 'preserve' | 'changes', value: string) => {
    updateProject(current => current.id !== projectId || current.imagePrompt?.referenceId !== draft.referenceId ? current : {
      ...current, imagePrompt: { ...current.imagePrompt, [field]: value.slice(0, IMAGE_PROMPT_LIMITS[field]) },
    })
  }
  const go = (next: 'read' | 'change') => {
    if (composing.current || (next === 'change' && !ready)) return
    setStep(next)
    requestAnimationFrame(() => sectionHeading.current?.focus())
  }
  const restore = async (file: File | undefined) => {
    if (!file || pending.current) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      toast('20MB 이하의 PNG·JPG·WebP 이미지를 골라 주세요.'); return
    }
    pending.current = true
    setRestoring(true)
    try {
      const dataUrl = await loadImage(file)
      updateProject(current => current.id !== projectId || current.imagePrompt?.referenceId !== draft.referenceId || current.references.some(item => item.id === draft.referenceId) ? current : {
        ...current, references: [...current.references, { id: draft.referenceId, name: file.name, dataUrl, role: template?.referenceRoles[0]?.id ?? 'any' }],
      })
    } catch (error) { toast((error as Error).message) }
    finally { pending.current = false; setRestoring(false) }
  }
  const textField = (field: 'preserve' | 'changes', title: string, hint: string, placeholder: string) => <label className="image-change-field" htmlFor={`image-${field}`}>
    <span className="image-field-title">{title}</span>
    <span className="small muted" id={`image-${field}-hint`}>{hint}</span>
    <textarea id={`image-${field}`} rows={5} value={draft[field]} maxLength={IMAGE_PROMPT_LIMITS[field]} onChange={event => update(field, event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} aria-describedby={`image-${field}-hint`} placeholder={placeholder} />
  </label>

  return <div className="stack image-prompt-page">
    <nav className="image-workflow-steps" aria-label="이미지에서 시작하는 순서">
      <button type="button" aria-current={currentStep === 'read' ? 'step' : undefined} onClick={() => go('read')}><span>01</span>이미지 읽기</button>
      <button type="button" disabled={!ready} aria-current={currentStep === 'change' ? 'step' : undefined} onClick={() => go('change')}><span>02</span>내 장면으로 바꾸기</button>
    </nav>
    {!reference ? <section className="card stack" role="status"><h2>시작 이미지를 다시 첨부해 주세요</h2><p className="small muted">참고 이미지가 삭제되었어요. 원본 설명과 변경 내용은 보관되어 있어요. 같은 이미지를 다시 연결하면 이어갈 수 있습니다.</p><label className="upload"><input type="file" accept="image/png,image/jpeg,image/webp" disabled={restoring} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void restore(file) }} /><span>{restoring ? '불러오는 중…' : '같은 이미지 다시 첨부'}</span></label><button className="ghost" onClick={onReferences}>참고 이미지 확인하기 →</button></section> : null}

    {currentStep === 'read' ? <>
      <section className="card stack image-analysis" aria-labelledby="image-read-title">
        <header className="image-section-heading"><span className="eyebrow">원본 이해하기</span><h2 ref={sectionHeading} tabIndex={-1} id="image-read-title">이 이미지의 장면을 글로 읽어볼까요?</h2><p className="small muted">내 ChatGPT·Claude에 아래 요청문과 같은 이미지를 첨부하세요. AI가 보이는 특징을 먼저 정리하고, 바꿀 부분을 물어봐요.</p></header>
        {reference && <div className="image-source-preview"><img src={reference.dataUrl} alt={`시작 이미지: ${reference.name}`} /><div className="stack"><strong>{reference.name}</strong><span className="small muted">만들 결과물 · {mode.label}</span><a className="image-download" href={reference.dataUrl} download={`${reference.name.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_')}-reference.jpg`}>AI에 첨부할 이미지 저장 ↓</a>{draft.sourceUrl && <a className="small muted image-source-link" href={safeSourceUrl(draft)} target="_blank" rel="noreferrer">출처 보기 ↗</a>}</div></div>}
        <div className="image-handoff"><button type="button" disabled={!reference} onClick={async () => toast(await copyText(request) ? '이미지 읽기 요청을 복사했어요. 내 AI에 붙여 넣고 같은 이미지도 첨부하세요.' : '복사하지 못했어요. 아래 요청문을 펼쳐 직접 복사해 주세요.')}>이미지 읽기 요청 복사</button><div className="image-ai-links"><a href="https://chatgpt.com/" target="_blank" rel="noreferrer">ChatGPT 열기 ↗</a><a href="https://claude.ai/new" target="_blank" rel="noreferrer">Claude 열기 ↗</a></div></div>
        <p className="small muted">이미지는 이 브라우저에 보관돼요. 사이트가 이미지를 분석하거나 AI로 자동 전송하지는 않아요.</p>
        <details className="image-request-detail"><summary>AI에 보낼 요청문 보기</summary><div className="mono image-request-text" tabIndex={0}>{request}</div></details>
      </section>
      <section className="card stack" aria-labelledby="image-description-title">
        <header className="image-section-heading"><h2 id="image-description-title">이미지에서 읽은 원본 설명</h2><p className="small muted" id="image-description-help">AI가 만든 기본 묘사 프롬프트를 가져오세요. 직접 적어도 좋아요. 사진과 다른 추측은 고치고, 바꾸고 싶은 부분은 다음 단계에서 따로 적어요.</p></header>
        <label className="sr-only" htmlFor="image-description">원본 설명</label>
        <textarea id="image-description" rows={8} value={draft.description} maxLength={IMAGE_PROMPT_LIMITS.description} onChange={event => update('description', event.target.value)} onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }} aria-describedby="image-description-help" placeholder="예: 중앙에 작은 집이 있고, 둥근 나무들이 둘러싸고 있다. 높은 시점에서 내려다보며, 왼쪽 위의 따뜻한 빛이 긴 그림자를 만든다…" />
        <details className="image-observation-guide"><summary>어떤 특징을 읽으면 좋을까요?</summary><dl><div><dt>대상과 구도</dt><dd>무엇이 어디에 있고, 어느 크기와 시점으로 보이나요?</dd></div><div><dt>색·빛·재질</dt><dd>따뜻한 빛, 거친 표면처럼 눈으로 확인되는 특징을 적어요.</dd></div><div><dt>아직 알 수 없는 것</dt><dd>보이지 않는 뒷면이나 클릭 동작은 이미지에서 알 수 없어요. 내 장면의 조건으로 따로 정해요.</dd></div></dl></details>
        <div className="image-next-action"><span className="small muted">원본 설명은 다음 단계에서도 보관돼요.</span><button type="button" disabled={!ready} onClick={() => go('change')}>유지할 부분과 바꿀 부분 정하기 →</button></div>
      </section>
    </> : <>
      <section className="card stack image-adapt" aria-labelledby="image-change-title">
        <header className="image-section-heading"><span className="eyebrow">내 장면 만들기</span><h2 ref={sectionHeading} tabIndex={-1} id="image-change-title">어떤 특징을 남기고, 무엇을 바꿀까요?</h2><p className="small muted">원본에서 가져올 특징과 원하는 변화를 나누세요. 바꿀 내용은 원본 묘사보다 우선해서 요청해요.</p></header>
        <details className="image-baseline"><summary>원본 이미지와 설명 다시 보기</summary><div className="image-baseline-body">{reference && <img src={reference.dataUrl} alt="원본 참고 이미지" />}<p>{draft.description}</p></div><button type="button" className="ghost" onClick={() => go('read')}>원본 설명 수정하기 →</button></details>
        <div className="image-change-grid">
          {textField('preserve', '유지할 특징', '원본의 어떤 점이 마음에 들었나요?', '예: 높은 시점, 집과 나무의 배치, 둥글고 부드러운 형태')}
          {textField('changes', '바꿀 부분', '어떤 상태에서 어떻게 달라져야 하나요?', '예: 낮 풍경을 푸른 밤으로 바꾸고, 창문에서 따뜻한 빛이 새어 나오게')}
        </div>
        {brief.mode !== 'image' && <p className="image-mode-note small">{brief.mode === 'web' ? '3D 웹에서는 보이지 않는 뒷면과 조작도 정해 주세요. 예: “드래그로 회전하고, 집을 클릭하면 불이 켜진다.”' : '영상에서는 움직임과 시간의 흐름도 정해 주세요. 예: “카메라가 천천히 다가가며 창문 불빛이 켜진다.”'}</p>}
        <div className="image-next-action"><span className="small muted">변경할 것이 없으면 원본 설명만으로도 이어갈 수 있어요.</span><button type="button" disabled={!ready} onClick={() => { if (!composing.current && ready) onPreview() }}>이 조건으로 프롬프트 보기 →</button></div>
      </section>
      <section className="image-refine-option"><div><h3>아직 결정하기 어렵다면</h3><p className="small muted">원본 설명과 변경 조건을 담아, 내 AI에 질문을 요청할 수 있어요.</p></div><button type="button" className="secondary" onClick={() => { if (!composing.current && ready) onRefine() }}>내 AI로 더 구체화하기 →</button></section>
    </>}
  </div>
}

function safeSourceUrl(draft: ImagePromptDraft): string | undefined {
  try { const url = new URL(draft.sourceUrl); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined } catch { return undefined }
}
