import { useEffect, useRef, useState } from 'react'
import { assembleFreePrompt, reviewFreeBrief } from '../lib/free-prompt'
import { coachingContext } from '../lib/coaching-context'
import { useStore } from '../store'
import { copyText, downloadText, useToast } from './ui'
import { FREE_MODES } from '../lib/free-modes'
import { ImportedPromptEditor } from './ImportedPromptEditor'
import { assembleImageScenePrompt } from '../lib/image-prompt'

export function FreePromptView({ onEdit, onRefine, onRevise, onImage, importRequestKey }: { onEdit: () => void; onRefine: () => void; onRevise: () => void; onImage?: () => void; importRequestKey?: number }) {
  const { project } = useStore()
  const output = useRef<HTMLDivElement>(null)
  const [editorOpen, setEditorOpen] = useState(() => importRequestKey !== undefined || Boolean(project?.promptCoaching?.draft.trim() && project.promptCoaching.draft !== project.promptCoaching.accepted?.text))
  const [editorFocusKey, setEditorFocusKey] = useState(0)
  const lastImportRequest = useRef<number | undefined>(undefined)
  const { brief, source, sessionStale, answerCount } = coachingContext(project ?? { references: [], locks: [] })
  const accepted = project?.promptCoaching?.accepted
  const isStale = Boolean(accepted && accepted.source !== source)
  const [version, setVersion] = useState<'original' | 'coached'>(() => accepted && !isStale ? 'coached' : 'original')
  const toast = useToast()

  useEffect(() => {
    if (importRequestKey === undefined || importRequestKey === lastImportRequest.current) return
    lastImportRequest.current = importRequestKey
    setEditorOpen(true)
    setEditorFocusKey(key => key + 1)
  }, [importRequestKey])

  if (!project) return null
  const original = project.imagePrompt ? assembleImageScenePrompt(brief, project.references, project.locks, project.imagePrompt) : assembleFreePrompt(brief, project.references, project.locks)
  const imageIncomplete = Boolean(project.imagePrompt && !original)
  const showingCoached = version === 'coached' && Boolean(accepted)
  const prompt = showingCoached ? accepted!.text : original
  const canUsePrompt = Boolean(prompt.trim() && brief.idea.trim() && !imageIncomplete && !(showingCoached && isStale))
  const checks = reviewFreeBrief(brief)
  const missing = checks.filter(check => !check.filled)
  const mode = FREE_MODES.find(m => m.id === brief.mode)!
  const openImporter = () => {
    setEditorOpen(true)
    setEditorFocusKey(key => key + 1)
  }

  return <div className="stack prompt-result-page">
    <section className="prompt-ready stack" aria-labelledby="free-prompt-ready-title">
      <div className="prompt-ready-heading">
        <div className="prompt-ready-copy">
          <h2 id="free-prompt-ready-title">{imageIncomplete ? '원본 이미지와 설명을 먼저 확인해 주세요' : canUsePrompt ? '프롬프트 준비 완료' : brief.idea.trim() ? '현재 조건과 비교해 주세요' : '장면을 먼저 적어 주세요'}</h2>
          <p className="prompt-output-help">{imageIncomplete ? '이미지와 원본 설명이 있어야 원하는 변경을 담은 요청문을 만들 수 있어요.' : canUsePrompt ? `${mode.label}용 요청문 · ${showingCoached ? '내 AI에서 다듬고 직접 가져온 내용이에요.' : project.imagePrompt ? '원본 설명과 유지·변경 조건을 정리했어요.' : answerCount ? `장면 설정과 저장한 답변 ${answerCount}개를 정리했어요.` : '장면 설정에 쓴 내용을 정리했어요.'}` : brief.idea.trim() ? '가져온 문장에 현재 장면 조건이 반영됐는지 확인하고 다시 적용하세요.' : '만들고 싶은 장면을 적으면 제작을 요청할 문장이 준비돼요.'}</p>
        </div>
        <button type="button" className="ghost prompt-import-action" aria-expanded={editorOpen} onClick={openImporter}>AI 완성본 가져오기 <span aria-hidden="true">↗</span></button>
      </div>
    </section>
    <ImportedPromptEditor open={editorOpen} focusRequestKey={editorFocusKey} onOpenChange={setEditorOpen} onEdit={onEdit} onApplied={() => {
      setVersion('coached')
      setEditorOpen(false)
      requestAnimationFrame(() => output.current?.focus())
    }} />
    {sessionStale && <div className="note warn stack" role="status"><p>장면이 바뀌어 이전 질문 답변은 제외했어요. 원래 답변은 보관되어 있습니다.</p><button className="secondary" onClick={onRefine}>질문 답변 확인하기 →</button></div>}
    {isStale && <div className="note warn stack" role="status"><p>장면 설정·참고 이미지·유지할 내용이 바뀌었어요. 이전 코칭 프롬프트는 보관되어 있으니, 현재 조건과 비교한 뒤 다시 적용해 주세요.</p><button className="secondary" onClick={openImporter}>가져온 프롬프트 확인·편집하기 →</button></div>}
    {imageIncomplete ? <section className="card stack"><p>보관된 원본 설명과 변경 내용은 ‘이미지 → 프롬프트’에서 이어갈 수 있어요.</p><button type="button" onClick={onImage}>이미지와 설명 확인하기 →</button></section> : brief.idea.trim() ? <section className="card prompt-document" aria-labelledby="free-prompt-body-title">
      <div className="prompt-document-heading">
        <div className="prompt-document-copy">
          <h2 id="free-prompt-body-title">프롬프트 본문</h2>
          <p className="prompt-output-help" id="free-prompt-use-help">{canUsePrompt ? '복사한 뒤 사용할 AI에 붙여 넣으세요.' : '현재 조건과 비교한 뒤 다시 적용하면 복사할 수 있어요.'}</p>
        </div>
        <button type="button" className="prompt-copy-button" aria-describedby="free-prompt-use-help" disabled={!canUsePrompt} onClick={async () => toast(await copyText(prompt) ? '프롬프트를 복사했어요. 사용할 AI에 붙여 넣고 제작을 요청하세요.' : '복사할 수 없어요. 글을 선택해 복사해 주세요.')}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
          프롬프트 복사
        </button>
      </div>
      <div className="prompt-document-options">
        {accepted ? <div className="tabs prompt-version-tabs" role="group" aria-label="프롬프트 버전">
          <button className={!showingCoached ? 'on' : ''} aria-pressed={!showingCoached} onClick={() => setVersion('original')}>{project.imagePrompt ? '이미지와 변경 조건' : '직접 작성한 내용'}</button>
          <button className={showingCoached ? 'on' : ''} aria-pressed={showingCoached} onClick={() => setVersion('coached')}>코칭으로 다듬은 내용</button>
        </div> : <span className="prompt-source-label">{mode.label} · {project.imagePrompt ? '원본 설명과 변경 조건으로 작성' : '장면 설정으로 작성'}</span>}
        <button className="ghost prompt-save-button" disabled={!canUsePrompt} onClick={() => downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${showingCoached ? 'coached' : 'prompt'}.txt`, prompt)}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>
          TXT 저장
        </button>
      </div>
      <p className="prompt-language-note">{showingCoached ? '가져온 문장을 그대로 보여줘요. 원래 장면 설정도 보관돼 있어요.' : '직접 입력한 표현은 번역하거나 바꾸지 않고 유지해요.'}</p>
      <div ref={output} className="mono free-prompt-output prompt-document-body" role="region" tabIndex={0} aria-label={showingCoached ? '코칭으로 다듬은 프롬프트' : '직접 작성한 프롬프트'}>{prompt}</div>
      <aside className="prompt-use-note" aria-label="제작 도구에서 확인할 사항">
        <span>사용할 때</span>
        <p>비율·길이·해상도는 제작 도구의 설정에서도 확인하세요.{project.references.length > 0 && ' 참고 이미지는 같은 순서로 직접 첨부하세요.'}</p>
      </aside>
      {project.imagePrompt && <button type="button" className="ghost" onClick={onImage}>원본 설명 · 유지할 특징 · 바꿀 부분 수정하기 →</button>}
    </section> : <div className="card stack"><p>만들고 싶은 장면을 적으면 요청문이 완성돼요.</p><button onClick={onEdit}>장면부터 적기 →</button></div>}
    <details className="card prompt-review prompt-secondary" open={!brief.idea.trim()}>
      <summary><span className="prompt-secondary-copy"><span>조건을 확인하거나 더 다듬기</span><small>선택 · {missing.length ? `비워 둔 항목 ${missing.length}개` : '모든 항목에 입력이 있어요'}</small></span></summary>
      <p className="small muted">장면 설정과 저장한 답변의 입력 여부를 확인해요. 결과의 정확성이나 완성도 점수가 아니며, 필요한 항목만 채우면 됩니다.</p>
      <ul>{checks.map(check => <li key={check.id}><span aria-label={check.filled ? '입력 있음' : '비워 둠'}>{check.filled ? '✓' : '○'}</span><div><strong>{check.label}</strong><p className="small muted">{check.hint}</p></div></li>)}</ul>
      <div className="row"><button className="secondary" onClick={onEdit}>장면 설정 보기 →</button><button className="ghost" onClick={onRefine} disabled={!brief.idea.trim()}>질문으로 더 다듬기 →</button></div>
    </details>
    <details className="card prompt-secondary"><summary><span className="prompt-secondary-copy"><span>결과를 받은 뒤</span><small>선택 · 수정 코치</small></span></summary><ol className="small muted"><li>작성한 확인 기준과 실제 결과를 비교해 보세요.</li><li>아쉬운 부분 하나와 원하는 변화를 구체적으로 적어 보세요.</li><li>잘 나온 부분은 수정 코치의 ‘유지할 내용’에 남겨 보세요.</li></ol><p className="small muted">같은 요청도 도구와 실행 조건에 따라 달라질 수 있어요. 한 번에 한 가지를 바꾸면 무엇이 영향을 주었는지 비교하기 쉬워요.</p>{project.locks.length > 0 && <div className="stack"><h3>유지할 내용</h3><ul className="small muted">{project.locks.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}<button type="button" className="secondary" onClick={onRevise}>수정 코치 열기 →</button></details>
  </div>
}
