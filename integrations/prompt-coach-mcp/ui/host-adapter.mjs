import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';

/** Standard MCP Apps transport; model reasoning happens in the host conversation. */
export function createMcpHostAdapter({ onResult, onConnection, onError }, browser = window) {
  const app = new App({ name: 'Studio Penumbra · Prompt Coach', version: '0.2.0' }, {}, { autoResize: true });
  let connected = false;
  app.ontoolresult = (result) => onResult(result);
  app.ontoolcancelled = () => onError('요청이 취소되었어요. 이 카드에 작성한 내용은 남아 있어요.');
  app.onclose = () => { connected = false; onConnection('disconnected'); };

  return {
    async connect() {
      if (browser.parent === browser) { onConnection('unsupported'); return; }
      try {
        await app.connect(undefined, { timeout: 10000 });
        connected = true;
        onConnection(app.getHostCapabilities()?.serverTools ? 'ready' : 'unsupported');
      } catch { onConnection('unsupported'); }
    },
    async submit(args) {
      if (!connected || !app.getHostCapabilities()?.serverTools) throw new Error('이 환경에서 코치 도구를 사용할 수 없어요.');
      return app.callServerTool({ name: 'submit_prompt_coach_input', arguments: args }, { timeout: 20000 });
    },
    async sendMessage(text) {
      if (!connected || !app.getHostCapabilities()?.message?.text) throw new Error('이 환경은 화면에서 대화로 요청을 보내는 기능을 지원하지 않아요.');
      let message = text;
      if (text.includes('pc1.') && app.getHostCapabilities()?.updateModelContext?.text) {
        try {
          await app.updateModelContext({ content: [{ type: 'text', text }] }, { timeout: 20000 });
          message = '프롬프트 코치 화면에서 입력을 보냈어요. 방금 전달된 코치 화면의 문맥과 state를 사용해 show_prompt_coach로 다음 질문 또는 요청한 검토본을 보여 주세요.';
        } catch { /* Older hosts receive the full request so no user text is lost. */ }
      }
      return app.sendMessage({ role: 'user', content: [{ type: 'text', text: message }] }, { timeout: 20000 });
    },
    async download(filename, mimeType, text) {
      if (!connected || !app.getHostCapabilities()?.downloadFile) throw new Error('이 환경은 파일 저장을 지원하지 않아요. 내용을 복사해 보관해 주세요.');
      const result = await app.downloadFile({ contents: [{ type: 'resource', resource: { uri: `file:///${filename}`, mimeType, text } }] }, { timeout: 30000 });
      if (result.isError) throw new Error('파일 저장이 취소되었거나 허용되지 않았어요.');
    },
    persist(snapshot) {
      if (typeof browser.openai?.setWidgetState === 'function') {
        const result = browser.openai.setWidgetState(snapshot);
        result?.catch?.(() => {});
      }
    },
    restoredState() { return browser.openai?.widgetState ?? null; },
    async close() { connected = false; await app.close(); },
  };
}
