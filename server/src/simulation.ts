import { awardRecords } from "./records.js";
import { socialAction, settleSocial } from "./social.js";
import { narrate } from "./narrative.js";
import { streetAction, settleStreet } from "./streets.js";
import { armyAction, settleArmy } from "./army.js";
import { randomBytes } from "node:crypto";
import { advanceQuest, campaignView } from "./campaign.js";
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
    if (character.campaign?.perspective === "adult-child" && action !== "quest_choice") return { ok: false, message: "The archive cannot rewrite the parent’s actions.", state: character };
    if (character.status === "dead" && action !== "quest_choice") return { ok: false, message: "This life has ended.", state: character };
    if (!ACTIONS.includes(action as GameAction)) return this.fail(character, action, "Unknown action.");
    const now = this.clock.nowMs();
    const seed = () => this.store.runtime(character.id).randomSeed ??= randomBytes(32).toString('hex');
    this.store.cashFaucets += settleArmy(character, now, seed()) + settleStreet(character, now);
    if (character.status === 'dead' && action !== 'quest_choice') return { ok: false, message: 'This life has ended.', state: character };
    settleSocial(character, now);
    if (character.army?.deployed) return { ok: false, message: 'The rotation resolves at the scheduled return.', retry_at: character.army.deployed.due, state: character };
    if (character.street?.courier) return { ok: false, message: 'The courier route is in progress.', retry_at: character.street.courier.due, state: character };
    const jailed = character.street?.legal?.status === 'jailed';
    if (jailed && action !== 'street_action') return { ok: false, message: 'Only legal-aid decisions are available until release.', retry_at: character.street!.legal!.hearingAt, state: character };
    const legalInput = jailed && action === 'street_action' && ['call-dana', 'restitution'].includes(String(params.op));
    const microInput = action === 'army_action' && ['answer', 'finish-assessment', 'input'].includes(String(params.op));
    const availableAt = new Date(character.nextDecisionAt).getTime();
    if (now < availableAt && !microInput && !legalInput) {
      return { ok: false, message: "The simulation is between decision points.", retry_at: character.nextDecisionAt, state: character };
    }
    if (agent && character.actedWindow === character.decisionWindow) character.decisionWindow += 1;

    const previousCash = character.cash;
    let durationMinutes = 1;
    let message = "Done.";
    let instant = false;
    switch (action as GameAction) {
      case 'life_action': {
        const result = socialAction(character, this.store, params, now, seed());
        if (!result.ok) return this.fail(character, action, result.message);
        message = result.message; durationMinutes = result.minutes; break;
      }
      case 'street_action': {
        const result = streetAction(character, this.store, params, now, seed());
        if (!result.ok) return this.fail(character, action, result.message);
        message = result.message; durationMinutes = result.minutes; break;
      }
      case 'army_action': {
        const result = armyAction(character, params, now, this.clock.read().scale);
        if (!result.ok) return this.fail(character, action, result.message);
        message = result.message; durationMinutes = result.minutes; instant = !!result.instant; break;
      }
      case "quest_choice": {
        const result = advanceQuest(character, params, this.clock.now(), () => {
          const runtime = this.store.runtime(character.id);
          return runtime.randomSeed ??= randomBytes(32).toString('hex');
        });
        if (!result.ok) return this.fail(character, action, result.message);
        message = result.message; durationMinutes = result.minutes; break;
      }
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
        if (["underpass", "tent"].includes(character.housing)) return this.fail(character, action, "You do not have an indoor bed.");
        character.shelterDays += 1;
        character.sobrietyDays += 1;
        character.needs = { hunger: Math.max(20, character.needs.hunger - 12), energy: 100, hygiene: Math.min(100, character.needs.hygiene + 18), morale: Math.min(100, character.needs.morale + 8) };
        character.grit += [7, 30, 60, 90].includes(character.sobrietyDays) ? 25 : 2;
        character.location = character.housing === "shelter" ? "Mercy House Shelter" : "Home";
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
    character.activeObjective = campaignView(character).quests[0]?.objective ?? objectiveFor(character);
    this.store.runtime(character.id).repeatedFailures = 0;
    if (agent) {
      character.actedWindow = character.decisionWindow;
      const runtime = this.store.runtime(character.id);
      runtime.missedWindows = 0;
      runtime.lastMissedAt = 0;
    }
    const spacingGameMs = this.clock.read().decisionSpacingSeconds * 1000;
    const durationGameMs = durationMinutes * 60_000;
    const nextGameMs = instant ? now : now + Math.max(spacingGameMs, durationGameMs);
    character.nextDecisionAt = character.street?.legal?.status === 'jailed' ? character.street.legal.hearingAt! : new Date(nextGameMs).toISOString();
    if (character.status !== "dead") character.status = durationMinutes >= 400 ? action === "sleep_shelter" ? "sleeping" : "working" : durationMinutes > 5 ? "traveling" : "active";
    awardRecords(character);
    if (!['input', 'answer'].includes(String(params.op))) narrate(character, this.clock.now(), action, message, 'choice', false);
    if (agent && character.director?.shareSummaries && (typeof params.summary === 'string' || typeof params.scene === 'string')) {
      character.agentVoice = { at: this.clock.now(), action, modelLabel: character.director.modelLabel, summary: typeof params.summary === 'string' ? params.summary.slice(0, 400) : '', scene: typeof params.scene === 'string' ? params.scene.slice(0, 800) : '' };
    }
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
    const available = ACTIONS.map((name) => ({ name, params: name === "travel" ? { destination: "string" } : name === "story_decision" ? { choice: choices(character).join("|") } : name === "life_action" ? { op: "get_story_state" } : name === "street_action" ? { op: "get_story_state" } : name === "army_action" ? { op: "get_story_state" } : name === "quest_choice" ? { quest: "get_story_state", choice: "option_id", confirmPermanentDeath: "boolean" } : {} }));
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
      this.store.cashFaucets += settleArmy(character, now, this.store.runtime(character.id).randomSeed ??= randomBytes(32).toString('hex')) + settleStreet(character, now);
      settleSocial(character, now); awardRecords(character);
      if (character.status === "dead" || character.campaign?.perspective === 'adult-child' || character.army?.deployed || character.army?.phase === 'assessment' || character.army?.drill || character.street?.legal?.status === 'jailed' || character.street?.courier) continue;
      const runtime = this.store.runtime(character.id);
      if (character.status === "stuck" && runtime.stuckSince && now - runtime.stuckSince >= config.stuckResetMinutes * 60_000) {
        // Recovery moves the actor; it must never roll back wages, evidence or quest state.
        if (character.lastSafeCheckpoint?.location) character.location = character.lastSafeCheckpoint.location;
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
    if (character.status === "dead" || character.status === "stuck" || character.street?.legal?.status === 'jailed' || character.army?.deployed) return;
    const runtime = this.store.runtime(character.id);
    character.status = "stuck";
    runtime.stuckSince = this.clock.nowMs();
    character.needs.energy = Math.min(100, character.needs.energy + 20);
    character.needs.hunger = Math.min(100, character.needs.hunger + 15);
    character.actionLog.unshift({ at: this.clock.now(), action: "auto_park", detail: reason });
  }

  private nearby(character: CharacterState) {
    return [...this.store.characters.values()].filter((other) => other.id !== character.id && other.location === character.location).slice(-3).map((other) => ({ id: other.id, name: other.name, status: other.status }));
  }
}
