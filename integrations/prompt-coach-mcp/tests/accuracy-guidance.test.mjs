import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import worker from '../worker.mjs';
import { ACCURACY_RULES } from '../accuracy.mjs';
import { buildOnboarding } from '../onboarding.mjs';

// These assertions verify delivery to independent host entry points, not model compliance.
// Uncertain-count/fixed-camera behaviour is checked separately in a real host conversation.
test('independent MCP entries deliver the same evidence and explanation safeguards', async t => {
  const client = new Client({ name: 'accuracy-regression', version: '1.0.0' }, { capabilities: {} });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL('https://prompt-coach.example/mcp'), {
    fetch: (url, init) => worker.fetch(new Request(url, init)),
  }));
  const entries = [
    ['initialize', client.getInstructions()],
    ['onboarding', buildOnboarding('https://coach.studio-penumbra.com/mcp')],
  ];
  for (const name of ['coach-scene', 'coach-image']) {
    const prompt = await client.getPrompt({ name });
    entries.push([name, prompt.messages[0].content.text]);
  }
  const image = await client.callTool({ name: 'get_image_coaching_guide', arguments: {} });
  assert.notEqual(image.isError, true);
  entries.push(['standalone image guide', image.structuredContent.instructions]);
  for (const medium of ['image', 'web', 'video']) {
    const guide = await client.callTool({ name: 'get_prompt_coaching_guide', arguments: { medium } });
    assert.notEqual(guide.isError, true);
    entries.push([`${medium} rules`, guide.structuredContent.rules.join('\n')]);
  }
  for (const [name, instructions] of entries) {
    for (const rule of ACCURACY_RULES) assert.ok(instructions.includes(rule), `${name} must include: ${rule}`);
  }
});
