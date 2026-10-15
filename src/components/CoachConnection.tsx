import { useEffect, useId, useRef, useState } from 'react'
import { buildMcpSetup, loadCoachConnection, type CoachConnectionConfig } from '../lib/mcp-connection'
import { copyText, useToast } from './ui'
import '../coach-connection.css'

const UNAVAILABLE: CoachConnectionConfig = { endpoint: null, availability: 'unavailable', updatedAt: null }

export function CoachConnection({ collapsed = false, hasScene = false }: { collapsed?: boolean; hasScene?: boolean }) {
  const id = useId()
  const toast = useToast()
  const [open, setOpen] = useState(!collapsed)
  const [provider, setProvider] = useState<'claude' | 'chatgpt'>('claude')
  const [config, setConfig] = useState<CoachConnectionConfig>(UNAVAILABLE)
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [copying, setCopying] = useState<'address' | 'setup' | null>(null)
  const address = useRef<HTMLInputElement>(null)
  const setupBox = useRef<HTMLTextAreaElement>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    loadCoachConnection().then((next) => {
      if (alive.current) setConfig(next)
    }).catch(() => {
      if (alive.current) setConfig(UNAVAILABLE)
    }).finally(() => {
      if (alive.current) setLoading(false)
    })
    return () => { alive.current = false }
  }, [])

  const endpoint = config.availability === 'unavailable' ? null : config.endpoint
  const setupText = endpoint ? buildMcpSetup(endpoint) : ''
  const copy = async (kind: 'address' | 'setup') => {
    if (!endpoint || copying) return
    setCopying(kind)
    let copied = false
    try { copied = await copyText(kind === 'address' ? endpoint : setupText) } catch { /* Select the text below instead. */ }
    if (!alive.current) return
    setCopying(null)
    if (copied) {
      toast(kind === 'address' ? '연결 주소를 복사했어요. 선택한 AI의 서버 주소에 붙여 넣어 주세요.' : '연결 설정문을 복사했어요. Claude Code나 Codex 대화에 붙여 넣어 주세요.')
    } else {
      if (kind === 'setup') setSetupOpen(true)
      toast('자동 복사가 안 됐어요. 선택된 글을 직접 복사해 주세요.')
      requestAnimationFrame(() => {
        const field = kind === 'address' ? address.current : setupBox.current
        field?.focus()
        field?.select()
      })
    }
  }

  return (
    <details className="card coach-connection" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary><span className="coach-connection-heading"><span>내 AI에 프롬프트 코치 연결하기</span><span className="small muted">처음 한 번 연결 · 내 계정으로 질문·답변</span></span></summary>
      <div className="stack coach-connection-body">
        <p className="muted">내 ChatGPT나 Claude에 프롬프트 코치를 연결하고 같은 AI 대화에서 질문에 답하세요. 장면을 구체화하며 각 조건이 왜 필요한지 배울 수 있어요.</p>
        <div className="note stack" role="status"><p><b>코치 화면 · 호환 확인 중</b></p><p className="small">현재 Claude에서 화면 표시 오류가 확인됐어요. ChatGPT 화면은 아직 검증하지 못했습니다. 지금은 일반 AI 대화로 코칭을 이어가세요.</p></div>
        <div className="coach-connection-providers" role="group" aria-label="연결할 AI">
          <button type="button" className={provider === 'claude' ? 'on' : ''} aria-pressed={provider === 'claude'} onClick={() => setProvider('claude')}>Claude</button>
          <button type="button" className={provider === 'chatgpt' ? 'on' : ''} aria-pressed={provider === 'chatgpt'} onClick={() => setProvider('chatgpt')}>ChatGPT</button>
        </div>

        <div className="coach-connection-address">
          {endpoint ? <label htmlFor={`${id}-endpoint`}>프롬프트 코치 서버 주소</label> : <p className="coach-connection-address-label">프롬프트 코치 서버 주소</p>}
          {endpoint ? <>
            <div className="coach-connection-copy-row"><input ref={address} id={`${id}-endpoint`} type="text" readOnly value={endpoint} spellCheck={false} autoComplete="off" aria-describedby={`${id}-availability`} onFocus={(event) => event.currentTarget.select()} /><button type="button" className="secondary" onClick={() => copy('address')} disabled={copying !== null}>{copying === 'address' ? '복사 중…' : '주소 복사'}</button></div>
            <p className="small muted" id={`${id}-availability`}>{config.availability === 'temporary' ? '임시 연결 주소예요. 운영 중인 Mac과 서버가 켜져 있어야 하며, 다시 시작하면 주소가 바뀔 수 있어요.' : '연결 주소가 등록되어 있어요.'} 이 화면에서 서버 가동 여부나 내 계정의 연결 상태를 확인하지는 않아요.</p>
          </> : <p className="small muted" id={`${id}-availability`} role="status">{loading ? '연결 주소를 불러오는 중이에요…' : '지금은 공유 연결 주소를 제공할 수 없어요. 코칭 요청문을 내 AI에 붙여 넣으면 연결 없이도 대화를 이어갈 수 있어요.'}</p>}
        </div>

        <ol className="coach-connection-steps" aria-label={`${provider === 'claude' ? 'Claude' : 'ChatGPT'} 연결 순서`}>
          <li><strong>내 계정으로 로그인하기</strong><p>{provider === 'claude' ? 'Claude의 커넥터 설정을 열어요.' : 'ChatGPT의 플러그인 페이지를 열어요.'}</p><a href={provider === 'claude' ? 'https://claude.ai/customize/connectors' : 'https://chatgpt.com/plugins'} target="_blank" rel="noopener noreferrer" className="coach-connection-link" aria-label={`${provider === 'claude' ? 'Claude 커넥터' : 'ChatGPT 플러그인'} 열기 (새 탭)`}>{provider === 'claude' ? 'Claude 커넥터 열기' : 'ChatGPT 플러그인 열기'} <span aria-hidden="true">↗</span></a></li>
          <li><strong>프롬프트 코치 추가하기</strong><p>{provider === 'claude' ? '추가(+) → 사용자 지정 커넥터 추가를 눌러요. 이름은 “Prompt Coach”, 서버 URL은 복사한 주소로 입력하세요. “No sign in”을 선택한 뒤 추가하세요.' : '추가(+) → 사용자 지정 MCP 서버 추가를 눌러요. 이름은 “Prompt Coach”, 서버 URL은 복사한 주소로 입력하고, 인증은 “No authentication”을 선택하세요. 플러그인으로 만든 뒤 설치하세요.'}</p><p>프롬프트 코치용 계정이나 API 키는 필요 없어요.</p></li>
          <li><strong>대화에서 도구 켜기</strong><p>{provider === 'claude' ? '대화의 커넥터 목록에서 Prompt Coach를 켜세요.' : '새 대화에서 @로 Prompt Coach를 선택하세요.'} 도구 실행 허용이 표시되면 내용을 확인해 주세요.</p></li>
          <li><strong>AI 대화에서 시작하기</strong><p><b>“프롬프트 코치로 이 대화에서 코칭 시작해줘”</b>라고 말하고 만들 결과물과 장면을 설명하세요. 질문의 이유를 읽으며 답하면 됩니다.</p><a className="coach-connection-link" href={provider === 'claude' ? 'https://claude.ai/' : 'https://chatgpt.com/'} target="_blank" rel="noopener noreferrer" aria-label={`${provider === 'claude' ? 'Claude' : 'ChatGPT'} 대화 열기 (새 탭)`}>{provider === 'claude' ? 'Claude' : 'ChatGPT'} 대화 열기 <span aria-hidden="true">↗</span></a></li>
        </ol>
        {provider === 'claude' && <p className="small muted">전에 연결했다면 커넥터 설정의 ⋯ → ‘도구 목록 새로 고침’을 누른 뒤 새 대화에서 Prompt Coach를 켜 주세요. 기존 대화에는 예전 도구 목록이 남아 있을 수 있어요.</p>}
        <div className="coach-connection-menu-guide">
          <h3>연결 메뉴의 두 항목</h3>
          <dl>
            <div><dt>코칭 시작하기 — 장면 입력·질문·답변</dt><dd>AI 대화에서 코칭을 시작하는 메뉴예요. “프롬프트 코치 화면 열어줘”라고 요청하면 시험 중인 화면을 시도합니다. 보이지 않으면 “화면이 보이지 않으면 이 대화에서 코칭 시작해줘”라고 말하세요.</dd></div>
            <div><dt>사용 방법 보기 — 코치 이용 안내</dt><dd>설명을 읽는 메뉴예요. 이것만 열면 코칭은 시작되지 않아요.</dd></div>
          </dl>
        </div>
        <p className="small muted coach-connection-account-note">본인 AI 계정의 이용 한도가 적용돼요. 계정·조직에 따라 연결 메뉴나 MCP 화면을 지원하지 않을 수 있어요. 화면이 열리지 않는 환경에서는 일반 AI 대화로 질문·답변을 이어갈 수 있습니다.</p>
        {hasScene && <p className="small muted">이미 웹에 작성한 장면을 쓰고 싶다면 아래의 선택 항목에서 가져갈 수 있어요. 웹 내용은 자동 전송되지 않습니다.</p>}

        <details className="coach-connection-desktop" open={setupOpen} onToggle={(event) => setSetupOpen(event.currentTarget.open)}>
          <summary>Claude Code · Codex에서 자동 연결하기</summary>
          <div className="stack">
            <p className="small muted">아래 설정문을 이미 사용 중인 앱에 처음 한 번 붙여 넣으면 연결을 진행하고 일반 대화로 코칭을 시작해요. 이후 질문마다 설정문을 복사할 필요는 없습니다. 브라우저용 ChatGPT·Claude에서는 위 순서를 따라 주세요.</p>
            <div><button type="button" className="secondary" disabled={!endpoint || copying !== null} onClick={() => copy('setup')}>{copying === 'setup' ? '복사 중…' : '연결 설정문 복사'}</button></div>
            {endpoint && <label className="stack" htmlFor={`${id}-setup`}><span className="small muted">복사할 연결 설정문</span><textarea id={`${id}-setup`} ref={setupBox} readOnly value={setupText} rows={6} /></label>}
          </div>
        </details>
        <p className="small muted coach-connection-privacy">코치 화면은 AI 서비스 내부 연결을 시험 중입니다. 이 홈페이지 안의 직접 AI 대화는 승인 후 연결을 준비 중입니다. 홈페이지에 보관한 프로젝트는 자동 전송·동기화되지 않아요.</p>
      </div>
    </details>
  )
}
