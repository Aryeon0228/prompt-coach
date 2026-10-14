import { useEffect, useId, useRef, useState } from 'react'
import {
  COACHING_ANSWER_LIMIT,
  createGuidedSession,
  getCoachingQuestions,
  nextCoachingQuestion,
  type CoachingField,
  type GuidedSession,
} from '../lib/coach-conversation'
import { coachingSource, createPromptCoaching } from '../lib/coach-handoff'
import { createFreeBrief } from '../lib/free-prompt'
import { useStore } from '../store'
import '../coach-conversation.css'

const SOURCE_LIMIT = 100000
const MODE_LABELS = { image: '이미지', video: '영상', web: '3D 웹 장면' }

export function CoachConversation({ onPreview, onEdit, onHandoff }: {
  onPreview: () => void
  onEdit: () => void
  onHandoff: () => void
}) {
  const { project, updateProject } = useStore()
  const id = useId()
  const [editing, setEditing] = useState<{ projectId: string; field: CoachingField } | null>(null)
  const [reviewedSource, setReviewedSource] = useState<{ projectId: string; source: string } | null>(null)
  const questionHeading = useRef<HTMLHeadingElement>(null)
  const answerBox = useRef<HTMLTextAreaElement>(null)
  const completionHeading = useRef<HTMLHeadingElement>(null)
  const focusRequested = useRef(false)
  const focusProjectId = useRef<string | null>(null)
  const brief = project?.freeform ?? createFreeBrief()
  const source = project ? coachingSource(brief, project.references, project.locks) : ''
  const session = project?.promptCoaching?.session
  const sourceFits = source.length <= SOURCE_LIMIT
  const hasIdea = Boolean(brief.idea.trim())
  const stale = Boolean(session && (session.source !== source || session.mode !== brief.mode))
  const questions = getCoachingQuestions(brief)
  const historyQuestions = getCoachingQuestions({ ...brief, mode: session?.mode ?? brief.mode })
  const editingField = editing?.projectId === project?.id ? editing?.field : undefined
  const nextQuestion = session ? nextCoachingQuestion(brief, session) : undefined
  const question = editingField ? questions.find((item) => item.field === editingField) : nextQuestion
  const completed = Boolean(session && (session.completed || !nextQuestion) && !editingField)
  const answerText = question && session
    ? session.drafts[question.field] ?? session.answers[question.field]?.text ?? ''
    : ''
  const history = historyQuestions.filter((item) => session?.answers[item.field] || session?.drafts[item.field]?.trim())
  const answeredCount = history.filter((item) => session?.answers[item.field]?.status === 'answered').length
  const deferredCount = history.filter((item) => session?.answers[item.field]?.status === 'deferred').length
  const unfinishedDraftCount = questions.filter((item) => {
    const draft = session?.drafts[item.field]
    return Boolean(draft?.trim() && draft !== session?.answers[item.field]?.text)
  }).length
  const canContinue = Boolean(session && !stale && sourceFits && hasIdea)

  useEffect(() => {
    if (!focusRequested.current) return
    focusRequested.current = false
    if (focusProjectId.current !== project?.id) return
    if (completed) completionHeading.current?.focus()
    else questionHeading.current?.focus()
  }, [project?.id, question?.field, editingField, completed, stale])

  if (!project) return null
  const projectId = project.id

  const requestFocus = () => {
    focusRequested.current = true
    focusProjectId.current = projectId
  }

  // A delayed store update must never change a newly opened project or scene.
  const updateSession = (change: (current: GuidedSession) => GuidedSession, allowStale = false) => {
    updateProject((currentProject) => {
      if (currentProject.id !== projectId) return currentProject
      const currentBrief = currentProject.freeform ?? createFreeBrief()
      const currentSource = coachingSource(currentBrief, currentProject.references, currentProject.locks)
      const currentCoaching = currentProject.promptCoaching ?? createPromptCoaching()
      const currentSession = currentCoaching.session
      if (currentSource !== source || currentSource.length > SOURCE_LIMIT || !currentSession) return currentProject
      if (!allowStale && (currentSession.source !== currentSource || currentSession.mode !== currentBrief.mode)) return currentProject
      return {
        ...currentProject,
        promptCoaching: { ...currentCoaching, session: change(currentSession) },
      }
    })
  }

  const start = () => {
    if (!hasIdea || !sourceFits) return
    requestFocus()
    updateProject((currentProject) => {
      if (currentProject.id !== projectId || currentProject.promptCoaching?.session) return currentProject
      const currentBrief = currentProject.freeform ?? createFreeBrief()
      const currentSource = coachingSource(currentBrief, currentProject.references, currentProject.locks)
      if (currentSource !== source) return currentProject
      const next = createGuidedSession(currentBrief, currentSource)
      return {
        ...currentProject,
        promptCoaching: {
          ...(currentProject.promptCoaching ?? createPromptCoaching()),
          session: { ...next, completed: !nextCoachingQuestion(currentBrief, next) },
        },
      }
    })
  }

  const saveDraft = (text: string) => {
    if (!question || !canContinue) return
    const field = question.field
    updateSession((current) => ({
      ...current,
      drafts: { ...current.drafts, [field]: text.slice(0, COACHING_ANSWER_LIMIT) },
    }))
  }

  const saveAnswer = (deferred = false) => {
    if (!question || !canContinue || (!deferred && !answerText.trim())) return
    const field = question.field
    requestFocus()
    updateSession((current) => {
      const draft = current.drafts[field] ?? current.answers[field]?.text ?? ''
      if (!deferred && !draft.trim()) return current
      const next: GuidedSession = {
        ...current,
        // Imported answers may have no separate draft; keep their text when deferring.
        drafts: { ...current.drafts, [field]: draft },
        answers: {
          ...current.answers,
          [field]: { status: deferred ? 'deferred' : 'answered', text: deferred ? '' : draft },
        },
      }
      return { ...next, completed: current.completed || !nextCoachingQuestion(brief, next) }
    })
    setEditing(null)
  }

  const finish = () => {
    if (!canContinue) return
    requestFocus()
    updateSession((current) => ({ ...current, completed: true }))
    setEditing(null)
  }

  const adoptSource = () => {
    if (!sourceFits || !hasIdea || reviewedSource?.projectId !== projectId || reviewedSource.source !== source) return
    requestFocus()
    updateSession((current) => ({ ...current, source, mode: brief.mode }), true)
    setEditing(null)
    setReviewedSource(null)
  }

  return (
    <section className="card stack coach-conversation" aria-labelledby={`${id}-title`}>
      <header className="conversation-heading">
        <div className="stack">
          <span className="conversation-mode">AI 연결 전 · 준비된 질문</span>
          <h2 id={`${id}-title`}>기본 질문으로 정리</h2>
          <p className="muted">아직 비어 있는 항목을 한 번에 하나씩 살펴봐요. 이미 원문에 쓴 내용은 건너뛰어도 돼요.</p>
        </div>
      </header>

      <details className="conversation-scene">
        <summary>내 장면 보기 <span className="small muted">{MODE_LABELS[brief.mode]}</span></summary>
        <div className="stack">
          <p className="conversation-text">{brief.idea.trim() || '아직 장면을 적지 않았어요.'}</p>
          <div><button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button></div>
        </div>
      </details>

      {stale && <div className="conversation-stale" role="region" aria-label="바뀐 장면 확인">
        <p><b>장면 설정이 바뀌었어요.</b> 답변과 작성 중인 내용은 모두 보관했어요. 현재 장면과 비교한 뒤 이어 써 주세요.</p>
        {session?.mode !== brief.mode && <p className="small">{MODE_LABELS[session!.mode]} → {MODE_LABELS[brief.mode]} · 결과물 종류가 바뀌었어요. 이어 쓰면 새 종류에 맞는 질문이 표시되고, 이전 답변은 그대로 남아요.</p>}
        <p className="small muted">장면 설정에 이미 쓴 항목은 그 내용을 우선해요. 확인하기 전까지 이전 답변은 새 프롬프트에 반영하지 않아요.</p>
        <label className="conversation-review"><input type="checkbox" checked={reviewedSource?.projectId === projectId && reviewedSource.source === source} onChange={(event) => setReviewedSource(event.target.checked ? { projectId, source } : null)} /><span>현재 장면과 아래 답변을 비교했어요</span></label>
        <div className="row"><button type="button" className="secondary" disabled={!hasIdea || !sourceFits || reviewedSource?.projectId !== projectId || reviewedSource.source !== source} onClick={adoptSource}>현재 장면에 답변 이어 쓰기</button><button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button></div>
      </div>}

      {!sourceFits && <p className="conversation-warning" role="status">장면과 참고 메모가 길어 질문 기록을 연결할 수 없어요. 장면 설정에서 필요한 조건만 남겨 주세요.</p>}

      {!session && <div className="stack conversation-start">
        <p className="muted">답변마다 왜 필요한 조건인지 함께 알아볼 수 있어요. 필요한 만큼만 답하고, 언제든 프롬프트를 확인하세요.</p>
        <div><button type="button" disabled={!hasIdea || !sourceFits} onClick={start}>질문 시작하기</button></div>
        {!hasIdea && <p className="small muted">먼저 만들고 싶은 장면을 한 문장 적어 주세요. <button type="button" className="ghost" onClick={onEdit}>장면 적기 →</button></p>}
      </div>}

      {session && !stale && completed && <div className="stack conversation-complete">
        <h3 ref={completionHeading} tabIndex={-1}>여기까지 정리했어요</h3>
        <p className="muted">답변 {answeredCount}개 · 보류 {deferredCount}개</p>
        <p>확정한 답변을 원래 장면에 더해 프롬프트로 볼 수 있어요. 더 구체화하고 싶으면 본인 ChatGPT나 Claude에서 질문을 이어가세요.</p>
        {unfinishedDraftCount > 0 && <p className="small muted">작성 중인 답변 {unfinishedDraftCount}개는 아직 확정하지 않았어요. 아래 기록이나 남은 질문에서 이어 쓸 수 있어요.</p>}
        <div className="conversation-result-actions"><button type="button" disabled={!sourceFits || !hasIdea} onClick={onPreview}>정리한 프롬프트 보기 →</button><button type="button" className="secondary" onClick={onHandoff}>내 AI에서 더 구체화</button></div>
        {nextQuestion && <div><button type="button" className="ghost" onClick={() => { requestFocus(); updateSession((current) => ({ ...current, completed: false })) }}>남은 질문 이어가기</button></div>}
      </div>}

      {session && !stale && !completed && question && <form className="stack conversation-question" onSubmit={(event) => { event.preventDefault(); saveAnswer() }}>
        <div className="conversation-question-meta"><span>{editingField ? '답변 수정' : question.label}</span><span className="small muted">저장한 답변 {answeredCount}개 · 보류 {deferredCount}개</span></div>
        <h3 ref={questionHeading} tabIndex={-1} id={`${id}-question`}><span aria-hidden="true">Q.</span> {question.question}</h3>
        {editingField && brief[editingField].trim() && <p className="small muted">이 항목은 장면 설정에 적은 내용을 우선 사용해요. 여기의 답변은 별도 기록으로 보관돼요. <button type="button" className="ghost" onClick={onEdit}>장면 설정 보기 →</button></p>}
        <div className="conversation-why" id={`${id}-why`}><span>왜 필요할까요?</span><p>{question.why}</p></div>
        <details className="conversation-examples" key={question.field}>
          <summary>답변 예시 보기</summary>
          <p className="small muted">방향을 떠올리기 위한 예시예요. 직접 답해도 돼요. 예시를 누르면 작성 칸에 추가되고, 저장 전까지는 확정되지 않아요.</p>
          <div className="conversation-example-list">{question.examples.map((example) => {
            const combined = answerText.trim() ? `${answerText}\n${example}` : example
            return <button key={example} type="button" className="conversation-example" disabled={!canContinue || combined.length > COACHING_ANSWER_LIMIT} aria-label={`예시 넣기: ${example}`} onClick={() => { saveDraft(combined); answerBox.current?.focus() }}><span>{example}</span><span aria-hidden="true">＋</span></button>
          })}</div>
        </details>
        <label className="stack conversation-answer" htmlFor={`${id}-answer`}><span>내 답변</span><textarea ref={answerBox} id={`${id}-answer`} aria-describedby={`${id}-why ${id}-autosave`} value={answerText} maxLength={COACHING_ANSWER_LIMIT} disabled={!canContinue} rows={5} placeholder="내가 원하는 조건을 편하게 적어 주세요." onChange={(event) => saveDraft(event.target.value)} /></label>
        <p className="conversation-character-count small muted">{answerText.length.toLocaleString()} / {COACHING_ANSWER_LIMIT.toLocaleString()}자</p>
        <div className="conversation-answer-actions"><button type="submit" disabled={!canContinue || !answerText.trim()}>{editingField ? '수정한 답변 저장' : '답변 저장 · 다음 질문'}</button><button type="button" className="secondary" disabled={!canContinue} onClick={() => saveAnswer(true)}>지금은 보류</button>{editingField && <button type="button" className="ghost" onClick={() => { requestFocus(); setEditing(null) }}>수정 취소</button>}</div>
        {editingField && <p className="small muted">수정한 내용을 저장하기 전까지는 이전 답변이 유지돼요. 작성 중인 내용도 남아 있어요.</p>}
        {!editingField && <div className="conversation-finish"><span className="small muted">모든 질문에 답하지 않아도 괜찮아요.</span><button type="button" className="ghost" disabled={!canContinue} onClick={finish}>여기까지 정리</button></div>}
      </form>}

      {history.length > 0 && <details className="conversation-history" open={stale || undefined}>
        <summary>답변 기록 <span className="small muted">{history.length}개</span></summary>
        <ol>{history.map((item) => {
          const saved = session!.answers[item.field]
          const draft = session!.drafts[item.field]
          return <li key={item.field}>
            <div className="conversation-history-title"><h3>{item.label}</h3><span className="small muted">{saved ? saved.status === 'deferred' ? '보류' : '답변 저장됨' : '작성 중'}</span></div>
            <p className="conversation-history-question">{item.question}</p>
            <p className="small muted">{item.why}</p>
            <p className="conversation-text conversation-history-answer">{saved ? saved.status === 'deferred' ? '아직 정하지 않았어요.' : saved.text : draft}</p>
            {saved && draft?.trim() && draft !== saved.text && <p className="small muted">작성 중인 내용도 보관돼 있어요.</p>}
            {!saved && <p className="small muted">아직 확정하지 않은 답변으로, 프롬프트에는 반영되지 않아요.</p>}
            {!stale && brief[item.field].trim() && <p className="small muted">이 항목은 장면 설정에 쓴 내용을 사용해요. 이 기록은 따로 보관돼요.</p>}
            <div><button type="button" className="ghost" disabled={!canContinue} onClick={() => { requestFocus(); setEditing({ projectId, field: item.field }) }}>{saved ? '답변 수정' : '이어서 답하기'}</button></div>
          </li>
        })}</ol>
      </details>}

      <footer className="conversation-footer"><p className="small muted" id={`${id}-autosave`}>작성 중인 답변은 이 브라우저에 자동 보관돼요. ‘답변 저장’으로 확정한 내용만 프롬프트에 반영됩니다.</p>{!completed && <button type="button" className="ghost" onClick={onHandoff}>내 글을 읽고 질문하는 AI로 이어가기 →</button>}</footer>
      <span className="sr-only" role="status" aria-live="polite">{session ? stale ? '장면이 바뀌었어요. 이전 답변을 확인해 주세요.' : completed ? `정리 완료. 저장한 답변 ${answeredCount}개, 보류 ${deferredCount}개.` : `저장한 답변 ${answeredCount}개, 보류 ${deferredCount}개.` : ''}</span>
    </section>
  )
}
