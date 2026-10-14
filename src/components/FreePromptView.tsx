import { useState } from 'react'
import { assembleFreePrompt, createFreeBrief, reviewFreeBrief } from '../lib/free-prompt'
import { useStore } from '../store'
import { copyText, downloadText, useToast } from './ui'
import { FREE_MODES } from '../lib/free-modes'

export function FreePromptView({ onEdit }: { onEdit: () => void }) {
  const { project, updateProject } = useStore()
  const [lock, setLock] = useState('')
  const toast = useToast()
  if (!project) return null
  const brief = project.freeform ?? createFreeBrief()
  const prompt = assembleFreePrompt(brief, project.references, project.locks)
  const checks = reviewFreeBrief(brief)
  const missing = checks.filter(check => !check.filled)
  const mode = FREE_MODES.find(m => m.id === brief.mode)!
  return <div className="stack">
    <div className="note"><b>{mode.label}용 요청문</b> · 입력한 내용을 항목별로 정리했어요. 실제 제작은 사용하는 AI 도구에 붙여 넣어 이어가세요.</div>
    <details className="card prompt-review" open={!brief.idea.trim()}>
      <summary>보내기 전, 조건 확인 <span className="small muted">{missing.length ? `비워 둔 항목 ${missing.length}개` : '모든 항목에 입력이 있어요'}</span></summary>
      <p className="small muted">입력 여부를 확인하는 목록이에요. 문장의 정확성이나 조건의 충돌은 직접 살펴보세요. 필요한 항목만 채우면 됩니다.</p>
      <ul>{checks.map(check => <li key={check.id}><span aria-label={check.filled ? '입력 있음' : '비워 둠'}>{check.filled ? '✓' : '○'}</span><div><strong>{check.label}</strong><p className="small muted">{check.hint}</p></div></li>)}</ul>
      <button className="secondary" onClick={onEdit}>조건 보완하기 →</button>
    </details>
    {brief.idea.trim() ? <>
      <div className="row prompt-toolbar"><p className="small muted">내가 쓴 표현은 번역하거나 바꾸지 않고 유지해요.</p><div className="row prompt-actions"><button onClick={async () => toast(await copyText(prompt) ? '프롬프트를 복사했어요.' : '복사할 수 없어요. 글을 선택해 복사해 주세요.')}>프롬프트 복사</button><button className="secondary" onClick={() => downloadText(`${project.name.replace(/[\\/:*?"<>|]/g, '_')}-prompt.txt`, prompt)}>TXT 저장</button></div></div>
      <div className="card mono free-prompt-output" tabIndex={0} aria-label="생성된 프롬프트">{prompt}</div>
      <p className="small muted">비율·길이·해상도는 사용하는 도구의 설정에서도 확인하세요. 참고 이미지는 같은 순서로 직접 첨부해야 해요.</p>
    </> : <div className="card stack"><p>만들고 싶은 장면을 적으면 요청문이 완성돼요.</p><button onClick={onEdit}>장면부터 적기 →</button></div>}
    <details className="card"><summary>결과를 받은 다음에는</summary><ol className="small muted"><li>작성한 확인 기준과 실제 결과를 비교해 보세요.</li><li>아쉬운 부분 하나와 원하는 변화를 구체적으로 적어 보세요.</li><li>잘 나온 부분은 아래에 남겨 다음 수정에서 유지하세요.</li></ol><p className="small muted">같은 요청도 도구와 실행 조건에 따라 달라질 수 있어요. 한 번에 한 가지를 바꾸면 무엇이 영향을 주었는지 비교하기 쉬워요.</p></details>
    <section className="card stack"><h2>유지할 내용</h2><p className="small muted">결과를 본 뒤 적으세요. 여기 적은 조건은 이후 요청에도 함께 들어갑니다.</p>{project.locks.map((item,i)=><div className="row" key={i}><span className="grow">{item}</span><button className="ghost" aria-label={`${item} 잠금 해제`} onClick={()=>updateProject(p=>({...p,locks:p.locks.filter((_,index)=>index!==i)}))}>해제</button></div>)}<form className="row" onSubmit={e=>{e.preventDefault();if(!lock.trim())return;updateProject(p=>({...p,locks:[...p.locks,lock.trim()]}));setLock('')}}><label className="grow"><span className="sr-only">유지할 내용</span><input type="text" value={lock} onChange={e=>setLock(e.target.value)} placeholder="예: 고양이의 표정과 우산 색" /></label><button className="secondary" disabled={!lock.trim()}>유지하기</button></form></section>
  </div>
}
