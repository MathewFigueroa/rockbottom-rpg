import { expect, test } from "@playwright/test";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";

const server = "http://localhost:3000";
const shots = path.resolve(process.cwd(), "docs/screenshots");

test("capture all real README scenes @screenshots", async ({ page, request }) => {
  await mkdir(shots, { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });

  await capture(page, "/", "01-title.png", { width: 1280, height: 720 }, "[data-testid=title-screen]");
  await capture(page, "/", "01-title-mobile.png", { width: 390, height: 844 }, "[data-testid=title-screen]");
  await capture(page, "/?screen=creation", "02-character-creation.png", { width: 1280, height: 720 }, "[data-testid=character-creation]");
  await capture(page, "/?screen=creation", "02-character-creation-mobile.png", { width: 390, height: 844 }, "[data-testid=character-creation]");

  const opening = await demo(request, "opening");
  await capture(page, `/?character=${opening.id}&scene=opening`, "03-overpass-dawn.png", { width: 1280, height: 720 }, "canvas");
  await capture(page, `/?character=${opening.id}&scene=opening`, "03-overpass-dawn-mobile.png", { width: 390, height: 844 }, "canvas");

  const labor = await demo(request, "day-labor");
  await capture(page, `/?character=${labor.id}&scene=day-labor`, "04-day-labor.png", { width: 1280, height: 720 }, ".shift-overlay");
  const sam = await demo(request, "sam");
  await capture(page, `/?character=${sam.id}&scene=sam`, "05-dialogue-sam.png", { width: 1280, height: 720 }, "[data-testid=sam-dialogue]");
  const night = await demo(request, "night");
  await capture(page, `/?character=${night.id}&scene=night`, "06-city-night.png", { width: 1280, height: 720 }, "canvas");
  const hearing = await demo(request, "hearing");
  await capture(page, `/?character=${hearing.id}&scene=hearing`, "07-custody-hearing.png", { width: 1280, height: 720 }, "[data-testid=custody-hearing]");
  const agent = await demo(request, "agent");
  await capture(page, `/watch/${agent.id}`, "08-agent-mode.png", { width: 1280, height: 720 }, ".spectator-pane");
  const crew = await demo(request, "crew");
  await capture(page, `/?character=${crew.id}&scene=crew`, "09-crew-map.png", { width: 1280, height: 720 }, ".crew-overlay");
  await capture(page, "http://localhost:5174/admin/?demo=1", "10-admin-clock.png", { width: 1280, height: 720 }, "[data-testid=admin-clock]");
  const mobile = await demo(request, "opening");
  await capture(page, `/?character=${mobile.id}&scene=city`, "11-mobile-touch.png", { width: 390, height: 844 }, ".touch-controls");
  const army = await demo(request, "army");
  await capture(page, `/?character=${army.id}&scene=army`, "12-army-recruiter.png", { width: 1280, height: 720 }, ".army-overlay");

  for (const filename of ["01-title.png", "01-title-mobile.png", "02-character-creation.png", "02-character-creation-mobile.png", "03-overpass-dawn.png", "03-overpass-dawn-mobile.png", "04-day-labor.png", "05-dialogue-sam.png", "06-city-night.png", "07-custody-hearing.png", "08-agent-mode.png", "09-crew-map.png", "10-admin-clock.png", "11-mobile-touch.png", "12-army-recruiter.png"]) {
    expect((await stat(path.join(shots, filename))).size, filename).toBeGreaterThan(10_000);
  }
});

async function demo(request: { post: Function }, scene: string) { const response = await request.post(`${server}/api/demo/${scene}`); expect(response.ok()).toBeTruthy(); return response.json(); }
async function capture(page: import("@playwright/test").Page, url: string, filename: string, viewport: { width: number; height: number }, ready: string) {
  await page.setViewportSize(viewport);
  await page.goto(url);
  await expect(page.locator(ready).first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: path.join(shots, filename), animations: "disabled" });
}
