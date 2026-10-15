import { useEffect, useId, useRef, useState } from 'react'
import { buildCoachingRequest, createPromptCoaching } from '../lib/coach-handoff'
import { coachingContext } from '../lib/coaching-context'
import { buildMcpStarter } from '../lib/mcp-connection'
import { useStore } from '../store'
import { copyText, useToast } from './ui'
import { CoachConversation } from './CoachConversation'
import { CoachConnection } from './CoachConnection'

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
  const [method, setMethod] = useState<'guide' | 'chatgpt'>(() =>
    project?.promptCoaching?.session ? 'guide' : 'chatgpt',
  )
  const methodHeading = useRef<HTMLHeadingElement>(null)
  const requestBox = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)
  const currentProjectId = useRef(project?.id)

  useEffect(() => {
    alive.current = true
    currentProjectId.current = project?.id
    return () => { alive.current = false }
  }, [project?.id])

  if (!project) return null
  const { brief, source, session, sessionStale, answerCount } = coachingContext(project)
  const requestText = buildMcpStarter({ medium: brief.mode, idea: brief.idea, requestText: buildCoachingRequest(brief, project.references, project.locks, session) })
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
  const changeMethod = (next: 'guide' | 'chatgpt') => {
    setMethod(next)
    requestAnimationFrame(() => methodHeading.current?.focus())
  }

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
      toast('코칭 요청문을 복사했어요. ChatGPT나 Claude에 붙여 넣어 주세요.')
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
      <div className="coaching-methods" role="group" aria-label="질문 방식">
        <button type="button" className={method === 'chatgpt' ? 'on' : ''} aria-pressed={method === 'chatgpt'} onClick={() => changeMethod('chatgpt')}>내 AI에서 구체화 <span aria-hidden="true">↗</span></button>
        <button type="button" className={method === 'guide' ? 'on' : ''} aria-pressed={method === 'guide'} onClick={() => changeMethod('guide')}>사이트에서 정리</button>
      </div>
      <h2 className="sr-only" ref={methodHeading} tabIndex={-1}>{method === 'guide' ? '사이트에서 기본 질문으로 정리하기' : '내 AI에서 문맥에 맞는 질문받기'}</h2>
      {method === 'guide' ? <CoachConversation onPreview={onPreview} onEdit={onEdit} onHandoff={() => changeMethod('chatgpt')} /> : <>
      <div className="note coaching-intro"><p><b>웹에서 장면 작성 → 내 AI에서 질문·답변 → 웹에 완성본 가져오기</b></p><p>작성한 장면을 내 ChatGPT나 Claude에 전달하세요. AI가 부족한 조건과 필요한 이유를 질문하면 답한 뒤, 완성본을 이 화면으로 가져오면 돼요.</p>{answerCount > 0 && <p>사이트에서 저장한 답변 {answerCount}개도 코칭 요청문에 함께 담겨요.</p>}</div>
      <CoachConnection collapsed hasScene={hasIdea} />
      {sessionStale && <div className="note warn stack" role="status"><p>장면 설정이 바뀌어 이전 질문 답변은 이번 요청에서 제외했어요. 기록을 확인한 뒤 다시 이어 쓸 수 있어요.</p><button className="ghost" type="button" onClick={() => changeMethod('guide')}>이전 답변 확인하기 →</button></div>}

      {changed && <div className="note warn coaching-change" role="status">
        <p><b>장면 설정이 바뀌었어요.</b> 이전 코칭 요청과 가져온 내용은 보관되어 있어요. 새로 요청하거나, 지금 장면과 비교한 뒤 사용하세요.</p>
        <button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button>
      </div>}
      {(!sourceFits || !requestFits) && <div className="note warn coaching-change" role="status"><p>장면 설명과 참고 메모가 길어 코칭 요청을 보관할 수 없어요. 장면 설정에서 필요한 조건만 남겨 주세요.</p><button type="button" className="ghost" onClick={onEdit}>장면 설정 줄이기 →</button></div>}

      <section className="card stack coaching-step" aria-labelledby={`${id}-copy-title`}>
        <div className="coaching-step-heading">
          <span className="coaching-step-number" aria-hidden="true">01</span>
          <div><h2 id={`${id}-copy-title`}>내 AI에 장면 전달하기</h2><p className="muted">장면과 조건, 코칭 방법을 담은 요청문이에요. 복사해 내 AI에 보내면 첫 질문으로 바로 시작합니다. MCP를 연결했다면 코칭 도구를 사용하고, 연결하지 않아도 대화를 이어갈 수 있어요.</p></div>
        </div>
        <div className="coaching-copy-row">
          <button type="button" disabled={!hasIdea || copying || !sourceFits || !requestFits} onClick={copyRequest}>{copying ? '복사하는 중…' : '코칭 요청문 복사'}</button>
          <p className="small muted" role="status">
            {coaching.request ? <>{requestStale ? '이전 장면의 요청문을 복사해 둔 상태예요.' : '현재 장면의 요청문을 복사했어요.'}{validCopiedDate && <><br /><time dateTime={validCopiedDate.toISOString()}>{validCopiedDate.toLocaleString('ko-KR')}</time></>}</> : 'ChatGPT와 Claude에서 같은 요청문을 사용할 수 있어요.'}
          </p>
        </div>
        {!hasIdea && <p className="small muted">장면 설정에서 만들고 싶은 장면을 한 문장 적어 주세요. <button type="button" className="ghost" onClick={onEdit}>장면 적기 →</button></p>}
        <div className="stack coaching-ai-choice" aria-labelledby={`${id}-chat-title`}>
          <h3 id={`${id}-chat-title`}>복사한 뒤 사용할 AI 열기</h3>
          <div className="coaching-open-row"><a className="coaching-open-chat" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" aria-label="ChatGPT 열기 (새 탭)">ChatGPT <span aria-hidden="true">↗</span></a><a className="coaching-open-chat" href="https://claude.ai/" target="_blank" rel="noopener noreferrer" aria-label="Claude 열기 (새 탭)">Claude <span aria-hidden="true">↗</span></a></div>
          <p className="small muted">새 탭에서 코칭 요청문을 붙여 넣고 질문에 답하세요. 조건이 정리되면 “이 조건으로 프롬프트를 완성해 줘”라고 요청하고, 완성본을 아래에 가져오세요. 참고 이미지는 AI 대화에 직접 첨부해 주세요.</p>
          <p className="small muted">선택한 서비스의 본인 계정으로 사용하며 해당 서비스의 이용 한도가 적용돼요. 사이트와 대화 내용은 자동으로 연결되지 않아요.</p>
        </div>
        {copyFailed && <p className="small coaching-copy-failed" role="alert">자동 복사를 완료하지 못했어요. 요청문을 직접 선택해 복사하면 같은 내용을 전달할 수 있어요.</p>}
        <details className="coaching-request-preview" open={previewOpen} onToggle={(event) => setPreviewOpen(event.currentTarget.open)}>
          <summary>복사할 코칭 요청문 미리보기</summary>
          <div className="stack">
            <textarea ref={requestBox} readOnly value={requestText} rows={9} aria-label="ChatGPT나 Claude에 전달할 코칭 요청문" className="coaching-request-text" onCopy={(event) => {
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
              toast('코칭 요청문을 복사했어요. ChatGPT나 Claude에 붙여 넣어 주세요.')
            }} />
            <div className="row"><button type="button" className="secondary" onClick={() => { requestBox.current?.focus(); requestBox.current?.select(); toast('요청문을 선택했어요. 기기의 복사 기능으로 복사해 주세요.') }}>요청문 전체 선택</button></div>
          </div>
        </details>
        {coaching.request && requestStale && <details className="coaching-previous-request"><summary>마지막으로 복사한 요청 보기</summary><div className="coaching-saved-text mono" tabIndex={0}>{coaching.request.text}</div></details>}
      </section>

      <section className="card stack coaching-step" aria-labelledby={`${id}-import-title`}>
        <div className="coaching-step-heading">
          <span className="coaching-step-number" aria-hidden="true">02</span>
          <div><h2 id={`${id}-import-title`}>완성한 프롬프트 가져오기</h2><p className="muted">AI 대화에서 완성한 프롬프트를 복사해 이 웹에 붙여 넣으세요. 내 의도와 맞는지 읽은 뒤 사용하면 돼요.</p></div>
        </div>
        <label className="stack coaching-draft-label" htmlFor={`${id}-draft`}><span>가져온 프롬프트</span><textarea id={`${id}-draft`} value={coaching.draft} onChange={(event) => updateDraft(event.target.value)} maxLength={MAX_DRAFT} rows={9} aria-describedby={`${id}-draft-help`} placeholder="ChatGPT나 Claude에서 다듬은 프롬프트를 여기에 붙여 넣으세요." /></label>
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
      </>}
    </div>
  )
}
