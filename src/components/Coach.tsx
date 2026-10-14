import { useEffect, useMemo, useRef, useState } from 'react'
import { assembleFix } from '../lib/assemble'
import { uid } from '../lib/db'
import { loadImage } from '../lib/image'
import { useStore } from '../store'
import type { Region, Symptom } from '../types'
import { PromptBox, useToast } from './ui'

type Step = 'shot' | 'where' | 'what' | 'how' | 'compare' | 'result'
const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'shot', label: '① 결과 화면' },
  { id: 'where', label: '② 어디가' },
  { id: 'what', label: '③ 무엇이' },
  { id: 'how', label: '④ 어떻게' },
  { id: 'compare', label: '⑤ 참고와 비교' },
  { id: 'result', label: '⑥ 수정 프롬프트' },
]

/**
 * The coach turns "something looks off" into a precise fix request: point at it, pick the
 * category, pick the symptom, say how it differs from the reference. The student never has to
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

  if (!project || !template) return null
  const category = template.diagnosis.find((c) => c.id === categoryId)
  const symptom = category?.symptoms.find((s) => s.id === symptomId)
  const finalTarget = target === '__custom' ? customTarget.trim() : target
  const finalTargetEn = target === '__custom' ? customTarget.trim() : (template.targets.find((t) => t.ko === target)?.en ?? target)
  const draft = { target: finalTarget, targetEn: finalTargetEn, categoryId, symptomId, compareId: compareId || undefined, referenceId: referenceId || undefined, note, region }
  const en = symptom ? assembleFix(template, project, draft, 'en') : ''
  const ko = symptom ? assembleFix(template, project, draft, 'ko') : ''

  // the feel dictionary: lay words → symptoms
  const hits = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return template.feelDictionary.filter((f) => f.phrase.includes(q) || q.includes(f.phrase) || f.term.includes(q)).slice(0, 6)
  }, [query, template])

  const pickSymptom = (sid: string) => {
    const cat = template.diagnosis.find((c) => c.symptoms.some((s) => s.id === sid))
    if (!cat) return
    setCategoryId(cat.id)
    setSymptomId(sid)
    setStep('compare')
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
    toast('기록에 저장했어요. 결과가 오면 별점을 남기세요.')
    setStep('shot')
    setShot(undefined)
    setRegion(undefined)
    setTarget('')
    setCategoryId('')
    setSymptomId('')
    setCompareId('')
    setNote('')
    onSaved()
  }

  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="stack">
      <div className="steps" aria-label="진단 단계">
        {STEPS.map((s, i) => (
          <span key={s.id} className={s.id === step ? 'on' : i < stepIndex ? 'done' : ''}>
            {s.label}
          </span>
        ))}
      </div>

      {step === 'shot' && (
        <section className="card stack">
          <h2>결과 화면을 올리세요</h2>
          <p className="small muted">코딩 AI가 만든 결과의 스크린샷(모바일이면 화면 캡처). 없으면 건너뛰어도 되지만, 있으면 "어디가"를 정확히 가리킬 수 있어요.</p>
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
            <span>+ 스크린샷 선택</span>
          </label>
          <div className="card stack" style={{ background: 'var(--pale)' }}>
            <b className="small">말로 먼저 찾기 — "느낌 사전"</b>
            <input type="text" placeholder="예: 플라스틱 같아요 / 밋밋해요 / 가짜 같아요" value={query} onChange={(e) => setQuery(e.target.value)} />
            {hits.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                {hits.map((h) => (
                  <div key={h.phrase} className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="small">
                      "{h.phrase}" → <b>{h.term}</b>
                    </span>
                    <div className="row">
                      {h.symptoms.map((sid) => {
                        const s = template.diagnosis.flatMap((c) => c.symptoms).find((x) => x.id === sid)
                        return s ? (
                          <button key={sid} className="secondary" style={{ minHeight: 34, padding: '4px 10px', fontSize: 13 }} onClick={() => pickSymptom(sid)}>
                            {s.label}
                          </button>
                        ) : null
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="row">
            <button className="secondary" onClick={() => setStep('where')}>
              스크린샷 없이 진행
            </button>
          </div>
        </section>
      )}

      {step === 'where' && (
        <section className="card stack">
          <h2>어디가 어색한가요?</h2>
          {shot ? (
            <>
              <p className="small muted">사진 위에서 손가락이나 마우스로 네모를 그려 표시하세요. 전체가 문제면 그냥 넘어가도 돼요.</p>
              <RegionPicker src={shot} region={region} onChange={setRegion} />
            </>
          ) : null}
          <p className="small muted">그 자리에 있는 것은?</p>
          <div className="choices">
            {template.targets.map((t) => (
              <button key={t.ko} className={`choice ${target === t.ko ? 'on' : ''}`} onClick={() => setTarget(t.ko)}>
                {t.ko}
              </button>
            ))}
            <button className={`choice ${target === '__custom' ? 'on' : ''}`} onClick={() => setTarget('__custom')}>
              직접 쓰기
            </button>
          </div>
          {target === '__custom' && <input type="text" placeholder="예: 왼쪽 위 바위" value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />}
          <div className="row">
            <button className="secondary" onClick={() => setStep('shot')}>
              뒤로
            </button>
            <button disabled={!finalTarget} onClick={() => setStep('what')}>
              다음
            </button>
          </div>
        </section>
      )}

      {step === 'what' && (
        <section className="card stack">
          <h2>무엇이 문제인가요?</h2>
          <p className="small muted">딱 하나만 고르세요. 두 가지가 다 거슬리면 두 번에 나눠서 — 한 번에 하나씩 고쳐야 AI가 다른 걸 망가뜨리지 않아요.</p>
          <div className="symptom-list">
            {template.diagnosis.map((c) => (
              <button
                key={c.id}
                className={`choice big ${categoryId === c.id ? 'on' : ''}`}
                onClick={() => {
                  setCategoryId(c.id)
                  setSymptomId('')
                  setStep('how')
                }}
              >
                {c.label}
                {c.hint ? <span className="hint">{c.hint}</span> : null}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="secondary" onClick={() => setStep('where')}>
              뒤로
            </button>
          </div>
        </section>
      )}

      {step === 'how' && category && (
        <section className="card stack">
          <h2>{category.label} — 어떻게 어색한가요?</h2>
          <div className="symptom-list">
            {category.symptoms.map((s) => (
              <SymptomButton key={s.id} s={s} on={symptomId === s.id} onPick={() => setSymptomId(s.id)} />
            ))}
          </div>
          <div className="row">
            <button className="secondary" onClick={() => setStep('what')}>
              뒤로
            </button>
            <button disabled={!symptomId} onClick={() => setStep('compare')}>
              다음
            </button>
          </div>
        </section>
      )}

      {step === 'compare' && (
        <section className="card stack">
          <h2>참고 이미지와 비교하면?</h2>
          <p className="small muted">건너뛰어도 되지만, "참고 이미지 N처럼"이 붙으면 AI가 훨씬 정확히 잡아요.</p>
          {project.references.length > 0 ? (
            <>
              <div className="choices">
                {project.references.map((r, i) => (
                  <button key={r.id} className={`choice ${referenceId === r.id ? 'on' : ''}`} onClick={() => setReferenceId(referenceId === r.id ? '' : r.id)} style={{ padding: 4 }}>
                    <img src={r.dataUrl} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                    <span className="small">#{i + 1}</span>
                  </button>
                ))}
              </div>
              <p className="small muted">가장 다른 점 하나:</p>
              <div className="choices">
                {template.compareAxes.map((a) => (
                  <button key={a.id} className={`choice ${compareId === a.id ? 'on' : ''}`} onClick={() => setCompareId(compareId === a.id ? '' : a.id)}>
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="small muted">참고 이미지가 없어요. "참고" 탭에서 추가하면 여기서 비교할 수 있어요.</p>
          )}
          <label className="stack" style={{ gap: 6 }}>
            <span className="small muted">덧붙일 말 (선택) — 구체적인 수치나 예시가 있으면 적으세요</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 바위 높이는 지금의 절반 정도면 좋겠어" />
          </label>
          <div className="row">
            <button className="secondary" onClick={() => setStep('how')}>
              뒤로
            </button>
            <button onClick={() => setStep('result')}>프롬프트 만들기</button>
          </div>
        </section>
      )}

      {step === 'result' && symptom && (
        <section className="stack">
          <div className="note">
            학생의 말 "{finalTarget} 어색해요" 가 아래 문장이 됐어요. 핵심은 <b>위치 · 증상 · 원하는 상태 · 바꾸지 말 것 · 확인 방법</b> 다섯 가지가 다 들어 있다는 점이에요.
          </div>
          {symptom.why ? (
            <div className="why">
              <b>왜 이런 일이 생기나</b> — {symptom.why}
            </div>
          ) : null}
          <PromptBox en={en} ko={ko} filename={`${project.name}-fix-${project.iterations.length + 1}.txt`} />
          <div className="row">
            <button className="secondary" onClick={() => setStep('compare')}>
              뒤로
            </button>
            <button onClick={save}>기록에 저장하고 다음 반복으로</button>
          </div>
        </section>
      )}
    </div>
  )
}

function SymptomButton({ s, on, onPick }: { s: Symptom; on: boolean; onPick: () => void }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      <button className={`choice big ${on ? 'on' : ''}`} onClick={onPick}>
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
        <span className="small muted">{box && box.w > 0.02 ? '표시했어요. 다시 그리면 바뀝니다.' : '아직 표시 안 함 (전체)'}</span>
        {box ? (
          <button className="ghost" onClick={() => { setBox(undefined); onChange(undefined) }}>
            표시 지우기
          </button>
        ) : null}
      </div>
    </div>
  )
}
