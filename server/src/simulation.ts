import { advanceStory, choices } from "./story.js";
import { ACTIONS, STORY_PROMPTS, calculateCustody, type CharacterState, type GameAction } from "@rockbottom/shared";
import { GameClock, MemoryStore } from "./store.js";

export interface ActionResult {
  ok: boolean;
  message: string;
  retry_at?: string;
  state: CharacterState;
}

const objectiveFor = (character: CharacterState): string => {
  if (character.story && character.act > 1) return STORY_PROMPTS[character.story.stage] ?? "Keep Tuesday’s visit.";
  if (character.act > 1) return "Choose your line: build on the streets or enlist at Fort Halvern.";
  if (character.questStep === 0) return "Earn your first $50. Recycling and day labor are available.";
  if (character.questStep === 1) return "Claim a bed at Dana Reyes's shelter before curfew.";
  if (character.questStep === 2) return `Hold the bed for 7 days and work 4 shifts. Bed ${character.shelterDays}/7, shifts ${character.shiftsWorked}/4.`;
  if (character.questStep === 3) return "Attend supervised visitation at the Halvern Family Center.";
  return "Speak with Dana about the housing, income, sobriety, and record ladder.";
};

export class Simulation {
  constructor(readonly store: MemoryStore, readonly clock: GameClock) {}

  act(character: CharacterState, action: string, params: Record<string, unknown> = {}, agent = false): ActionResult {
    if (character.status === "dead") return { ok: false, message: "This life has ended.", state: character };
    if (!ACTIONS.includes(action as GameAction)) return this.fail(character, action, "Unknown action.");
    const now = this.clock.nowMs();
    const availableAt = new Date(character.nextDecisionAt).getTime();
    if (now < availableAt) {
      return { ok: false, message: "The simulation is between decision points.", retry_at: character.nextDecisionAt, state: character };
    }
    if (agent && character.actedWindow === character.decisionWindow) character.decisionWindow += 1;

    const previousCash = character.cash;
    let durationMinutes = 1;
    let message = "Done.";
    switch (action as GameAction) {
      case "story_decision": {
        const result = advanceStory(character, params.choice);
        if (!result.ok) return this.fail(character, action, result.message);
        message = `[${character.story!.events.at(-1)!.timeline}] ${result.message}`; durationMinutes = 30; break;
      }
      case "collect_recycling":
        character.location = "Riverfront Recycling Center";
        character.cash += 18;
        character.grit += 2;
        character.needs.energy = Math.max(0, character.needs.energy - 6);
        durationMinutes = 45;
        message = "The machine counts cans without looking at you. $18.";
        break;
      case "eat_diner":
        if (character.cash < 6) return this.fail(character, action, "A counter plate costs $6.");
        character.cash -= 6;
        character.needs.hunger = Math.min(100, character.needs.hunger + 36);
        character.needs.morale = Math.min(100, character.needs.morale + 5);
        character.location = "Mara's Diner";
        durationMinutes = 20;
        message = "Mara leaves the coffee pot. She has seen mornings like this.";
        break;
      case "day_labor":
        if (character.needs.energy < 15) return this.fail(character, action, "Too exhausted to finish a shift.");
        character.cash += 42;
        character.shiftsWorked += 1;
        character.incomeConsistency = Math.min(100, character.incomeConsistency + 12);
        character.grit += character.shiftsWorked % 4 === 0 ? 8 : 3;
        character.needs.energy = Math.max(0, character.needs.energy - 14);
        character.needs.hunger = Math.max(0, character.needs.hunger - 9);
        character.location = "Halvern Day-Labor Lot";
        durationMinutes = 480;
        message = "Eight hours moving drywall. The foreman pays in twenties and apology.";
        break;
      case "claim_shelter":
        if (character.cash < 50) return this.fail(character, action, "Dana needs proof you can cover transit and meals for the week: $50 cash on hand.");
        character.housing = "shelter";
        character.questStep = Math.max(character.questStep, 2);
        character.location = "Mercy House Shelter";
        character.lastSafeCheckpoint = { housing: "shelter", location: character.location, cash: character.cash };
        message = "Dana slides over a key tag: C-14. Curfew is ten.";
        break;
      case "sleep_shelter":
        if (character.housing !== "shelter") return this.fail(character, action, "You do not have a shelter bed.");
        character.shelterDays += 1;
        character.sobrietyDays += 1;
        character.needs = { hunger: Math.max(20, character.needs.hunger - 12), energy: 100, hygiene: Math.min(100, character.needs.hygiene + 18), morale: Math.min(100, character.needs.morale + 8) };
        character.grit += [7, 30, 60, 90].includes(character.sobrietyDays) ? 25 : 2;
        character.location = "Mercy House Shelter";
        durationMinutes = 480;
        message = `Night ${character.shelterDays}. C-14 still has your name on it.`;
        break;
      case "attend_visitation":
        if (character.questStep < 3) return this.fail(character, action, "The visit has not been scheduled yet.");
        character.visitationAttendance = 100;
        character.questStep = 4;
        character.act = 2;
        character.grit += 20;
        character.location = "Halvern Family Center";
        durationMinutes = 90;
        message = `${character.childName} leaves one crayon behind. You put it beside the photo.`;
        break;
      case "visit_sam":
        character.location = "Okafor Pawn & Repair";
        character.cash += 12;
        character.grit += 3;
        durationMinutes = 30;
        message = "Sam checks the lamp twice, then pays twelve. 'Trust the second look.'";
        break;
      case "travel":
        character.location = typeof params.destination === "string" ? params.destination.slice(0, 48) : "Downtown Transit Hub";
        durationMinutes = 12;
        message = `Transit to ${character.location}.`;
        break;
      case "busk":
        character.cash += 16;
        character.grit += 2;
        character.location = "Market Row";
        durationMinutes = 60;
        message = "Three songs, one request, sixteen dollars.";
        break;
      case "enlist":
        if (character.act < 2) return this.fail(character, action, "Finish Dana's first plan before choosing a path.");
        character.location = "Army Recruitment Center";
        character.activeObjective = "Complete The Score aptitude assessment.";
        character.grit += 5;
        durationMinutes = 60;
        message = "A clipboard, a number-two pencil, and no promises.";
        break;
      case "safe_idle":
        character.status = "active";
        character.needs.energy = Math.min(100, character.needs.energy + 25);
        character.needs.hunger = Math.min(100, character.needs.hunger + 12);
        durationMinutes = 480;
        message = "Safe idle routine: ate, slept, kept the bed.";
        break;
    }

    if (character.questStep === 0 && character.cash >= 50) character.questStep = 1;
    if (character.questStep === 2 && character.shelterDays >= 7 && character.shiftsWorked >= 4) character.questStep = 3;
    character.activeObjective = objectiveFor(character);
    this.store.runtime(character.id).repeatedFailures = 0;
    if (agent) {
      character.actedWindow = character.decisionWindow;
      const runtime = this.store.runtime(character.id);
      runtime.missedWindows = 0;
      runtime.lastMissedAt = 0;
    }
    const spacingGameMs = this.clock.read().decisionSpacingSeconds * 1000;
    const durationGameMs = durationMinutes * 60_000;
    const nextGameMs = now + Math.max(spacingGameMs, durationGameMs);
    character.nextDecisionAt = new Date(nextGameMs).toISOString();
    character.status = durationMinutes >= 400 ? action === "sleep_shelter" ? "sleeping" : "working" : durationMinutes > 5 ? "traveling" : "active";
    character.actionLog.unshift({ at: this.clock.now(), action, detail: message });
    character.actionLog = character.actionLog.slice(0, 30);
    if (character.cash > previousCash) this.store.cashFaucets += character.cash - previousCash;
    if (character.cash < previousCash) this.store.cashSinks += previousCash - character.cash;
    return { ok: true, message, state: character };
  }

  observe(character: CharacterState) {
    const now = Date.now();
    const runtime = this.store.runtime(character.id);
    runtime.observedAt = runtime.observedAt.filter((time) => now - time < 60_000);
    if (runtime.observedAt.length >= 6) return { ok: false, error: "observe_rate_limited", retry_at: new Date(runtime.observedAt[0]! + 60_000).toISOString() };
    runtime.observedAt.push(now);
    const available = ACTIONS.map((name) => ({ name, params: name === "travel" ? { destination: "string" } : name === "story_decision" ? { choice: choices(character).join("|") } : {} }));
    return {
      ok: true,
      character: { id: character.id, name: character.name, mode: character.mode, status: character.status },
      surroundings: { location: character.location, nearby: this.nearby(character) },
      needs: character.needs,
      resources: { cash: character.cash, grit: character.grit, heat: character.heat, housing: character.housing, sobriety_days: character.sobrietyDays },
      inventory: character.inventory,
      objective: character.activeObjective,
      available_actions: available,
      next_decision_at: character.nextDecisionAt,
    };
  }

  hearing(character: CharacterState) {
    return calculateCustody({ housing: character.housing, incomeConsistency: character.incomeConsistency, record: character.record, sobrietyDays: character.sobrietyDays, visitationAttendance: character.visitationAttendance });
  }

  tick() {
    const now = this.clock.nowMs();
    const config = this.clock.read();
    for (const character of this.store.characters.values()) {
      const runtime = this.store.runtime(character.id);
      if (character.status === "stuck" && runtime.stuckSince && now - runtime.stuckSince >= config.stuckResetMinutes * 60_000) {
        Object.assign(character, character.lastSafeCheckpoint ?? {});
        character.status = "active";
        character.actionLog.unshift({ at: this.clock.now(), action: "checkpoint_reset", detail: "Returned to the last safe checkpoint." });
        runtime.stuckSince = null;
        runtime.missedWindows = 0;
      }
      if (character.mode === "agent" && now >= new Date(character.nextDecisionAt).getTime()) {
        const spacing = config.decisionSpacingSeconds * 1000;
        if (character.actedWindow === character.decisionWindow) {
          character.decisionWindow += 1;
          runtime.lastMissedAt = now;
          character.status = "active";
        } else if (now - runtime.lastMissedAt >= spacing) {
          runtime.missedWindows += 1;
          runtime.lastMissedAt = now;
          if (runtime.missedWindows >= config.stuckMissedWindows) this.park(character, "Missed three consecutive decision windows.");
        }
      }
    }
  }

  fail(character: CharacterState, action: string, message: string): ActionResult {
    const runtime = this.store.runtime(character.id);
    if (runtime.lastFailedAction === action) runtime.repeatedFailures += 1;
    else { runtime.lastFailedAction = action; runtime.repeatedFailures = 1; }
    if (runtime.repeatedFailures >= this.clock.read().stuckFailedActions) this.park(character, `Repeated failed action: ${action}.`);
    return { ok: false, message, state: character };
  }

  private park(character: CharacterState, reason: string) {
    const runtime = this.store.runtime(character.id);
    character.status = "stuck";
    runtime.stuckSince = this.clock.nowMs();
    character.needs.energy = Math.min(100, character.needs.energy + 20);
    character.needs.hunger = Math.min(100, character.needs.hunger + 15);
    character.actionLog.unshift({ at: this.clock.now(), action: "auto_park", detail: reason });
  }

  private nearby(character: CharacterState) {
    return [...this.store.characters.values()].filter((other) => other.id !== character.id && other.location === character.location).map((other) => ({ id: other.id, name: other.name, status: other.status }));
  }
}
