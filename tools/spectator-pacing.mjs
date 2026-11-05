// Local, single-character viewing helper. Never changes action results or deadlines.
const id = process.argv[2];
if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Pass the character ID');
const base = 'http://localhost:3000';
const targetSeconds = 10;
const request = async (path, body) => {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(5000), ...(body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-secret': 'dev-admin' }, body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Local game returned ${response.status}`);
  return response.json();
};
const shards = await request('/api/shards');
if (shards[0]?.players !== 1) throw new Error('Fast-forward is global: use a local world with exactly one character');
await request('/api/admin/clock', { decisionSpacingSeconds: 10 });
let deadline = ''; let reconnectFailures = 0;
for (;;) {
  try {
  const state = await request(`/api/watch/${id}`);
  reconnectFailures = 0;
  if (state.clock.paused) { deadline = ''; await new Promise(r => setTimeout(r, 500)); continue; }
  if (Date.parse(state.character.nextDecisionAt) <= Date.parse(state.clock.gameTime) && state.clock.scale !== 1) {
    await request('/api/admin/clock', { scale: 1 });
  }
  if (state.character.nextDecisionAt !== deadline) {
    const currentShards = await request('/api/shards');
    if (currentShards[0]?.players !== 1) {
      await request('/api/admin/clock', { scale: 1 });
      console.error('Another character joined; stopped global fast-forward');
      break;
    }
    deadline = state.character.nextDecisionAt;
    const remaining = Math.max(0, Date.parse(deadline) - Date.parse(state.clock.gameTime));
    const scale = Math.max(1, Math.min(3600, remaining / (targetSeconds * 1000)));
    await request('/api/admin/clock', { scale });
    console.log(new Date().toISOString(), `Next action wait ~${Math.ceil(remaining / scale / 1000)}s; clock ${scale.toFixed(1)}x`);
  }
  await new Promise(r => setTimeout(r, 500));
  } catch (error) {
    if (++reconnectFailures >= 10) throw error;
    console.error('Waiting for local game to reconnect:', String(error));
    deadline = '';
    await new Promise(r => setTimeout(r, 1000));
  }
}
