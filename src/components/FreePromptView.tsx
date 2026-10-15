import { useRef, useState } from 'react'
import { assembleFreePrompt, reviewFreeBrief } from '../lib/free-prompt'
import { coachingContext } from '../lib/coaching-context'
import { useStore } from '../store'
import { copyText, downloadText, useToast } from './ui'
import { FREE_MODES } from '../lib/free-modes'
import { ImportedPromptEditor } from './ImportedPromptEditor'

export function FreePromptView({ onEdit, onRefine, onRevise }: { onEdit: () => void; onRefine: () => void; onRevise: () => void }) {
  const { project } = useStore()
  const output = useRef<HTMLDivElement>(null)
  const [editorOpen, setEditorOpen] = useState(() => Boolean(project?.promptCoaching?.draft.trim() && project.promptCoaching.draft !== project.promptCoaching.accepted?.text))
  const { brief, source, sessionStale, answerCount } = coachingContext(project ?? { references: [], locks: [] })
  const accepted = project?.promptCoaching?.accepted
  const isStale = Boolean(accepted && accepted.source !== source)
  const [version, setVersion] = useState<'original' | 'coached'>(() => accepted && !isStale ? 'coached' : 'original')
  const toast = useToast()
  if (!project) return null
  const original = assembleFreePrompt(brief, project.references, project.locks)
  const showingCoached = version === 'coached' && Boolean(accepted)
  const prompt = showingCoached ? accepted!.text : original
  const canUsePrompt = Boolean(prompt.trim() && brief.idea.trim() && !(showingCoached && isStale))
  const checks = reviewFreeBrief(brief)
  const missing = checks.filter(check => !check.filled)
  const mode = FREE_MODES.find(m => m.id === brief.mode)!

  return <div className="stack">
    <div className="note"><b>{mode.label}용 요청문</b> · {showingCoached ? '내 AI에서 다듬고 직접 가져온 프롬프트예요. 정한 조건과 맞는지 읽어 보세요.' : answerCount ? `장면 설정과 질문에 저장한 답변 ${answerCount}개를 함께 정리했어요. AI가 다시 쓴 문장은 아니에요.` : '장면 설정에 쓴 내용을 항목별로 정리했어요. 사용하는 AI 도구에 붙여 넣어 제작을 이어가세요.'}</div>
    {sessionStale && <div className="note warn stack" role="status"><p>장면이 바뀌어 이전 질문 답변은 제외했어요. 원래 답변은 보관되어 있습니다.</p><button className="secondary" onClick={onRefine}>질문 답변 확인하기 →</button></div>}
    {accepted ? <>
      <div className="tabs prompt-version-tabs" role="group" aria-label="프롬프트 버전">
        <button className={!showingCoached ? 'on' : ''} aria-pressed={!showingCoached} onClick={() => setVersion('original')}>직접 작성한 내용</button>
        <button className={showingCoached ? 'on' : ''} aria-pressed={showingCoached} onClick={() => setVersion('coached')}>코칭으로 다듬은 내용</button>
      </div>
      {isStale && <div className="note warn stack" role="status"><p>장면 설정·참고 이미지·유지할 내용이 바뀌었어요. 이전 코칭 프롬프트는 보관되어 있으니, 현재 조건과 비교한 뒤 다시 적용해 주세요.</p><button className="secondary" onClick={() => setEditorOpen(true)}>가져온 프롬프트 확인·편집하기 →</button></div>}
    </> : <div className="row"><p className="small muted grow">본인 ChatGPT나 Claude에서 부족한 부분을 함께 짚거나, 사이트의 준비된 질문으로 조건을 더해 보세요.</p><button className="secondary" onClick={onRefine} disabled={!brief.idea.trim()}>질문으로 구체화하기 →</button></div>}
    <details className="card prompt-review" open={!brief.idea.trim()}>
      <summary>{showingCoached ? '처음 작성한 조건 확인' : '보내기 전, 조건 확인'} <span className="small muted">{missing.length ? `비워 둔 항목 ${missing.length}개` : '모든 항목에 입력이 있어요'}</span></summary>
      <p className="small muted">장면 설정과 저장한 답변의 입력 여부를 확인해요. 코칭 결과의 정확성이나 완성도 점수가 아니며, 필요한 항목만 채우면 됩니다.</p>
      <ul>{checks.map(check => <li key={check.id}><span aria-label={check.filled ? '입력 있음' : '비워 둠'}>{check.filled ? '✓' : '○'}</span><div><strong>{check.label}</strong><p className="small muted">{check.hint}</p></div></li>)}</ul>
      <button className="secondary" onClick={onEdit}>장면 설정 보기 →</button>
    </details>
    {brief.idea.trim() ? <>
      <div className="row prompt-toolbar"><p className="small muted">{showingCoached ? '가져온 문장을 그대로 보여줘요. 원래 장면 설정도 보관돼 있어요.' : '내가 쓴 표현은 번역하거나 바꾸지 않고 유지해요.'}</p><div className="row prompt-actions"><button disabled={!canUsePrompt} onClick={async () => toast(await copyText(prompt) ? '프롬프트를 복사했어요.' : '복사할 수 없어요. 글을 선택해 복사해 주세요.')}>프롬프트 복사</button><button className="secondary" disabled={!canUsePrompt} onClick={() => downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}-${showingCoached ? 'coached' : 'prompt'}.txt`, prompt)}>TXT 저장</button></div></div>
      <div ref={output} className="card mono free-prompt-output" tabIndex={0} aria-label={showingCoached ? '코칭으로 다듬은 프롬프트' : '직접 작성한 프롬프트'}>{prompt}</div>
      <p className="small muted">비율·길이·해상도는 사용하는 도구의 설정에서도 확인하세요. 참고 이미지는 같은 순서로 직접 첨부해야 해요.</p>
    </> : <div className="card stack"><p>만들고 싶은 장면을 적으면 요청문이 완성돼요.</p><button onClick={onEdit}>장면부터 적기 →</button></div>}
    <ImportedPromptEditor open={editorOpen} onOpenChange={setEditorOpen} onEdit={onEdit} onApplied={() => {
      setVersion('coached')
      setEditorOpen(false)
      requestAnimationFrame(() => output.current?.focus())
    }} />
    <details className="card"><summary>결과를 받은 다음에는</summary><ol className="small muted"><li>작성한 확인 기준과 실제 결과를 비교해 보세요.</li><li>아쉬운 부분 하나와 원하는 변화를 구체적으로 적어 보세요.</li><li>잘 나온 부분은 수정 코치의 ‘유지할 내용’에 남겨 보세요.</li></ol><p className="small muted">같은 요청도 도구와 실행 조건에 따라 달라질 수 있어요. 한 번에 한 가지를 바꾸면 무엇이 영향을 주었는지 비교하기 쉬워요.</p><button type="button" className="secondary" onClick={onRevise}>수정 코치 열기 →</button></details>
    {project.locks.length > 0 && <section className="card stack"><div className="row"><h2 className="grow">유지할 내용</h2><button type="button" className="ghost" onClick={onRevise}>수정 코치에서 변경 →</button></div><ul className="small muted">{project.locks.map((item, index) => <li key={index}>{item}</li>)}</ul></section>}
  </div>
}
