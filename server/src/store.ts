import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import type { CharacterState, ClockState, ParentSex } from "@rockbottom/shared";

export interface CharacterCreateInput {
  name: string;
  sex: ParentSex;
  childName: string;
  childAge: number;
}

interface AgentRuntime {
  randomSeed?: string;
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
  clockState: ClockState | undefined;
  readonly owners = new Map<string, string>();
  constructor(private readonly savePath?: string) {
    if (!savePath || !existsSync(savePath)) return;
    this.restore(JSON.parse(readFileSync(savePath, "utf8")));
  }
  snapshot(): WorldSnapshot {
    return structuredClone({ version: 1, clockState: this.clockState,
      characters: [...this.characters], runtimes: [...this.runtimes], crews: [...this.crews],
      bans: [...this.bans], owners: [...this.owners], moderationCases: this.moderationCases,
      chat: this.chat.slice(-500), packDisabled: [...this.packDisabled],
      cashFaucets: this.cashFaucets, cashSinks: this.cashSinks });
  }
  restore(data: WorldSnapshot) {
    if (data.version !== 1) throw new Error("Unsupported save version");
    for (const key of ["characters", "runtimes", "crews", "bans", "owners"] as const) {
      if (!Array.isArray(data[key])) throw new Error(`Invalid world snapshot: ${key}`);
    }
    for (const key of ["characters", "runtimes", "crews", "bans", "owners"] as const) {
      this[key].clear();
      for (const [id, value] of data[key]) (this[key] as Map<string, unknown>).set(id, structuredClone(value));
    }
    this.moderationCases.splice(0, this.moderationCases.length, ...structuredClone(data.moderationCases));
    this.chat.splice(0, this.chat.length, ...structuredClone(data.chat));
    this.packDisabled.clear();
    for (const id of data.packDisabled) this.packDisabled.add(id);
    this.clockState = data.clockState;
    this.cashFaucets = data.cashFaucets; this.cashSinks = data.cashSinks;
    for (const c of this.characters.values()) c.spectatorCount = 0;
  }
  save() {
    if (!this.savePath) return;
    mkdirSync(dirname(this.savePath), { recursive: true });
    writeFileSync(`${this.savePath}.tmp`, JSON.stringify(this.snapshot()), { mode: 0o600 });
    renameSync(`${this.savePath}.tmp`, this.savePath);
  }
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
    this.runtimes.set(id, { randomSeed: randomBytes(32).toString("hex"), observedAt: [], lastFailedAction: "", repeatedFailures: 0, missedWindows: 0, lastMissedAt: 0, stuckSince: null });
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

export interface WorldSnapshot {
  version: 1;
  clockState?: ClockState;
  characters: Array<[string, CharacterState]>;
  runtimes: Array<[string, AgentRuntime]>;
  crews: Array<[string, Crew]>;
  bans: Array<[string, { until: string | null; kind: string }]>;
  owners: Array<[string, string]>;
  moderationCases: ModerationCase[];
  chat: MemoryStore["chat"];
  packDisabled: string[];
  cashFaucets: number;
  cashSinks: number;
}
