import { expect, it } from 'vitest';
import { runModelAgent } from '../examples/model-agent.js';
it('re-prompts an out-of-menu recycling choice and submits the model-selected recovery instead', async () => {
  let calls = 0; const submitted: string[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('model.test')) {
      calls++;
      const prompt = JSON.parse(String(init?.body)).messages[1].content;
      if (calls === 2) expect(prompt).toContain('outside the current decision menu');
      return Response.json({ choices: [{ message: { content: JSON.stringify({ action: calls === 1 ? 'collect_recycling' : 'eat_diner', params: {} }) } }] });
    }
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, decision_context: { milestones: { bedDays: 7, shifts: 0 }, actions: [{ action: 'eat_diner', params: {}, category: 'recovery' }, { action: 'day_labor', params: {}, category: 'progress' }] } });
    if (url.endsWith('/act')) { submitted.push(JSON.parse(String(init?.body)).action); return Response.json({ ok: true }); }
    return Response.json({ ok: true, ready: true });
  };
  const result = await runModelAgent({ gameUrl: 'http://game.test', token: 'token', modelUrl: 'http://model.test', model: 'Loop test', maxTurns: 1 }, { fetch: fake as typeof fetch });
  expect(submitted).toEqual(['eat_diner']); expect(result.modelCalls).toBe(2);
});
it('removes repetitive income after three decisions without milestones, while preserving the model’s story choice', async () => {
  let calls = 0; const submitted: string[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('model.test')) {
      calls++;
      const prompt = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
      if (calls >= 4) { expect(prompt.progress_warning).toContain('Three decisions'); expect(prompt.state.decision_context.actions.map((a: any) => a.action)).toEqual(['story_decision']); }
      return Response.json({ choices: [{ message: { content: JSON.stringify(calls < 5 ? { action: 'collect_recycling', params: {} } : { action: 'story_decision', params: { choice: 'army' } }) } }] });
    }
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, decision_context: { milestones: { stage: 1 }, actions: [{ action: 'collect_recycling', params: {}, category: 'income' }, { action: 'story_decision', params: { choice: 'army' }, category: 'progress' }] } });
    if (url.endsWith('/act')) { submitted.push(JSON.parse(String(init?.body)).action); return Response.json({ ok: true }); }
    return Response.json({ ok: true, ready: true });
  };
  await runModelAgent({ gameUrl: 'http://game.test', token: 'token', modelUrl: 'http://model.test', model: 'Loop test', maxTurns: 4 }, { fetch: fake as typeof fetch });
  expect(submitted).toEqual(['collect_recycling', 'collect_recycling', 'collect_recycling', 'story_decision']);
});
it('stops a model that insists on invalid repetition without submitting a fallback action', async () => {
  let submitted = 0;
  const fake = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('model.test')) return Response.json({ choices: [{ message: { content: '{"action":"sleep_shelter","params":{}}' } }] });
    if (url.endsWith('/story')) return Response.json({ character: { mode: 'agent' }, decision_context: { milestones: {}, actions: [{ action: 'day_labor', params: {}, category: 'progress' }] } });
    if (url.endsWith('/act')) submitted++;
    return Response.json({ ok: true, ready: true });
  };
  await expect(runModelAgent({ gameUrl: 'http://game.test', token: 'token', modelUrl: 'http://model.test', model: 'Stubborn model' }, { fetch: fake as typeof fetch })).rejects.toThrow('without substituting');
  expect(submitted).toBe(0);
});
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
