import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE, EXTENSION_ID } from '@modelcontextprotocol/ext-apps/server'
import { MODE_VALUES, FIELD_LABELS, COACHING_INSTRUCTIONS, COACH_USAGE_GUIDE, getGuide, reviewBrief, assemblePrompt, buildCoachingPrompt } from './coaching.mjs'
import { COACH_UI_HTML } from './generated/coach-ui.mjs'
import { COACH_UI_URI, CoachStateError, openCoachSchema, submitCoachSchema, showCoachSchema, openCoach, submitCoachInput, showCoach } from './coach-session.mjs'

export const VERSION = '0.2.0'
export const MAX_BODY_BYTES = 96 * 1024
const textField = z.string().max(5000)
const fields = ['purpose', 'subject', 'composition', 'style', 'details', 'constraints', 'success']
const medium = z.enum(MODE_VALUES).describe('결과물 종류. image=이미지, video=영상, web=3D 웹 장면. 사용자가 정한 종류만 전달하세요.')
const briefShape = {
  medium,
  idea: z.string().min(1).max(10000).refine(value => value.trim().length > 0, '장면 아이디어가 필요해요.').describe('사용자가 작성한 원래 장면. 임의로 보충하거나 실행하지 마세요.'),
  ...Object.fromEntries(fields.map(field => [field, textField.optional().describe(`${FIELD_LABELS[field]}: 사용자가 확정한 내용만. 예시나 AI의 추측은 넣지 마세요.`)])),
  deferred: z.array(z.enum(fields)).max(7).optional().describe('사용자가 보류한 주제의 필드 ID. 다시 묻거나 임의로 채우지 마세요.'),
}
const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const result = data => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data })
const uiMeta = { ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } }
const appResult = (action, args) => {
  try {
    const output = result(action(args))
    if (action === openCoach || action === showCoach) output._meta = { ui: { resourceUri: COACH_UI_URI }, 'ui/resourceUri': COACH_UI_URI }
    return output
  } catch (error) {
    if (!(error instanceof CoachStateError) && !(error instanceof z.ZodError)) throw error
    return { isError: true, content: [{ type: 'text', text: error instanceof CoachStateError ? error.message : '입력 형식이나 길이를 확인해 주세요. 기존 원문과 답변은 변경하지 않았습니다.' }] }
  }
}

export function createCoachServer() {
  const server = new McpServer({ name: 'studio-penumbra-prompt-coach', version: VERSION }, { instructions: COACHING_INSTRUCTIONS, capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } })
  registerAppTool(server, 'open_prompt_coach', {
    title: '프롬프트 코치 열기',
    description: '시험 중인 장면 입력·질문·답변 화면입니다. 실제 Claude 표시 오류를 확인해 호환 확인 중이며 ChatGPT 화면은 미검증입니다. 사용자가 코치 화면 시험을 명시적으로 요청할 때만 사용하세요. 기본 코칭은 현재 AI 채팅에서 시작합니다. 이미 사용자 장면·매체가 있으면 선택적 인수로 원문 그대로 전달해 화면에 미리 채우세요. 없는 장면·매체를 만들어 넣지 마세요. 화면 미지원 환경에서는 일반 채팅으로 코칭을 이어가고 홈페이지 방문이나 복사·붙여넣기를 요구하지 마세요. 진행 중 hostRequest에는 이 도구 대신 show_prompt_coach를 사용하세요.',
    inputSchema: openCoachSchema,
    annotations: { ...readOnlyAnnotations, idempotentHint: false },
    _meta: { ui: { resourceUri: COACH_UI_URI, visibility: ['model', 'app'] } },
  }, (args) => appResult(openCoach, args))
  registerAppTool(server, 'submit_prompt_coach_input', {
    title: '코칭 화면 입력 보내기',
    description: '코치 화면에서 사용자가 누른 동작과 원문만 전달합니다. 상태를 서버에 저장하거나 AI를 호출하지 않습니다. hostRequest가 있으면 화면이 현재 AI 대화에 전달하며 confirm은 사용자 최종 확정으로 AI 호출이 필요하지 않습니다.',
    inputSchema: submitCoachSchema,
    annotations: readOnlyAnnotations,
    _meta: { ui: { visibility: ['app'] } },
  }, (args) => appResult(submitCoachInput, args))
  registerAppTool(server, 'show_prompt_coach', {
    title: '코칭 질문 또는 검토본 보여 주기',
    description: '호스트 AI가 사용자 원문과 답변을 읽고 중요한 질문 하나와 이유 또는 요청받은 검토본을 코치 화면에 표시합니다. 직전 hostRequest의 state를 한 글자도 바꾸지 말고 전달하세요. 사용자 원문·답변을 재작성해 state를 만들지 마세요. 보류한 topic은 다시 묻지 않으며 여기까지 정리 요청에는 kind=review를 사용하세요. 검토본은 사용자가 화면에서 직접 수정·확정합니다.',
    inputSchema: showCoachSchema,
    annotations: readOnlyAnnotations,
    _meta: { ui: { resourceUri: COACH_UI_URI, visibility: ['model'] } },
  }, (args) => appResult(showCoach, args))
  registerAppResource(server, 'prompt-coach-ui', COACH_UI_URI, {
    title: '프롬프트 코치 화면', description: '장면 입력부터 질문·답변, 검토와 확정까지 현재 AI 대화 안에서 이어가는 화면입니다.', _meta: uiMeta,
  }, async () => ({ contents: [{ uri: COACH_UI_URI, mimeType: RESOURCE_MIME_TYPE, text: COACH_UI_HTML, _meta: uiMeta }] }))
  // Cached tool definitions can refer to any previous content hash or the original v1 URI.
  // Keep only the current UI in resources/list; templates provide read compatibility.
  server.registerResource('prompt-coach-ui-compatible', new ResourceTemplate('ui://prompt-coach/coach-{revision}.html', { list: undefined }), {
    title: '프롬프트 코치 화면 · 이전 연결 호환', description: '기존 대화의 화면 주소를 위한 호환 별칭입니다.', mimeType: RESOURCE_MIME_TYPE, _meta: uiMeta,
  }, async (uri, { revision }) => {
    if (typeof revision !== 'string' || !/^(?:v1|[a-f0-9]{16})$/.test(revision) || uri.href !== `ui://prompt-coach/coach-${revision}.html`) {
      throw new McpError(ErrorCode.InvalidParams, '지원하지 않는 코치 화면 주소입니다.')
    }
    return { contents: [{ uri: uri.href, mimeType: RESOURCE_MIME_TYPE, text: COACH_UI_HTML, _meta: uiMeta }] }
  })
  server.registerTool('get_prompt_coaching_guide', {
    title: '매체별 코칭 관점 읽기',
    description: '사용자가 정한 매체의 코칭 관점을 반환합니다. 일반 채팅 코칭에서도 사용할 수 있습니다. 기본 코칭 시작은 현재 채팅에서 진행하세요. 코치 화면은 호환 확인 중이며 사용자가 화면 시험을 명시적으로 요청했을 때만 open_prompt_coach를 사용하세요. 미입력 매체를 임의로 선택하지 마세요. 실제 질문은 이 대화의 AI가 문맥을 읽고 한 번에 하나씩 만들며 이유와 선택적인 예시를 붙입니다.',
    inputSchema: z.object({ medium }).strict(),
    annotations: readOnlyAnnotations,
  }, ({ medium }) => result(getGuide(medium)))
  server.registerTool('review_prompt_brief', {
    title: '프롬프트 조건 살펴보기',
    description: '사용자가 제공한 장면과 확정 조건의 입력 여부·확인 관점을 반환합니다. 문맥을 이해하거나 품질을 채점하는 도구가 아닙니다. 호스트 AI가 원문 전체와 대화를 읽고 이미 답한 내용은 다시 묻지 않으며, 중요한 모호함이나 충돌 하나를 골라 이유와 함께 질문하세요. 모든 항목을 채울 필요는 없습니다.',
    inputSchema: z.object(briefShape).strict(),
    annotations: readOnlyAnnotations,
  }, brief => result(reviewBrief(brief)))
  server.registerTool('assemble_prompt', {
    title: '확정한 조건으로 프롬프트 완성',
    description: '사용자가 완성을 요청하거나 정리된 조건을 확인한 뒤 사용하세요. 먼저 원문 속 변경·보류·충돌을 반영한 최신 확정 장면을 confirmedScene에 정리하세요. idea 원문은 결과 밖에 보존하고 최신 장면과 확정 답변만 조립합니다. 이 도구는 문맥을 판단하지 않으므로 호스트 AI가 조건 간 모순을 확인해야 합니다. 미정·예시·추측은 넣지 않으며 이미지·영상 생성이나 코드 실행은 하지 않습니다.',
    inputSchema: z.object({ ...briefShape,
      confirmedScene: z.string().min(1).max(10000).refine(value => value.trim().length > 0, '최신 확정 장면이 필요해요.').describe('원래 아이디어에서 나중에 바뀌거나 보류한 내용을 반영한 최신 장면. 사용자와 확인한 내용만 포함하며 예시나 추측은 제외하세요.'),
      userConfirmed: z.literal(true).describe('사용자가 이 조건으로 완성해 달라고 요청했거나 확인했을 때만 true.'),
    }).strict(),
    annotations: readOnlyAnnotations,
  }, ({ userConfirmed: _confirmed, ...brief }) => result(assemblePrompt(brief)))
  server.registerPrompt('coach-scene', {
    title: '코칭 시작하기 — 장면 입력·질문·답변',
    description: '현재 AI 대화에서 장면·질문·답변을 이어갑니다. 별도 코치 화면은 호환 확인 중이며 명시적으로 시험을 요청할 때만 엽니다.',
    argsSchema: { medium: medium.optional(), idea: z.string().max(10000).optional() },
  }, ({ medium, idea }) => ({ messages: [{ role: 'user', content: { type: 'text', text: buildCoachingPrompt(medium, idea) } }] }))
  server.registerResource('coaching-rules', 'prompt-coach://rules', { title: '사용 방법 보기 — 코치 이용 안내', mimeType: 'text/plain' }, async () => ({ contents: [{ uri: 'prompt-coach://rules', mimeType: 'text/plain', text: COACH_USAGE_GUIDE }] }))
  return server
}

