import { expect, request as playwrightRequest, test } from "@playwright/test";

const server = "http://localhost:3000";

test("manual player completes Act 1 through the understated visitation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Begin again" }).click();
  await expect(page.getByTestId("character-creation")).toBeVisible();
  await page.getByLabel("Your name").fill("Morgan");
  await page.getByLabel("Child's name").fill("Casey");
  await page.getByRole("button", { name: "Wake beneath Route 9" }).click();
  await expect(page.getByTestId("game-shell")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Stand up/ }).click();

  async function actButton(name: RegExp) {
    const response = page.waitForResponse(r => r.url().endsWith('/action'));
    await page.getByRole('button', { name }).click();
    const result = await (await response).json();
    await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: result.state.nextDecisionAt, paused: true } });
  }
  for (let i = 0; i < 3; i++) await actButton(/Collect recycling/);
  await expect(page.locator('.resources > span').first()).toContainText('$58');
  await actButton(/Claim C-14/);
  await actButton(/Sleep at shelter/);
  for (let i = 0; i < 4; i++) await actButton(/Work a shift/);
  for (let i = 0; i < 6; i++) await actButton(/Sleep at shelter/);
  await page.getByRole('button', { name: /Attend visitation/ }).click();
  await expect(page.getByTestId('first-visitation')).toBeVisible();
  for (let i = 0; i < 6; i++) await page.locator('.visit-copy button').first().click();
  await expect(page.getByText(/Choose your line/)).toBeVisible();
  await expect(page.getByText("ACT 2: THE LADDER")).toBeVisible();
});

test("agent decision gates, rate limit, stuck park, and checkpoint safety are server enforced", async ({ request }) => {
  await request.post(`${server}/api/admin/clock`, { headers: { "x-admin-secret": "dev-admin" }, data: { paused: false, scale: 60, decisionSpacingSeconds: 1, stuckMissedWindows: 3, stuckFailedActions: 5, stuckResetMinutes: 1 } });
  const character = await createCharacter(request, "Gate Agent");
  await request.post(`${server}/api/characters/${character.id}/mode`, { data: { mode: "agent" } });
  const headers = { authorization: `Bearer ${character.agentToken}` };
  const first = await request.post(`${server}/api/agent/act`, { headers, data: { action: "safe_idle", params: {} } });
  expect(first.ok()).toBeTruthy();
  const blocked = await request.post(`${server}/api/agent/act`, { headers, data: { action: "safe_idle", params: {} } });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).retry_at).toBeTruthy();

  const rateCharacter = await createCharacter(request, "Observe Agent");
  const rateHeaders = { authorization: `Bearer ${rateCharacter.agentToken}` };
  for (let index = 0; index < 6; index++) {
    const snapshot = await request.post(`${server}/api/agent/observe`, { headers: rateHeaders });
    expect(snapshot.ok()).toBeTruthy();
    expect(Buffer.byteLength(await snapshot.body())).toBeLessThanOrEqual(2048);
  }
  expect((await request.post(`${server}/api/agent/observe`, { headers: rateHeaders })).status()).toBe(429);

  const broken = await createCharacter(request, "Broken Agent");
  await request.post(`${server}/api/characters/${broken.id}/mode`, { data: { mode: "agent" } });
  const brokenHeaders = { authorization: `Bearer ${broken.agentToken}` };
  for (let index = 0; index < 5; index++) await request.post(`${server}/api/agent/act`, { headers: brokenHeaders, data: { action: "walk_into_wall", params: {} } });
  expect((await (await request.get(`${server}/api/characters/${broken.id}`)).json()).status).toBe("stuck");

  const absent = await createCharacter(request, "Absent Agent");
  await request.post(`${server}/api/characters/${absent.id}/mode`, { data: { mode: "agent" } });
  await expect.poll(async () => (await (await request.get(`${server}/api/characters/${absent.id}`)).json()).status, { timeout: 5_000 }).toBe("stuck");
});

test("zero-LLM rule policy survives seven game days and appears live to spectators", async ({ request, page }) => {
  const created = await createCharacter(request, "Rule Seven");
  await request.post(`${server}/api/characters/${created.id}/mode`, { data: { mode: "agent" } });
  const headers = { authorization: `Bearer ${created.agentToken}` };
  const firstObservation = await request.post(`${server}/api/agent/observe`, { headers });
  expect(firstObservation.ok()).toBeTruthy();
  const started = new Date((await (await request.get(`${server}/api/clock`)).json()).gameTime).getTime();
  let state = await (await request.get(`${server}/api/characters/${created.id}`)).json();
  for (let turn = 0; turn < 40; turn++) {
    const action = chooseRuleAction(state);
    const response = await request.post(`${server}/api/agent/act`, { headers, data: { action, params: {} } });
    expect(response.ok(), `${action} should be accepted`).toBeTruthy();
    state = (await response.json()).state;
    await request.post(`${server}/api/admin/clock`, { headers: { "x-admin-secret": "dev-admin" }, data: { gameTime: state.nextDecisionAt, scale: 60 } });
    const elapsed = new Date(state.nextDecisionAt).getTime() - started;
    if (elapsed >= 7 * 86_400_000 && state.act >= 2) break;
  }
  expect(new Date(state.nextDecisionAt).getTime() - started).toBeGreaterThanOrEqual(7 * 86_400_000);
  expect(state.act).toBe(2);
  expect(state.status).not.toBe("dead");
  const watch = await (await request.get(`${server}/api/watch/${created.id}`)).json();
  expect(watch.actions.length).toBeGreaterThan(10);
  await page.goto(`/watch/${created.id}`);
  await expect(page.getByText("Action ticker")).toBeVisible();
  await expect(page.getByText("RULE SEVEN", { exact: false }).first()).toBeVisible();
});

test("two clients share proximity, alliance requires consent, and reports remain pending", async () => {
  const first = await playwrightRequest.newContext();
  const second = await playwrightRequest.newContext();
  const a = await createCharacter(first, "Ari");
  const b = await createCharacter(second, "Bex");
  const observed = await first.post(`${server}/api/agent/observe`, { headers: { authorization: `Bearer ${a.agentToken}` } });
  expect((await observed.json()).surroundings.nearby.some((entry: { id: string }) => entry.id === b.id)).toBeTruthy();
  const crewA = await (await first.post(`${server}/api/crews`, { data: { name: "North Cut", characterId: a.id } })).json();
  const crewB = await (await second.post(`${server}/api/crews`, { data: { name: "River Hands", characterId: b.id } })).json();
  const alliance = await first.post(`${server}/api/crews/${crewA.id}/ally`, { data: { crewId: crewB.id } });
  expect(alliance.status()).toBe(409);
  await second.post(`${server}/api/chat`, { data: { characterId: b.id, channel: "proximity", message: "Day lot is hiring." } });
  expect((await (await first.get(`${server}/api/chat`)).json()).at(-1).message).toBe("Day lot is hiring.");
  for (let flag = 1; flag <= 3; flag++) {
    const report = await first.post(`${server}/api/reports`, { data: { reporterId: a.id, targetId: b.id, reason: `test evidence ${flag}`, fingerprint: "canvas-audio-ua-timezone" } });
    const body = await report.json();
    expect(body.status).toBe("pending");
    expect(body.evidence.fingerprintHash).toHaveLength(64);
    expect(body.penalty).toContain("pending");
  }
  await first.dispose(); await second.dispose();
});

test("all 24 tapes collect and the frame, Forgiveness, and Honor render end to end", async ({ request, page }) => {
  const character = await createCharacter(request, "Archivist");
  const tapes = await (await request.get(`${server}/api/content/tapes`)).json();
  expect(tapes).toHaveLength(24);
  for (const tape of tapes) {
    const response = await request.post(`${server}/api/characters/${character.id}/tapes/${tape.id}`);
    expect(response.ok()).toBeTruthy();
  }
  const state = await (await request.get(`${server}/api/characters/${character.id}`)).json();
  expect(state.tapes).toHaveLength(24);
  await page.context().addCookies(await request.storageState().then(s => s.cookies));
  await page.goto(`/?character=${character.id}&scene=reveal`);
  await expect(page.getByText("RECONSTRUCTION PAUSED")).toBeVisible();
  await page.goto(`/?character=${character.id}&scene=forgiveness`);
  await expect(page.getByRole("heading", { name: "FORGIVENESS" })).toBeVisible();
  await page.goto(`/?character=${character.id}&scene=honor`);
  await expect(page.getByRole("heading", { name: "HONOR" })).toBeVisible();
});

test("admin clock changes simulation speed and lists all five packs", async ({ request, page }) => {
  const before = await (await request.get(`${server}/api/clock`)).json();
  await request.post(`${server}/api/admin/clock`, { headers: { "x-admin-secret": "dev-admin" }, data: { scale: 30 } });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const after = await (await request.get(`${server}/api/clock`)).json();
  expect(new Date(after.gameTime).getTime() - new Date(before.gameTime).getTime()).toBeGreaterThan(3_000);
  expect((await (await request.get(`${server}/api/packs`)).json())).toHaveLength(5);
  await page.goto("http://localhost:5174/admin/?demo=1");
  await expect(page.getByText("World clock", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Content packs/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
});

async function createCharacter(request: { post: Function }, name: string) {
  const response = await request.post(`${server}/api/characters`, { data: { name, sex: "female", childName: "Riley", childAge: 8 } });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function chooseRuleAction(state: any) {
  if (state.act >= 2) return "safe_idle";
  if (state.needs.hunger < 35 && state.cash >= 6) return "eat_diner";
  if (state.questStep === 0) return "collect_recycling";
  if (state.questStep === 1) return "claim_shelter";
  if (state.questStep === 2) return state.shiftsWorked < 4 && state.needs.energy >= 20 ? "day_labor" : "sleep_shelter";
  if (state.questStep === 3) return "attend_visitation";
  return "safe_idle";
}

test('Second Copy is playable in the browser and broadcasts revealed scenes', async ({ page }) => {
  test.setTimeout(120_000);
  const c = await (await page.request.post(`${server}/api/demo/sam`)).json();
  await page.goto(`/?character=${c.id}&scene=city`);
  const panel = page.getByRole('region', { name: 'Second Wind story' });
  for (const choice of ['open record', 'army', 'verify copy', 'save neighbors', 'hear witnesses', 'protect witnesses']) {
    const response = page.waitForResponse(r => r.url().endsWith('/action'));
    await panel.getByRole('button', { name: choice, exact: true }).click();
    const result = await (await response).json();
    expect(result.ok).toBe(true);
    await page.request.post(`${server}/api/admin/clock`, { headers: { 'x-admin-secret': 'dev-admin' }, data: { gameTime: result.state.nextDecisionAt, paused: true } });
  }
  await expect(panel).toContainText('You promise only Tuesday');
  await page.goto(`/watch/${c.id}`);
  await expect(page.getByText('Action ticker')).toBeVisible();
  await expect(page.locator('.spectator-pane')).toContainText('DAY 30');
});
