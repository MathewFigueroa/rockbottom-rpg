import { expect, test } from '@playwright/test';
const server = 'http://localhost:3000';
test('full Army assessment and training are playable from Life decisions', async ({ page }) => {
  test.setTimeout(120000);
  await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { paused: true } });
  const c = await (await page.request.post(`${server}/api/demo/sam`)).json();
  async function action(action: string, params: Record<string, unknown>) {
    const result = await (await page.request.post(`${server}/api/characters/${c.id}/action`, { data: { action, params } })).json();
    expect(result.ok, result.message).toBe(true);
    await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: result.state.nextDecisionAt, paused: true } });
  }
  await action('story_decision', { choice: 'open_record' }); await action('story_decision', { choice: 'army' });
  await action('army_action', { op: 'enroll' });
  for (const answer of [0, 2, 1, 1, 2, 0, 0, 1, 2, 2, 0]) await action('army_action', { op: 'answer', answer });
  await page.goto(`/?character=${c.id}&scene=city`);
  await page.getByRole('navigation', { name: 'Campaign view' }).getByRole('button', { name: 'Life', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Life decisions' });
  await panel.getByRole('button', { name: 'The error, conditions and correction', exact: true }).click();
  await expect(panel).toContainText('E-4');
  await panel.getByRole('button', { name: 'Begin training day 1 · 18-second drill', exact: true }).click();
  for (const input of ['left', 'action', 'right', 'action', 'hold']) await panel.getByRole('button', { name: input, exact: true }).click();
  await expect(panel).toContainText('Training 1/3');
});

test('market provenance leads through legal aid and restitution to a recorded hearing', async ({ page }) => {
  test.setTimeout(120000);
  await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { paused: true } });
  const c = await (await page.request.post(`${server}/api/demo/sam`)).json();
  for (const choice of ['open_record', 'street']) {
    const result = await (await page.request.post(`${server}/api/characters/${c.id}/action`, { data: { action: 'story_decision', params: { choice } } })).json();
    await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: result.state.nextDecisionAt, paused: true } });
  }
  await page.goto(`/?character=${c.id}&scene=city`);
  await page.getByRole('navigation', { name: 'Campaign view' }).getByRole('button', { name: 'Life', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Life decisions' });
  let hearing = '';
  async function choose(name: RegExp) {
    const response = page.waitForResponse(r => r.url().endsWith('/action'));
    await panel.getByRole('button', { name }).click(); const result = await (await response).json(); expect(result.ok, result.message).toBe(true);
    if (result.state.street?.legal?.status === 'jailed') hearing = result.state.street.legal.hearingAt;
    else await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: result.state.nextDecisionAt, paused: true } });
  }
  await choose(/Buy bracelet with disputed provenance/); await choose(/Inspect bracelet/); await choose(/Fence bracelet/); await choose(/Review the evidence with legal aid/);
  await choose(/Answer the summons with a public defender/); await choose(/Call Dana/); await choose(/Offer documented restitution/);
  await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: hearing, paused: true } });
  await expect.poll(async () => (await (await page.request.get(`${server}/api/characters/${c.id}`)).json()).street.legal.status).toBe('closed');
  const owner = await (await page.request.get(`${server}/api/characters/${c.id}`)).json();
  expect(owner.street.legal.outcome).toBe('diversion'); expect(owner.record).toBe(0);
});

test('spectators see opted-in model interpretations but never the private viewer brief', async ({ page }) => {
  const c = await (await page.request.post(`${server}/api/characters`, { data: { name: 'Different Model', sex: 'female', childName: 'Riley', childAge: 8, brief: 'PRIVATE SPECTATOR PREFERENCE', shareSummaries: true } })).json();
  await page.request.post(`${server}/api/characters/${c.id}/mode`, { data: { mode: 'agent' } });
  const headers = { authorization: `Bearer ${c.agentToken}` };
  await page.request.post(`${server}/api/agent/identity`, { headers, data: { modelLabel: 'A Different Model' } });
  const action = await page.request.post(`${server}/api/agent/act`, { headers, data: { action: 'collect_recycling', params: { summary: 'Keep one ordinary promise first.', scene: 'The machine counts cans while the city wakes.' } } }); expect(action.ok()).toBeTruthy();
  await page.goto(`/watch/${c.id}`);
  await expect(page.getByRole('heading', { name: 'Agent interpretation' })).toBeVisible();
  await expect(page.getByText('Keep one ordinary promise first.')).toBeVisible();
  const watch = await (await page.request.get(`${server}/api/watch/${c.id}`)).json(); expect(JSON.stringify(watch)).not.toContain('PRIVATE SPECTATOR PREFERENCE'); expect(watch.character.cash).toBe(22);
  await page.request.post(`${server}/api/characters/${c.id}/director`, { data: { brief: 'PRIVATE SPECTATOR PREFERENCE', shareSummaries: false } });
  await expect(page.getByRole('heading', { name: 'Agent interpretation' })).toHaveCount(0);
});

test('owner recovery restores a saved character through the browser', async ({ page }) => {
  const c = await (await page.request.post(`${server}/api/characters`, { data: { name: 'Returning Owner', sex: 'female', childName: 'Riley', childAge: 8 } })).json();
  const code = (await (await page.request.post(`${server}/api/characters/${c.id}/recovery-code`, { data: {} })).json()).recoveryCode;
  await page.context().clearCookies();
  await page.goto('/'); await page.getByRole('button', { name: 'Recover saved character' }).click();
  await page.getByLabel('Saved character link').fill(`http://localhost:5173/watch/${c.id}`); await page.getByLabel('Recovery code', { exact: true }).fill(code);
  await page.getByRole('button', { name: 'Recover character', exact: true }).click(); await expect(page.getByTestId('game-shell')).toBeVisible();
  expect((await page.request.get(`${server}/api/characters/${c.id}`)).ok()).toBeTruthy();
});

test('direct chat is readable by its participants and absent from public chat', async ({ page, browser }) => {
  const a = await (await page.request.post(`${server}/api/demo/sam`)).json();
  const other = await browser.newContext();
  try {
    const b = await (await other.request.post(`${server}/api/characters`, { data: { name: 'Private Recipient', sex: 'male', childName: 'Riley', childAge: 8 } })).json();
    await page.goto(`/?character=${a.id}&scene=city`); await page.getByRole('navigation', { name: 'Campaign view' }).getByRole('button', { name: 'Chat', exact: true }).click();
    const panel = page.getByRole('complementary', { name: 'Chat' }); await panel.getByRole('combobox', { name: 'Channel', exact: true }).selectOption('direct'); await panel.getByRole('combobox', { name: 'Recipient', exact: true }).selectOption(b.id);
    await panel.getByLabel('Message', { exact: true }).fill('PRIVATE PARTICIPANT MESSAGE'); await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel.getByText('PRIVATE PARTICIPANT MESSAGE')).toBeVisible();
    expect(await (await page.request.get(`${server}/api/chat`)).text()).not.toContain('PRIVATE PARTICIPANT MESSAGE');
    expect(await (await other.request.get(`${server}/api/characters/${b.id}/chat`)).text()).toContain('PRIVATE PARTICIPANT MESSAGE');
    expect((await page.request.get(`${server}/api/characters/${b.id}/chat`)).status()).toBe(401);
  } finally { await other.close(); }
});


test('spectators explore earned testimony and form their own reading without controlling the actor', async ({ page }) => {
  const c = await (await page.request.post(`${server}/api/characters`, { data: { name: 'Context Test', sex: 'female', childName: 'Riley', childAge: 8 } })).json();
  await page.request.post(`${server}/api/characters/${c.id}/action`, { data: { action: 'collect_recycling', params: {} } });
  const records = await (await page.request.get(`${server}/api/watch/${c.id}/records`)).json();
  expect(records.map((r: { id: string }) => r.id)).toEqual(['tape-01']);
  await page.goto(`/watch/${c.id}`);
  const context = page.getByRole('region', { name: 'Story context' });
  await expect(context).toContainText('Earn your first $50');
  await context.getByText('Make your own call', { exact: true }).click();
  await context.getByRole('button', { name: 'Family', exact: true }).click();
  await expect(context).toContainText('Your reading: Family');
  await context.getByText('Open the evidence box', { exact: false }).click();
  await context.getByText('Microcassette: Route 9', { exact: true }).click();
  await expect(context).toContainText('SAM OKAFOR, INTERVIEW 1');
  const after = await (await page.request.get(`${server}/api/watch/${c.id}`)).json();
  expect(after.character.cash).toBe(22);
  expect(after.actions).toHaveLength(2);
});
