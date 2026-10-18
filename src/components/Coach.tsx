import { useEffect, useMemo, useRef, useState } from 'react'
import { assembleFix } from '../lib/assemble'
import { uid } from '../lib/db'
import { loadImage } from '../lib/image'
import { useStore } from '../store'
import type { Region, Symptom } from '../types'
import { PromptBox, useToast } from './ui'
import { LocksEditor } from './LocksEditor'

type Step = 'shot' | 'where' | 'problem' | 'change' | 'result'
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'shot', label: '결과 화면' },
  { id: 'where', label: '고칠 대상' },
  { id: 'problem', label: '문제 찾기' },
  { id: 'change', label: '바꿀 내용' },
  { id: 'result', label: '수정 프롬프트' },
]

/**
 * The coach turns "something looks off" into a precise fix request: point at it, pick the
 * category, pick the symptom, say how it differs from the reference. The user never has to
 * find the technical word — the template carries it.
 */
export function Coach({ onSaved }: { onSaved: () => void }) {
  const { project, template, updateProject } = useStore()
  const toast = useToast()
  const [step, setStep] = useState<Step>('shot')
  const [shot, setShot] = useState<string | undefined>()
  const [region, setRegion] = useState<Region | undefined>()
  const [target, setTarget] = useState('')
  const [customTarget, setCustomTarget] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [symptomId, setSymptomId] = useState('')
  const [compareId, setCompareId] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [dictionaryChoice, setDictionaryChoice] = useState(false)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(step)

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    const heading = stepHeading.current
    // The workspace keeps this draft mounted in a hidden tab; never steal its focus.
    if (!heading?.getClientRects().length) return
    heading.focus({ preventScroll: true })
    heading.scrollIntoView({ block: 'start' })
  }, [step])

  // The feel dictionary turns familiar words into more specific symptoms.
  const hits = useMemo(() => {
    const q = query.trim()
    if (!q || !template) return []
    return template.feelDictionary.filter((f) => f.phrase.includes(q) || q.includes(f.phrase) || f.term.includes(q)).slice(0, 6)
  }, [query, template])

  if (!project || !template) return null
  const isFreeScene = template.id === 'free-scene'
  const isVideo = isFreeScene && project.freeform?.mode === 'video'
  const isImage = isFreeScene && project.freeform?.mode === 'image'
  const category = template.diagnosis.find((c) => c.id === categoryId)
  const symptom = category?.symptoms.find((s) => s.id === symptomId)
  const finalTarget = target === '__custom' ? customTarget.trim() : target
  const finalTargetEn = target === '__custom' ? customTarget.trim() : (template.targets.find((t) => t.ko === target)?.en ?? target)
  const draft = { target: finalTarget, targetEn: finalTargetEn, categoryId, symptomId, compareId: compareId || undefined, referenceId: referenceId || undefined, note, region }
  const en = symptom ? assembleFix(template, project, draft, 'en') : ''
  const ko = symptom ? assembleFix(template, project, draft, 'ko') : ''

  const pickSymptom = (sid: string) => {
    const cat = template.diagnosis.find((c) => c.symptoms.some((s) => s.id === sid))
    if (!cat) return
    setCategoryId(cat.id)
    setSymptomId(sid)
    setDictionaryChoice(!finalTarget)
    setStep(finalTarget ? 'change' : 'where')
  }

  const save = () => {
    if (!symptom) return
    updateProject((p) => ({
      ...p,
      iterations: [
        ...p.iterations,
        { id: uid(), createdAt: Date.now(), screenshot: shot, region, target: finalTarget, targetEn: finalTargetEn, categoryId, symptomId, compareId: compareId || undefined, referenceId: referenceId || undefined, note: note.trim() || undefined, promptEn: en, promptKo: ko },
      ],
    }))
    toast('기록에 저장했어요. 결과가 나오면 별점을 남겨 주세요.')
    setStep('shot')
    setShot(undefined)
    setRegion(undefined)
    setTarget('')
    setCustomTarget('')
    setCategoryId('')
    setSymptomId('')
    setCompareId('')
    setReferenceId('')
    setNote('')
    setQuery('')
    setDictionaryChoice(false)
    onSaved()
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="stack revision-coach">
      <ol className="steps" aria-label="수정 프롬프트 만들기 단계">
        {STEPS.map((s, i) => (
          <li key={s.id} className={s.id === step ? 'on' : i < stepIndex ? 'done' : ''} aria-current={s.id === step ? 'step' : undefined}>
            <span className="step-number" aria-hidden="true">{i + 1}</span>
            <span className="step-label">{s.label}</span>
            {i < stepIndex && <span className="sr-only"> · 지난 단계</span>}
          </li>
        ))}
      </ol>

      {step === 'shot' && (
        <section className="card stack">
          <h2 ref={stepHeading} tabIndex={-1} className="revision-step-heading">{isVideo ? '영상의 대표 프레임을 올려 주세요' : isImage ? '결과 이미지를 올려 주세요' : '결과 화면을 올려 주세요'}</h2>
          <p className="small muted">{isVideo ? '고칠 순간을 캡처한 이미지 한 장을 올려 주세요. 움직임은 이 이미지로 알 수 없으니, ‘바꿀 내용’에 시간대와 달라져야 할 동작을 적어 주세요. 이미지 없이도 시작할 수 있어요.' : '이미지를 올리면 고칠 부분을 직접 표시할 수 있어요. 이미지 없이도 시작할 수 있습니다.'}</p>
          <label className="upload">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  setShot(await loadImage(f, 1600))
                  setRegion(undefined)
                  setStep('where')
                } catch (err) {
                  toast((err as Error).message)
                }
                e.target.value = ''
              }}
            />
            <span>{isVideo ? '+ 대표 프레임 이미지 선택' : isImage ? '+ 결과 이미지 선택' : '+ 스크린샷 선택'}</span>
          </label>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('where')}>
              이미지 없이 시작하기
            </button>
          </div>
          <details className="feel-dictionary">
            <summary>무엇이 어색한지 말로 찾고 싶다면</summary>
            <div className="stack">
              <label className="stack">
                <span className="small muted">느낌 사전</span>
                <input type="search" placeholder={isFreeScene ? '예: 복잡해요 / 분위기가 달라요' : '예: 플라스틱 같아요 / 밋밋해요'} value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              {hits.length > 0 && (
                <div className="stack" aria-live="polite">
                  {hits.map((h) => (
                    <div key={h.phrase} className="row" style={{ justifyContent: 'space-between' }}>
                      <span className="small">
                        "{h.phrase}" → <b>{h.term}</b>
                      </span>
                      <div className="row">
                        {h.symptoms.map((sid) => {
                          const s = template.diagnosis.flatMap((c) => c.symptoms).find((x) => x.id === sid)
                          return s ? (
                            <button key={sid} className="secondary" onClick={() => pickSymptom(sid)}>
                              {s.label}
                            </button>
                          ) : null
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {query.trim() && hits.length === 0 && <p className="small muted" role="status">맞는 표현이 없어요. 다른 말로 검색하거나, 이미지 없이 시작해 하나씩 골라 보세요.</p>}
            </div>
          </details>
        </section>
      )}

      {step === 'where' && (
        <section className="card stack">
          <h2 ref={stepHeading} tabIndex={-1} className="revision-step-heading">어디가 어색한가요?</h2>
          {shot ? (
            <>
              <p className="small muted">사진 위에 손가락이나 마우스로 네모를 그려 주세요. 화면 전체가 문제라면 그리지 않고 넘어가도 돼요.</p>
              <RegionPicker src={shot} region={region} onChange={setRegion} />
            </>
          ) : null}
          <p className="small muted" id="coach-target-label">고칠 대상을 하나 골라 주세요.</p>
          <div className="choices question-choices" role="group" aria-labelledby="coach-target-label">
            {template.targets.map((t) => (
              <button key={t.ko} className={`choice ${target === t.ko ? 'on' : ''}`} aria-pressed={target === t.ko} onClick={() => setTarget(t.ko)}>
                {t.ko}
              </button>
            ))}
            <button className={`choice ${target === '__custom' ? 'on' : ''}`} aria-pressed={target === '__custom'} onClick={() => setTarget('__custom')}>
              직접 쓰기
            </button>
          </div>
          {target === '__custom' && (
            <label className="stack">
              <span className="small muted">고칠 대상</span>
              <input type="text" placeholder={isVideo ? '예: 00:03에 등장하는 인물의 손' : isFreeScene ? '예: 화면 오른쪽의 주요 대상' : '예: 왼쪽 위 바위'} value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />
            </label>
          )}
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('shot')}>
              뒤로
            </button>
            <button
              className="primary"
              disabled={!finalTarget}
              onClick={() => {
                setStep(dictionaryChoice ? 'change' : 'problem')
                setDictionaryChoice(false)
              }}
            >
              {dictionaryChoice ? '바꿀 내용 정하기' : '문제 찾기'}
            </button>
          </div>
        </section>
      )}

      {step === 'problem' && (
        <section className="card stack">
          <h2 ref={stepHeading} tabIndex={-1} className="revision-step-heading">무엇이 문제인가요?</h2>
          <p className="small muted">문제 종류를 고른 뒤, 가장 가까운 상태를 하나 선택해 주세요.</p>
          <div className="symptom-list category-grid question-choices" role="group" aria-label="문제 종류">
            {template.diagnosis.map((c) => (
              <button
                key={c.id}
                className={`choice big ${categoryId === c.id ? 'on' : ''}`}
                aria-pressed={categoryId === c.id}
                onClick={() => {
                  if (categoryId === c.id) return
                  setCategoryId(c.id)
                  setSymptomId('')
                }}
              >
                {c.label}
                {c.hint ? <span className="hint">{c.hint}</span> : null}
              </button>
            ))}
          </div>
          {category && (
            <div className="revision-problem-options stack" role="group" aria-labelledby="coach-symptom-label">
              <h3 id="coach-symptom-label">{category.label} — 어떤 상태인가요?</h3>
              <div className="symptom-list question-choices">
                {category.symptoms.map((s) => (
                  <SymptomButton key={s.id} s={s} on={symptomId === s.id} onPick={() => setSymptomId(s.id)} />
                ))}
              </div>
            </div>
          )}
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('where')}>
              뒤로
            </button>
            <button className="primary" disabled={!symptom} onClick={() => setStep('change')}>
              바꿀 내용 정하기
            </button>
          </div>
        </section>
      )}

      {step === 'change' && symptom && (
        <section className="card stack revision-edit-card">
          <div className="question-copy">
            <h2 ref={stepHeading} tabIndex={-1} className="revision-step-heading">어떻게 바꾸고, 무엇을 유지할까요?</h2>
            <p className="question-help revision-context">{finalTarget} · {symptom.label}</p>
          </div>
          <div className="revision-change-grid">
            <section className="revision-change-panel" aria-labelledby="revision-change-title">
              <div className="question-copy">
                <h3 className="question-title" id="revision-change-title"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/></svg>바꿀 내용</h3>
                <p className="question-help">{isVideo ? '이번 수정에서 언제, 어떤 동작으로 바뀌면 좋을지 적어 주세요.' : '이번 수정에서 원하는 모습이나 수치를 적어 주세요.'}</p>
              </div>
              <label className="revision-change-input" htmlFor="revision-wanted-change">
                <span className="question-answer-label">원하는 변화 <span className="small muted">선택</span></span>
                <textarea id="revision-wanted-change" aria-describedby="revision-change-help" value={note} onChange={(e) => setNote(e.target.value)} placeholder={isVideo ? '예: 00:03~00:05에 손이 갑자기 튀어요. 같은 경로를 따라 서서히 올라가게 해 주세요.' : isFreeScene ? '예: 오른쪽 여백을 화면 너비의 1/3 정도로 늘려 주세요.' : '예: 바위 높이를 지금의 절반 정도로 낮춰 주세요.'} />
              </label>
              <p className="question-help" id="revision-change-help">비워 두면 선택한 문제에 맞는 수정 제안을 사용해요.</p>
            </section>
            <LocksEditor />
          </div>
          <details className="revision-comparison">
            <summary>참고 이미지와 비교하기 <span className="small muted">선택{referenceId || compareId ? ' · 비교 조건 있음' : ''}</span></summary>
            <div className="stack">
              <p className="small muted">{isVideo ? '참고 이미지로 비교할 수 있는 구도·색·형태를 고르세요. 움직임이나 타이밍은 위의 ‘바꿀 내용’에 적어 주세요.' : '참고 이미지와 달라진 부분을 수정 요청에 덧붙일 수 있어요.'}</p>
              {project.references.length > 0 ? (
                <>
                  <div className="choices" role="group" aria-label="비교할 참고 이미지">
                    {project.references.map((r, i) => (
                      <button type="button" key={r.id} className={`choice ${referenceId === r.id ? 'on' : ''}`} aria-label={`참고 이미지 ${i + 1}`} aria-pressed={referenceId === r.id} onClick={() => setReferenceId(referenceId === r.id ? '' : r.id)} style={{ padding: 4 }}>
                        <img src={r.dataUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                        <span className="small">#{i + 1}</span>
                      </button>
                    ))}
                  </div>
                  <p className="small muted">참고와 가장 다른 점을 하나 골라 주세요.</p>
                  <div className="choices" role="group" aria-label="참고 이미지와 다른 점">
                    {template.compareAxes.map((a) => (
                      <button type="button" key={a.id} className={`choice ${compareId === a.id ? 'on' : ''}`} aria-pressed={compareId === a.id} onClick={() => setCompareId(compareId === a.id ? '' : a.id)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="small muted">참고 이미지가 없어요. ‘참고 이미지’에서 추가하면 여기서 비교할 수 있어요.</p>
              )}
            </div>
          </details>
          <div className="row step-actions">
            <button className="secondary" onClick={() => setStep('problem')}>
              뒤로
            </button>
            <button className="primary" onClick={() => setStep('result')}>수정 프롬프트 보기</button>
          </div>
        </section>
      )}

      {step === 'result' && symptom && (
        <section className="stack prompt-result-page revision-result">
          <div className="question-copy">
            <h2 ref={stepHeading} tabIndex={-1} className="revision-step-heading">수정 프롬프트 준비 완료</h2>
            <p className="question-help">{finalTarget} · {symptom.label}</p>
          </div>
          <PromptBox en={en} ko={ko} filename={`${project.name}-fix-${project.iterations.length + 1}.txt`} initialLang={isFreeScene ? 'ko' : 'en'} title="완성된 수정 프롬프트" copyLabel="수정 프롬프트 복사" usageHint="복사한 뒤 작업 중인 AI 대화에 붙여 넣으세요." />
          {(shot || project.references.length > 0) && <aside className="prompt-use-note revision-attachment-note" aria-label="이미지 첨부 안내"><span>함께 첨부하기</span><p>{[shot ? isVideo ? '대표 프레임' : '결과 이미지' : '', project.references.length > 0 ? '참고 이미지' : ''].filter(Boolean).join('와 ')} 파일은 복사한 글에 포함되지 않아요. 사용할 AI에 직접 첨부하세요.{isVideo && ' 영상 업로드를 지원하면 원본 영상도 함께 전달하세요.'}</p></aside>}
          <details className="card prompt-secondary revision-result-details">
            <summary><span className="prompt-secondary-copy"><span>수정 조건과 이유 확인하기</span><small>바꿀 내용과 유지할 내용을 다시 확인해요.</small></span></summary>
            <div className="revision-summary-grid">
              <section><h3>바꿀 내용</h3><p>{symptom.fix.ko.replaceAll('{target}', () => finalTarget)}</p>{note.trim() && <p>{note}</p>}</section>
              <section><h3>유지할 내용</h3>{project.locks.length > 0 ? <ul>{project.locks.map((lock, index) => <li key={index}>{lock}</li>)}</ul> : <p className="muted">따로 추가한 유지 조건이 없어요.</p>}</section>
            </div>
            {symptom.why && <div className="revision-reason"><h3>왜 이렇게 바꿀까요?</h3><p>{symptom.why}</p></div>}
          </details>
          <div className="revision-record-actions">
            <button className="ghost" onClick={() => setStep('change')}>← 바꿀 내용·유지할 내용 다시 보기</button>
            <div className="revision-record-save"><p>이 요청문을 수정 기록에 보관해요.</p><button className="secondary" onClick={save}>기록에 저장</button></div>
          </div>
        </section>
      )}
    </div>
  )
}

function SymptomButton({ s, on, onPick }: { s: Symptom; on: boolean; onPick: () => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button className={`choice big ${on ? 'on' : ''}`} aria-pressed={on} onClick={onPick}>
        {s.label}
        {s.hint ? <span className="hint">{s.hint}</span> : null}
      </button>
      {on && s.examples?.length ? (
        <div className="examples">
          {s.examples.map((e, i) => (
            <figure key={i} style={{ margin: 0 }}>
              <img src={`${import.meta.env.BASE_URL}${e.src.replace(/^\//, '')}`} alt={e.caption} />
              <figcaption className="small muted">{e.caption}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Draw a rectangle on the screenshot with mouse or finger; the region is stored normalised 0..1. */
function RegionPicker({ src, region, onChange }: { src: string; region?: Region; onChange: (r: Region | undefined) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const img = useRef<HTMLImageElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [box, setBox] = useState<Region | undefined>(region)
  useEffect(() => {
    setBox(region)
  }, [region])

  // normalise against the image's drawn rectangle (object-fit: contain leaves bars)
  const toImage = (clientX: number, clientY: number) => {
    const el = img.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const ratio = el.naturalWidth / el.naturalHeight
    const boxRatio = r.width / r.height
    let w = r.width
    let h = r.height
    let ox = r.left
    let oy = r.top
    if (ratio > boxRatio) {
      h = r.width / ratio
      oy = r.top + (r.height - h) / 2
    } else {
      w = r.height * ratio
      ox = r.left + (r.width - w) / 2
    }
    return { x: Math.min(1, Math.max(0, (clientX - ox) / w)), y: Math.min(1, Math.max(0, (clientY - oy) / h)), ox: ox - r.left, oy: oy - r.top, w, h }
  }
  const [frame, setFrame] = useState<{ ox: number; oy: number; w: number; h: number } | null>(null)
  const onDown = (e: React.PointerEvent) => {
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    start.current = { x: p.x, y: p.y }
    setFrame({ ox: p.ox, oy: p.oy, w: p.w, h: p.h })
    setBox({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return
    const p = toImage(e.clientX, e.clientY)
    if (!p) return
    setBox({ x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) })
  }
  const onUp = () => {
    if (!start.current) return
    start.current = null
    if (box && box.w > 0.02 && box.h > 0.02) onChange(box)
    else {
      setBox(undefined)
      onChange(undefined)
    }
  }
  const f = frame
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div ref={wrap} className="region-wrap" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <img ref={img} src={src} alt="결과 스크린샷" draggable={false} onLoad={(e) => {
          const p = toImage(0, 0)
          if (p) setFrame({ ox: p.ox, oy: p.oy, w: p.w, h: p.h })
          void e
        }} />
        {box && f ? <div className="region-box" style={{ left: f.ox + box.x * f.w, top: f.oy + box.y * f.h, width: box.w * f.w, height: box.h * f.h }} /> : null}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="small muted">{box && box.w > 0.02 ? '표시했어요. 다시 그리면 바뀌어요.' : '표시 안 함 (화면 전체)'}</span>
        {box ? (
          <button className="ghost" onClick={() => { setBox(undefined); onChange(undefined) }}>
            표시 지우기
          </button>
        ) : null}
      </div>
    </div>
  )
}
