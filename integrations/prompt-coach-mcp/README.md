# Prompt Coach MCP

사용자 본인의 AI 대화에서 이유가 있는 질문에 답하며 2D Image·3D Web·Video 프롬프트를 구체화하는 MCP 서버입니다. 화면 안에서 진행하는 MCP Apps 구현도 포함하지만 실제 호스트 화면 호환성은 확인 중입니다. 코칭 판단은 연결된 AI 호스트가 담당합니다. 이 서버는 모델 API를 호출하거나 대화를 서버 저장소에 보관하지 않습니다.

## 실제 호스트 확인 상태 · 2026-10-15

- 공개 MCP 초기화, 도구 6개, 빈 시작 상태와 UI 리소스 응답을 확인했습니다. 로컬 테스트와 Worker 빌드 검사는 통과했습니다.
- **Claude의 코치 화면은 현재 표시 오류가 재현됩니다.** 전체 앱과 최소 연결 화면 모두 빈 카드 뒤 표시 오류가 발생했습니다. 도구 호출·리소스 응답 성공을 화면 렌더링 성공으로 간주하지 않습니다. 원인은 확정하지 않았습니다.
- Claude 일반 대화에서는 ‘유리구 안 작은 도서관, 3D 웹’ 장면으로 코칭 안내 도구 호출 뒤 **시점 질문 하나·필요한 이유·예시 3개·자유 입력/보류 안내**까지 실제 확인했습니다. 완성 프롬프트까지의 전체 흐름을 확인한 것은 아닙니다.
- **ChatGPT 코치 화면은 아직 검증하지 않았습니다.** 학생별 연결 권한과 기능 지원도 각 계정에서 확인해야 합니다.

매체 선택 순서는 **2D Image → 3D Web → Video**입니다. 2D Image는 3D 제작 전에 참고 이미지를 준비할 때도 사용할 수 있고, 3D Web은 직접 조작할 수 있는 웹 장면을 뜻합니다. 결과물은 사용자가 선택하며 기본값을 대신 고르지 않습니다.

커넥터의 **코칭 시작하기**에는 따로 채울 입력칸이 없습니다. AI가 아직 정하지 않은 결과물 종류를 **① 2D 이미지(한 장의 그림) / ② 3D 웹(돌려보고 클릭하는 장면)**으로 안내합니다. 번호나 한국어로 답한 뒤 평소 채팅 입력칸에 장면을 자유롭게 설명합니다. 이미 종류와 장면을 말했다면 재입력 없이 이어가며, 영상을 명시적으로 원하는 경우에도 기존 영상 코칭을 사용할 수 있습니다. 오래된 Medium/Idea 입력칸이 보이면 연결 목록을 새로 고치고 새 대화를 여세요.

현재 권장 흐름은 연결 후 **“프롬프트 코치로 이 대화에서 코칭 시작해줘”**라고 요청하고 같은 AI 대화에서 질문에 답하는 것입니다. 설치 설정문은 처음 한 번만 사용합니다. 화면을 시험했는데 보이지 않으면 **“화면이 보이지 않으면 이 대화에서 코칭 시작해줘”**라고 요청합니다. 홈페이지로 돌아가 매 질문마다 복사할 필요는 없습니다.


## 소스 관리

작업 원본은 사용자가 지정한 `PromptProject/prompt-coach-mcp` 폴더입니다. 홈페이지 저장소의 `integrations/prompt-coach-mcp`는 같은 소스의 버전 관리용 보관본입니다. 원본에서 변경·검증한 후 보관본을 갱신하세요. 두 위치를 서로 다른 구현으로 운영하지 않습니다.

보관본에는 구현 소스, 잠금 파일, 테스트, 빌드·점검 스크립트만 포함합니다. `node_modules/`, `generated/`, `.wrangler/`, `.tools/`, 환경변수·자격증명, 개인 연결·운영 문서는 포함하지 않습니다. Cloudflare 로그인을 포함한 운영 설정은 각 실행 환경에서 별도로 준비합니다.

## 준비와 검증

Node.js 22 이상이 필요합니다.

```sh
npm ci --ignore-scripts
npm test
npm run worker:check
```

`npm test`와 `worker:check`는 먼저 UI를 빌드합니다. `generated/coach-ui.mjs`는 `ui/` 소스에서 만든 결과이므로 직접 편집하거나 소스에 포함하지 않습니다. 패키지 잠금 파일을 사용하면 동일한 의존성 버전으로 다시 설치할 수 있습니다.

## 실행

```sh
npm start                 # localhost:8808의 Streamable HTTP
npm run stdio             # stdio MCP 서버
npm run build:ui
npm run worker:dev        # 로컬 Workers 개발
npm run ui:preview        # 실제 AI 없는 화면·호스트 연동 시험
```

`start`와 `stdio`는 화면 빌드를 먼저 실행합니다. 직접 `node server.mjs`, `node start-public.mjs`, `worker:dev`, `ui:preview`를 실행할 때는 `npm run build:ui`를 먼저 실행하세요. 화면 미리보기의 질문과 요약은 고정 예시이며 실제 AI 코칭이 아닙니다.

## Workers 배포와 점검

`wrangler.jsonc`를 검토하고, 해당 Worker를 배포할 권한이 있는 계정에서 진행합니다. 새 설치는 본인의 Worker 이름을 사용하세요.

```sh
npx wrangler login
npm run worker:deploy
node check-connection.mjs 'https://YOUR-WORKER.workers.dev/mcp'
```

배포는 별도의 명시적 작업입니다. `worker:deploy`는 UI 빌드 후 배포하며, 점검 스크립트는 공개 MCP 통신·필수 도구·빈 시작 상태·화면 리소스 응답만 확인합니다. 실제 ChatGPT·Claude 계정 등록, 화면 렌더링과 AI 질문·답변은 별도로 시험해야 합니다.

홈페이지와 Worker의 배포는 서로 별개입니다. 주소를 바꾼 경우 홈페이지의 `public/coach-connection.json`과 사용자의 연결 설정을 갱신합니다. 이 패키지는 Git 커밋·푸시나 홈페이지 배포를 자동 수행하지 않습니다.

## 개발용 임시 공개 서버

학생용 운영 주소는 고정 Workers 배포를 사용합니다. 임시 터널은 별도의 개발 복사본에서만 사용하세요.

```sh
npm run build:ui
node start-public.mjs
```

Apple Silicon Mac에서는 `MCP 시작.command`도 사용할 수 있습니다. 이 실행 파일은 필요한 의존성이 없으면 준비한 뒤 화면을 먼저 빌드합니다. 다른 기기는 공식 `cloudflared`를 설치하고 `CLOUDFLARED_PATH`를 지정합니다. 임시 방식은 컴퓨터·인터넷·실행 창을 유지해야 하며 재실행 시 주소가 바뀔 수 있습니다. 임시 실행기가 만드는 연결 문서는 Git에서 제외됩니다.

`PROMPT_COACH_SITE_DIR`를 명시한 경우에만 해당 홈페이지의 `public/coach-connection.json`을 변경합니다. 기존 `public/`이 필요하고 공개 홈페이지에 반영하려면 별도 배포가 필요합니다. 종료 시 현재 설정이 자기 임시 주소인 경우에만 unavailable로 바꾸며, 다른 주소나 hosted 설정은 보존합니다.

```sh
PROMPT_COACH_SITE_DIR='/absolute/path/to/site' node start-public.mjs
PROMPT_COACH_SITE_DIR='/absolute/path/to/site' node update-site-connection.mjs --temporary 'https://VERIFIED-HOST/mcp'
PROMPT_COACH_SITE_DIR='/absolute/path/to/site' node update-site-connection.mjs --unavailable 'https://PREVIOUS-HOST/mcp'
```

## 도구와 메뉴

| 항목 | 역할 |
| --- | --- |
| `open_prompt_coach` | 빈 화면 또는 사용자가 이미 제공한 장면·매체를 담은 화면 열기 |
| `submit_prompt_coach_input` | 화면에서 사용자가 보낸 답변·보류·검토·확정 처리, 앱 전용 |
| `show_prompt_coach` | AI가 다음 질문 또는 검토본 표시, 모델 전용 |
| `get_prompt_coaching_guide` | 매체별 코칭 관점 읽기 |
| `review_prompt_brief` | 제공된 조건의 입력 여부 확인 |
| `assemble_prompt` | 사용자 확인을 받은 최신 조건 조립 |

`coach-scene`는 ‘코칭 시작하기 — 장면 입력·질문·답변’ 시작 메뉴이며 현재는 일반 AI 대화로 코칭을 시작합니다. 이용 안내는 [홈페이지 도움말](https://studio-penumbra.com/prompt-coach/)에서 제공합니다. 안내 문서를 첨부한 뒤 문서 검토로 빠지는 혼동을 막기 위해 `coaching-rules` 리소스는 커넥터에서 제거했습니다. 이전 `prompt-coach://rules` 주소도 더 이상 제공하지 않습니다. 코칭 도구와 화면용 리소스는 유지됩니다. 시험 중인 화면은 사용자가 “프롬프트 코치 화면 열어줘”라고 명시적으로 요청할 때 시도합니다. 화면이 표시되지 않으면 같은 대화로 이어갑니다.

이미 등록한 Claude 연결이 이전 도구만 보이면 커넥터 설정의 ⋯ → ‘도구 목록 새로 고침’을 실행한 뒤 새 대화에서 다시 선택합니다. 기존 대화는 이전 목록을 유지할 수 있습니다. 화면 미지원 호스트에서는 일반 AI 대화로 코칭하며, 화면이 열렸다고 가정하지 않습니다.

## 데이터와 재사용 범위

이용자 본인 AI 계정의 한도·요금과 Cloudflare 서버 운영 비용은 별개입니다. 도구 입력과 상태는 서버를 거쳐 호스트의 도구 결과에 포함됩니다. 서버에 별도 대화 데이터베이스는 없습니다. 홈페이지에 보관한 프로젝트를 자동 전송하거나 동기화하지 않습니다.

MCP Apps는 AI 호스트 안의 화면입니다. 홈페이지가 사용자 계정을 직접 호출하는 권한을 제공하지 않습니다. 승인 후 직접 연동을 구현할 때의 재사용 범위와 경계는 [ARCHITECTURE.md](ARCHITECTURE.md)를 참고하세요.
