import { expect, it } from 'vitest';
import { runModelAgent } from '../examples/model-agent.js';
it('makes no model calls while waiting and submits only a parsed action when a real decision opens', async () => {
  let polls = 0; let calls = 0; let actions = 0;
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('model.test')) { calls++; expect(polls).toBe(3); expect(init?.body).not.toContain('secret-agent-token'); return Response.json({ choices: [{ message: { content: JSON.stringify({ action: 'safe_idle', params: {}, summary: 'Keep the bed.', scene: 'The key is still warm.' }) } }] }); }
    if (url.endsWith('/identity')) return Response.json({ ok: true });
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, director: { brief: 'Prefer care over spectacle.' }, campaign: {}, life: { commands: [] } });
    if (url.endsWith('/wait')) { polls++; return Response.json({ ready: polls >= 3, retry_after_ms: 250 }); }
    if (url.endsWith('/act')) { actions++; expect(JSON.parse(String(init?.body)).params.summary).toBe('Keep the bed.'); return Response.json({ ok: true }); }
    throw new Error('Unexpected request');
  };
  const result = await runModelAgent({ gameUrl: 'http://game.test', token: 'secret-agent-token', modelUrl: 'http://model.test/v1', model: 'Model A', maxTurns: 1 }, { fetch: fake as typeof fetch, sleep: async () => {} });
  expect(result.modelCalls).toBe(1); expect(calls).toBe(1); expect(actions).toBe(1);
});
it('rejects malformed model output without sending a game action', async () => {
  let actions = 0;
  const fake = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('model.test')) return Response.json({ choices: [{ message: { content: 'not json' } }] });
    if (url.endsWith('/identity')) return Response.json({ ok: true });
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, campaign: {} });
    if (url.endsWith('/wait')) return Response.json({ ready: true });
    if (url.endsWith('/act')) actions++;
    return Response.json({ ok: true });
  };
  await expect(runModelAgent({ gameUrl: 'http://game.test', token: 'token', modelUrl: 'http://model.test', model: 'Model B', maxTurns: 1 }, { fetch: fake as typeof fetch })).rejects.toThrow('valid JSON'); expect(actions).toBe(0);
});
it('can send an intentional chat decision without pretending it changed a world resource', async () => {
  let sent = false;
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('model.test')) return Response.json({ choices: [{ message: { content: JSON.stringify({ action: 'chat', params: { channel: 'proximity', message: 'The day lot is hiring.' } }) } }] });
    if (url.endsWith('/identity')) return Response.json({ ok: true });
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, campaign: {} });
    if (url.endsWith('/wait')) return Response.json({ ready: true });
    if (url.endsWith('/chat')) { sent = true; expect(JSON.parse(String(init?.body)).message).toBe('The day lot is hiring.'); return Response.json({ id: 'entry' }); }
    throw new Error('Unexpected world action');
  };
  const result = await runModelAgent({ gameUrl: 'http://game.test', token: 'token', modelUrl: 'http://model.test', model: 'Model C', maxTurns: 1 }, { fetch: fake as typeof fetch });
  expect(sent).toBe(true); expect(result.turns).toBe(1);
});
