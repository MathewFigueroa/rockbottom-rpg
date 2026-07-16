import { randomBytes, randomUUID } from "node:crypto";
import type { CharacterState, ClockState, ParentSex } from "@rockbottom/shared";

export interface CharacterCreateInput {
  name: string;
  sex: ParentSex;
  childName: string;
  childAge: number;
}

interface AgentRuntime {
  observedAt: number[];
  lastFailedAction: string;
  repeatedFailures: number;
  missedWindows: number;
  lastMissedAt: number;
  stuckSince: number | null;
}

export interface Crew {
  id: string;
  name: string;
  members: string[];
  allies: string[];
  feuds: string[];
  tags: string[];
  reputation: number;
}

export interface ModerationCase {
  id: string;
  reporterId: string;
  targetId: string;
  reason: string;
  evidence: { audioClip: string; chat: string[]; fingerprintHash: string };
  status: "pending" | "upheld" | "overturned";
  flagNumber: number;
  penalty: string;
  appealNotes: string;
  createdAt: string;
}

export class MemoryStore {
  readonly characters = new Map<string, CharacterState>();
  readonly runtimes = new Map<string, AgentRuntime>();
  readonly crews = new Map<string, Crew>();
  readonly moderationCases: ModerationCase[] = [];
  readonly chat: Array<{ id: string; characterId: string; channel: string; message: string; at: string }> = [];
  readonly bans = new Map<string, { until: string | null; kind: string }>();
  readonly packDisabled = new Set<string>();
  cashFaucets = 0;
  cashSinks = 0;

  createCharacter(input: CharacterCreateInput): CharacterState {
    const id = randomUUID();
    const now = new Date();
    const character: CharacterState = {
      id,
      name: input.name.trim().slice(0, 24) || "Alex",
      sex: input.sex,
      childName: input.childName.trim().slice(0, 24) || "Riley",
      childAge: Math.max(6, Math.min(10, Math.floor(input.childAge))),
      agentToken: `rb_${randomBytes(24).toString("base64url")}`,
      mode: "manual",
      cash: 4,
      grit: 0,
      heat: 0,
      needs: { hunger: 58, energy: 42, hygiene: 35, morale: 28 },
      housing: "underpass",
      location: "Route 9 Underpass",
      act: 1,
      questStep: 0,
      shelterDays: 0,
      shiftsWorked: 0,
      sobrietyDays: 1,
      record: 0,
      incomeConsistency: 0,
      visitationAttendance: 0,
      inventory: ["creased-photo"],
      tapes: [],
      activeObjective: "Earn your first $50. The recycling cart is east of the underpass.",
      nextDecisionAt: now.toISOString(),
      decisionWindow: 1,
      actedWindow: 0,
      status: "active",
      actionLog: [{ at: now.toISOString(), action: "wake", detail: "Dawn under Route 9. The photo is still in your coat." }],
      planNotes: [],
      spectatorCount: 0,
      lastSafeCheckpoint: null,
    };
    this.characters.set(id, character);
    this.runtimes.set(id, { observedAt: [], lastFailedAction: "", repeatedFailures: 0, missedWindows: 0, lastMissedAt: 0, stuckSince: null });
    return character;
  }

  getByToken(token: string | undefined): CharacterState | undefined {
    if (!token) return undefined;
    return [...this.characters.values()].find((character) => character.agentToken === token);
  }

  runtime(id: string): AgentRuntime {
    const found = this.runtimes.get(id);
    if (!found) throw new Error("Character runtime missing");
    return found;
  }
}

export class GameClock {
  private anchorReal = Date.now();
  private anchorGame = Date.now();
  private state: ClockState = {
    gameTime: new Date().toISOString(),
    scale: 1,
    paused: false,
    decisionSpacingSeconds: Number(process.env.DECISION_SPACING_SECONDS ?? 45),
    stuckMissedWindows: Number(process.env.STUCK_MISSED_WINDOWS ?? 3),
    stuckFailedActions: Number(process.env.STUCK_FAILED_ACTIONS ?? 5),
    stuckResetMinutes: Number(process.env.STUCK_RESET_MINUTES ?? 30),
  };

  nowMs(): number {
    if (this.state.paused) return this.anchorGame;
    return this.anchorGame + (Date.now() - this.anchorReal) * this.state.scale;
  }

  now(): string { return new Date(this.nowMs()).toISOString(); }

  read(): ClockState { return { ...this.state, gameTime: this.now() }; }

  update(input: Partial<ClockState>): ClockState {
    const current = this.nowMs();
    this.anchorGame = input.gameTime ? new Date(input.gameTime).getTime() : current;
    this.anchorReal = Date.now();
    if (typeof input.scale === "number") this.state.scale = Math.max(1, Math.min(60, input.scale));
    if (typeof input.paused === "boolean") this.state.paused = input.paused;
    if (typeof input.decisionSpacingSeconds === "number") this.state.decisionSpacingSeconds = Math.max(1, input.decisionSpacingSeconds);
    if (typeof input.stuckMissedWindows === "number") this.state.stuckMissedWindows = Math.max(1, Math.floor(input.stuckMissedWindows));
    if (typeof input.stuckFailedActions === "number") this.state.stuckFailedActions = Math.max(2, Math.floor(input.stuckFailedActions));
    if (typeof input.stuckResetMinutes === "number") this.state.stuckResetMinutes = Math.max(1, input.stuckResetMinutes);
    return this.read();
  }
}
