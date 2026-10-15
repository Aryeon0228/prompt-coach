import { useEffect, useId, useRef, useState } from 'react'
import { buildCoachingRequest, createPromptCoaching } from '../lib/coach-handoff'
import { coachingContext } from '../lib/coaching-context'
import { buildMcpStarter } from '../lib/mcp-connection'
import { useStore } from '../store'
import { copyText, useToast } from './ui'
import { CoachConversation } from './CoachConversation'
import { CoachConnection } from './CoachConnection'

const MAX_DRAFT = 100000

export function PromptCoaching({ onPreview, onEdit }: { onPreview: () => void; onEdit: () => void }) {
  const { project, updateProject } = useStore()
  const toast = useToast()
  const id = useId()
  const [copying, setCopying] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)
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

  return (
    <div className="stack prompt-coaching">
      <div className="coaching-methods" role="group" aria-label="질문 방식">
        <button type="button" className={method === 'chatgpt' ? 'on' : ''} aria-pressed={method === 'chatgpt'} onClick={() => changeMethod('chatgpt')}>내 AI에서 구체화 <span aria-hidden="true">↗</span></button>
        <button type="button" className={method === 'guide' ? 'on' : ''} aria-pressed={method === 'guide'} onClick={() => changeMethod('guide')}>사이트에서 정리</button>
      </div>
      <h2 className="sr-only" ref={methodHeading} tabIndex={-1}>{method === 'guide' ? '사이트에서 기본 질문으로 정리하기' : '내 AI에서 문맥에 맞는 질문받기'}</h2>
      {method === 'guide' ? <CoachConversation onPreview={onPreview} onEdit={onEdit} onHandoff={() => changeMethod('chatgpt')} /> : <>
      <section className="card stack coaching-intro" aria-labelledby={`${id}-screen-title`}>
        <div><h2 id={`${id}-screen-title`}>내 AI와 대화하며 구체화하기</h2><p className="muted">연결한 AI에게 <b>“프롬프트 코치로 이 대화에서 코칭 시작해줘”</b>라고 말하세요. 만들 결과물과 장면을 설명하면, 필요한 질문과 그 이유를 함께 살펴볼 수 있어요.</p></div>
        <div className="coaching-open-row"><a className="coaching-open-chat" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPT 열기 <span aria-hidden="true">↗</span></a><a className="coaching-open-chat" href="https://claude.ai/" target="_blank" rel="noopener noreferrer">Claude 열기 <span aria-hidden="true">↗</span></a></div>
        <div className="note stack" role="status"><p><b>코치 화면 · 호환 확인 중</b></p><p className="small">현재 Claude에서 화면 표시 오류가 확인됐어요. ChatGPT 화면은 아직 검증하지 못했습니다. 화면이 보이지 않으면 <b>“화면이 보이지 않으면 이 대화에서 코칭 시작해줘”</b>라고 말하고 일반 대화로 이어가세요.</p></div>
        <p className="small muted">연결 설정은 처음 한 번만 하면 됩니다. 질문마다 웹과 AI 사이를 복사해 오갈 필요는 없어요. 이 홈페이지 안의 직접 AI 대화는 승인 후 연결을 준비 중입니다.</p>
      </section>
      <CoachConnection collapsed hasScene={hasIdea} />
      <details className="card coaching-optional">
      <summary>웹에서 이미 작성한 장면 가져가기 <span className="small muted">선택</span></summary>
      <div className="stack">
      <p className="small muted">웹의 장면을 이어 쓰고 싶을 때만 아래 요청문을 한 번 전달하세요. 홈페이지 내용은 AI 대화로 자동 전송되지 않아요.{answerCount > 0 && <> 저장한 답변 {answerCount}개도 함께 담겨요.</>}</p>
      {sessionStale && <div className="note warn stack" role="status"><p>장면 설정이 바뀌어 이전 질문 답변은 이번 요청에서 제외했어요. 기록을 확인한 뒤 다시 이어 쓸 수 있어요.</p><button className="ghost" type="button" onClick={() => changeMethod('guide')}>이전 답변 확인하기 →</button></div>}

      {changed && <div className="note warn coaching-change" role="status">
        <p><b>장면 설정이 바뀌었어요.</b> 이전 코칭 요청과 가져온 내용은 보관되어 있어요. 새로 요청하거나, 지금 장면과 비교한 뒤 사용하세요.</p>
        <button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button>
      </div>}
      {(!sourceFits || !requestFits) && <div className="note warn coaching-change" role="status"><p>장면 설명과 참고 메모가 길어 코칭 요청을 보관할 수 없어요. 장면 설정에서 필요한 조건만 남겨 주세요.</p><button type="button" className="ghost" onClick={onEdit}>장면 설정 줄이기 →</button></div>}

      <section className="stack coaching-step" aria-labelledby={`${id}-copy-title`}>
        <div className="coaching-step-heading">
          <div><h2 id={`${id}-copy-title`}>지금 작성한 장면 전달하기</h2><p className="muted">장면과 조건을 그대로 담은 요청문이에요. 내 AI에 한 번 보내고 같은 대화에서 질문에 답하세요.</p></div>
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
          <p className="small muted">새 탭에서 코칭 요청문을 붙여 넣고 질문에 답하세요. 조건이 정리되면 “이 조건으로 프롬프트를 완성해 줘”라고 요청하고, 완성본은 ‘프롬프트’ 화면에서 가져오고 편집할 수 있어요. 참고 이미지는 AI 대화에 직접 첨부해 주세요.</p>
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
      </div>
      </details>

      <div className="row"><p className="small muted grow">완성본의 가져오기·편집·복사는 프롬프트 화면에서 할 수 있어요.</p><button type="button" className="secondary" onClick={onPreview}>프롬프트 관리하기 →</button></div>
      </>}
    </div>
  )
}
