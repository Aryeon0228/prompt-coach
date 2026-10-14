import { useEffect, useId, useRef, useState } from 'react'
import { buildCoachingRequest, coachingSource, createPromptCoaching } from '../lib/coach-handoff'
import { createFreeBrief } from '../lib/free-prompt'
import { useStore } from '../store'
import { copyText, useToast } from './ui'

const MAX_DRAFT = 100000
const MAX_NOTES = 10000

export function PromptCoaching({ onPreview, onEdit }: { onPreview: () => void; onEdit: () => void }) {
  const { project, updateProject } = useStore()
  const toast = useToast()
  const id = useId()
  const [copying, setCopying] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
  const [confirmedSource, setConfirmedSource] = useState<string | null>(null)
  const requestBox = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const currentProjectId = useRef(project?.id)

  useEffect(() => {
    alive.current = true
    currentProjectId.current = project?.id
    return () => { alive.current = false }
  }, [project?.id])

  if (!project) return null
  const brief = project.freeform ?? createFreeBrief()
  const source = coachingSource(brief, project.references, project.locks)
  const requestText = buildCoachingRequest(brief, project.references, project.locks)
  const coaching = project.promptCoaching ?? createPromptCoaching()
  const sourceFits = source.length <= MAX_DRAFT
  const requestFits = requestText.length <= MAX_DRAFT
  const hasIdea = Boolean(brief.idea.trim())
  const hasDraft = Boolean(coaching.draft.trim())
  const requestStale = Boolean(coaching.request && coaching.request.source !== source)
  const draftStale = hasDraft && coaching.draftSource !== source
  const acceptedStale = Boolean(coaching.accepted && coaching.accepted.source !== source)
  const changed = requestStale || draftStale || acceptedStale
  const canUse = hasIdea && hasDraft && sourceFits && requestFits && (!draftStale || confirmedSource === source)
  const copiedDate = coaching.request ? new Date(coaching.request.copiedAt) : null
  const validCopiedDate = copiedDate && Number.isFinite(copiedDate.getTime()) ? copiedDate : null

  const copyRequest = async () => {
    if (!hasIdea || copying || !sourceFits || !requestFits) return
    setCopying(true)
    setCopyFailed(false)
    const projectId = project.id
    const text = requestText
    const copiedSource = source
    let copied = false
    try {
      copied = await copyText(text)
    } catch {
      copied = false
    }
    if (!alive.current || currentProjectId.current !== projectId) return
    setCopying(false)
    if (copied) {
      updateProject((p) => p.id !== projectId ? p : {
        ...p,
        promptCoaching: {
          ...(p.promptCoaching ?? createPromptCoaching()),
          request: { text, source: copiedSource, copiedAt: Date.now() },
        },
      })
      toast('코칭 요청을 복사했어요. ChatGPT에 붙여 넣어 주세요.')
    } else {
      setCopyFailed(true)
      setPreviewOpen(true)
      toast('자동 복사가 안 됐어요. 아래 요청문을 직접 선택해 복사해 주세요.')
      requestAnimationFrame(() => {
        requestBox.current?.focus()
        requestBox.current?.select()
      })
    }
  }

  const updateDraft = (draft: string) => {
    setConfirmedSource(null)
    updateProject((p) => {
      const current = p.promptCoaching ?? createPromptCoaching()
      return {
        ...p,
        promptCoaching: {
          ...current,
          draft: draft.slice(0, MAX_DRAFT),
          draftSource: current.draft.trim() ? current.draftSource : current.request?.source ?? (sourceFits ? source : ''),
        },
      }
    })
  }

  const updateNotes = (notes: string) => updateProject((p) => ({
    ...p,
    promptCoaching: { ...(p.promptCoaching ?? createPromptCoaching()), notes: notes.slice(0, MAX_NOTES) },
  }))

  const useDraft = () => {
    if (!canUse) return
    updateProject((p) => ({
      ...p,
      promptCoaching: {
        ...(p.promptCoaching ?? createPromptCoaching()),
        draftSource: source,
        accepted: { text: coaching.draft, source, acceptedAt: Date.now() },
      },
    }))
    toast(coaching.accepted ? '사용할 프롬프트를 업데이트했어요.' : '사용할 프롬프트로 저장했어요.')
    onPreview()
  }

  return (
    <div className="stack prompt-coaching">
      <div className="note coaching-intro">
        <p>내 장면을 바탕으로 질문받고, 답하면서 프롬프트를 다듬어 보세요. 실제 대화는 새 탭의 ChatGPT에서 이어져요.</p>
      </div>

      {changed && <div className="note warn coaching-change" role="status">
        <p><b>장면 설정이 바뀌었어요.</b> 이전 코칭 요청과 가져온 내용은 보관되어 있어요. 새로 요청하거나, 지금 장면과 비교한 뒤 사용하세요.</p>
        <button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button>
      </div>}
      {(!sourceFits || !requestFits) && <div className="note warn coaching-change" role="status"><p>장면 설명과 참고 메모가 길어 코칭 요청을 보관할 수 없어요. 장면 설정에서 필요한 조건만 남겨 주세요.</p><button type="button" className="ghost" onClick={onEdit}>장면 설정 줄이기 →</button></div>}

      <section className="card stack coaching-step" aria-labelledby={`${id}-copy-title`}>
        <div className="coaching-step-heading">
          <span className="coaching-step-number" aria-hidden="true">01</span>
          <div><h2 id={`${id}-copy-title`}>내 장면으로 코칭 요청하기</h2><p className="muted">적어 둔 장면과 조건에, 질문하며 도와 달라는 요청을 더했어요.</p></div>
        </div>
        <div className="coaching-copy-row">
          <button type="button" disabled={!hasIdea || copying || !sourceFits || !requestFits} onClick={copyRequest}>{copying ? '복사하는 중…' : '코칭 요청 복사'}</button>
          <p className="small muted" role="status">
            {coaching.request ? <>{requestStale ? '이전 장면의 요청을 복사해 둔 상태예요.' : '현재 장면의 요청을 복사했어요.'}{validCopiedDate && <><br /><time dateTime={validCopiedDate.toISOString()}>{validCopiedDate.toLocaleString('ko-KR')}</time></>}</> : '복사한 뒤 다음 단계에서 ChatGPT에 붙여 넣으세요.'}
          </p>
        </div>
        {!hasIdea && <p className="small muted">장면 설정에서 만들고 싶은 장면을 한 문장 적어 주세요. <button type="button" className="ghost" onClick={onEdit}>장면 적기 →</button></p>}
        {copyFailed && <p className="small coaching-copy-failed" role="alert">자동 복사를 완료하지 못했어요. 요청문을 직접 선택해 복사하면 같은 내용을 전달할 수 있어요.</p>}
        <details className="coaching-request-preview" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
          <summary>복사할 요청문 미리보기</summary>
          <div className="stack">
            <textarea ref={requestBox} readOnly value={requestText} rows={9} aria-label="ChatGPT에 전달할 코칭 요청문" className="coaching-request-text" onCopy={(event) => {
              const field = event.currentTarget
              if (event.defaultPrevented || !hasIdea || !sourceFits || !requestFits || field.selectionStart !== 0 || field.selectionEnd !== requestText.length) return
              updateProject((p) => p.id !== project.id ? p : {
                ...p,
                promptCoaching: {
                  ...(p.promptCoaching ?? createPromptCoaching()),
                  request: { text: requestText, source, copiedAt: Date.now() },
                },
              })
              setCopyFailed(false)
              toast('코칭 요청을 복사했어요. ChatGPT에 붙여 넣어 주세요.')
            }} />
            <div className="row"><button type="button" className="secondary" onClick={() => { requestBox.current?.focus(); requestBox.current?.select(); toast('요청문을 선택했어요. 기기의 복사 기능으로 복사해 주세요.') }}>요청문 전체 선택</button></div>
          </div>
        </details>
        {coaching.request && requestStale && <details className="coaching-previous-request"><summary>마지막으로 복사한 요청 보기</summary><div className="coaching-saved-text mono" tabIndex={0}>{coaching.request.text}</div></details>}
      </section>

      <section className="card stack coaching-step" aria-labelledby={`${id}-chat-title`}>
        <div className="coaching-step-heading">
          <span className="coaching-step-number" aria-hidden="true">02</span>
          <div><h2 id={`${id}-chat-title`}>ChatGPT에서 질문에 답하기</h2><p className="muted">요청문을 붙여 넣고 보내세요. 질문에 답한 뒤, 원하는 수준이 되면 완성된 프롬프트를 달라고 해 보세요.</p></div>
        </div>
        <div className="coaching-open-row"><a className="coaching-open-chat" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-label="ChatGPT 열기 (새 탭)">ChatGPT 열기 <span aria-hidden="true">↗</span></a></div>
        <p className="small muted">본인 ChatGPT 계정으로 대화하며, 사용량은 해당 계정의 한도가 적용돼요. 참고 이미지는 ChatGPT에 직접 첨부해 주세요.</p>
      </section>

      <section className="card stack coaching-step" aria-labelledby={`${id}-import-title`}>
        <div className="coaching-step-heading">
          <span className="coaching-step-number" aria-hidden="true">03</span>
          <div><h2 id={`${id}-import-title`}>완성한 프롬프트 가져오기</h2><p className="muted">대화에서 완성한 요청문을 아래에 붙여 넣고, 내 의도와 맞는지 읽어 보세요.</p></div>
        </div>
        <label className="stack coaching-draft-label" htmlFor={`${id}-draft`}><span>가져온 프롬프트</span><textarea id={`${id}-draft`} value={coaching.draft} onChange={(event) => updateDraft(event.target.value)} maxLength={MAX_DRAFT} rows={9} aria-describedby={`${id}-draft-help`} placeholder="ChatGPT에서 다듬은 프롬프트를 여기에 붙여 넣으세요." /></label>
        <p className="small muted" id={`${id}-draft-help`}>초안과 메모는 이 브라우저에 자동 보관돼요. 아래 사용 버튼을 눌러야 최종 프롬프트에 반영됩니다.</p>
        <details className="coaching-notes"><summary>대화에서 배운 점 남기기 <span className="small muted">선택</span></summary><label className="stack" htmlFor={`${id}-notes`}><span className="sr-only" id={`${id}-notes-label`}>대화에서 배운 점 메모</span><textarea id={`${id}-notes`} aria-labelledby={`${id}-notes-label`} aria-describedby={`${id}-notes-help`} value={coaching.notes} maxLength={MAX_NOTES} rows={4} placeholder="예: ‘분위기 있게’ 대신 빛이 들어오는 방향과 색을 정하니 장면이 분명해졌어요." onChange={(event) => updateNotes(event.target.value)} /><span className="small muted" id={`${id}-notes-help`}>내가 참고할 메모예요. 최종 프롬프트에는 들어가지 않아요.</span></label></details>

        {draftStale && <div className="coaching-compare-check">
          <p className="small muted">{coaching.draftSource ? '이 초안은 이전 장면의 코칭 요청과 연결되어 있어요.' : '이 초안의 기준이 된 장면 설정을 확인할 수 없어요.'} 지금 장면의 조건이 잘 반영됐는지 확인해 주세요.</p>
          <label><input type="checkbox" checked={confirmedSource === source} onChange={(event) => setConfirmedSource(event.target.checked ? source : null)} /><span>현재 장면 설정과 비교했어요</span></label>
        </div>}
        {coaching.accepted && <p className="small muted">{acceptedStale ? '이전에 사용한 프롬프트도 남아 있어요. 새 내용을 확인한 뒤 업데이트하세요.' : '이미 저장한 최종 프롬프트가 있어요. 초안을 수정한 뒤 업데이트할 수 있어요.'}</p>}
        <div className="coaching-use-row">
          <p className="small muted">처음 작성한 장면 설정은 그대로 보관돼요.</p>
          <button type="button" disabled={!canUse} onClick={useDraft}>{coaching.accepted ? '프롬프트 업데이트하기' : '이 프롬프트 사용하기'} <span aria-hidden="true">→</span></button>
        </div>
      </section>
    </div>
  )
}
