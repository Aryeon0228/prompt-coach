import { historyStats } from '../lib/assemble'
import { useStore } from '../store'
import { PromptBox } from './ui'

/** Saved requests first; assessment follows after a revised result is available. */
export function History({ onCreate }: { onCreate: () => void }) {
  const { project, template, updateProject } = useStore()
  if (!project || !template) return null
  const stats = historyStats(template, project)
  const records = project.iterations.map((it, index) => ({ it, n: index + 1 })).sort((a, b) => b.it.createdAt - a.it.createdAt)
  const label = (cid: string, sid: string) => {
    const c = template.diagnosis.find((x) => x.id === cid)
    return { cat: c?.label ?? cid, sym: c?.symptoms.find((s) => s.id === sid)?.label ?? sid }
  }

  return (
    <div className="stack history-page">
      {records.length === 0 && (
        <section className="card stack history-empty">
          <h2>아직 저장한 수정 요청이 없어요</h2>
          <p className="small muted">수정 코치에서 바꿀 부분을 정하고 요청문을 저장하면 여기에 모여요.</p>
          <div className="row"><button type="button" onClick={onCreate}>수정 요청 만들기</button></div>
        </section>
      )}

      {records.map(({ it, n }) => {
        const l = label(it.categoryId, it.symptomId)
        const resolution = it.resolved === true ? '해결됨' : it.resolved === false ? '미해결' : '확인 전'
        const evaluation = it.rating === undefined && it.resolved === undefined ? '아직 평가하지 않았어요' : `${it.rating === undefined ? '만족도 미평가' : `만족도 ${it.rating}/5`} · ${resolution}`
        return (
          <section className="card stack history-record" key={it.id}>
            <header className="history-record-heading">
              <h2 className="history-record-title"><span>#{n}</span> {it.target}</h2>
              <span className="history-record-date">{new Date(it.createdAt).toLocaleString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 저장</span>
            </header>
            <section className="history-change" aria-label={`${n}번 요청한 변경`}>
              <div className="history-section-heading">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/></svg>
                <h3>요청한 변경</h3>
              </div>
              <div className={`history-change-content${it.screenshot ? ' has-image' : ''}`}>
                {it.screenshot && <figure className="history-before">
                  <img src={it.screenshot} alt={`${it.target} 수정 전 화면`} />
                  <figcaption>수정 전 화면</figcaption>
                </figure>}
                <div className="history-change-copy">
                  <p className="history-category">{l.cat}</p>
                  <dl className="history-change-facts">
                    <div><dt>고칠 문제</dt><dd>{l.sym}</dd></div>
                    <div><dt>원하는 변화</dt><dd className="history-wanted-change">{it.note?.trim() ? it.note : <span className="muted">선택한 문제에 맞는 수정 제안을 사용했어요. 구체적인 요청은 아래 프롬프트에서 확인하세요.</span>}</dd></div>
                  </dl>
                </div>
              </div>
            </section>
            <details className="history-request">
              <summary>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8M8 17h5"/></svg>
                <span className="history-disclosure-copy"><span>저장된 수정 프롬프트</span><small>당시 저장한 본문을 펼쳐서 확인하고 복사해요.</small></span>
              </summary>
              <PromptBox en={it.promptEn} ko={it.promptKo} filename={`${project.name}-fix-${n}.txt`} initialLang={template.id === 'free-scene' ? 'ko' : 'en'} copyLabel="수정 프롬프트 복사" usageHint="복사한 뒤 작업 중인 AI 대화에 붙여 넣으세요." />
            </details>
            <details className="history-evaluation">
              <summary>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>
                <span className="history-disclosure-copy"><span>결과 평가</span><small>{evaluation}</small></span>
              </summary>
              <div className="history-assessment">
                <p className="history-help">수정 결과를 받은 뒤 평가해 주세요. 선택한 내용은 자동으로 저장돼요.</p>
                <div className="history-assessment-grid">
                  <fieldset className="history-rating">
                    <legend>만족도</legend>
                    <p className="history-help">1점 아쉬워요 · 5점 만족해요</p>
                    <div className="stars" role="group" aria-label={`${n}번 수정 결과 만족도`}>
                    {[1, 2, 3, 4, 5].map((k) => (
                      <button type="button" key={k} aria-pressed={it.rating === k} className={(it.rating ?? 0) >= k ? 'on' : ''} aria-label={`${k}점`} onClick={() => updateProject((p) => ({ ...p, iterations: p.iterations.map((x) => (x.id === it.id ? { ...x, rating: k } : x)) }))}>★</button>
                    ))}
                    </div>
                    <p className="history-rating-value">{it.rating === undefined ? '아직 선택하지 않았어요' : `${it.rating} / 5점`}</p>
                  </fieldset>
                  <fieldset className="history-resolution">
                    <legend>해결 여부</legend>
                    <p className="history-help">고치려던 문제가 해결됐나요?</p>
                    <div className="history-resolution-options" role="group" aria-label={`${n}번 수정 해결 여부`}>
                      {([{ label: '확인 전', value: undefined }, { label: '해결됨', value: true }, { label: '미해결', value: false }] as const).map(option => <button type="button" key={option.label} className={`choice ${it.resolved === option.value ? 'on' : ''}`} aria-pressed={it.resolved === option.value} onClick={() => updateProject(p => ({ ...p, iterations: p.iterations.map(x => x.id === it.id ? { ...x, resolved: option.value } : x) }))}>{option.label}</button>)}
                    </div>
                  </fieldset>
                </div>
              </div>
            </details>
            <div className="row history-record-actions">
              <button type="button" className="ghost" aria-label={`${n}번 수정 기록 삭제`} onClick={() => {
                if (confirm(`"${it.target}" 수정 기록을 지울까요?`)) updateProject((p) => ({ ...p, iterations: p.iterations.filter((x) => x.id !== it.id) }))
              }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>기록 삭제</button>
            </div>
          </section>
        )
      })}

      {stats.total > 0 && (
        <details className="card history-stats">
          <summary>자주 수정한 부분 <span className="small muted">수정 요청 {stats.total}회 · 해결 {stats.resolved}회</span></summary>
          <div className="stack">
            {stats.categories.map((c) => (
              <div key={c.label}>
                <div className="row small" style={{ justifyContent: 'space-between' }}><span>{c.label}</span><span className="muted">{c.n}</span></div>
                <div className="bar"><i style={{ width: `${(100 * c.n) / stats.total}%` }} /></div>
              </div>
            ))}
            {stats.symptoms.length > 0 && <p className="small muted">자주 나온 증상: {stats.symptoms.map((s) => `${s.label}(${s.n})`).join(', ')}. 반복되는 부분은 장면 조건이나 참고 이미지를 보완해 보세요.</p>}
          </div>
        </details>
      )}
    </div>
  )
}
