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
