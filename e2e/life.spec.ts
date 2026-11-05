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
