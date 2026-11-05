import type { ArmyState, LifeView, ChronicleEvent } from "./life.js";
export * from "./life.js";
import type { CampaignState } from "./campaign.js";
export * from "./campaign.js";
export type ParentSex = "male" | "female";
export type ControlMode = "manual" | "agent";
export type HousingTier = "underpass" | "tent" | "shelter" | "sro" | "studio" | "two-bedroom";
export type SkillName = "labor" | "hustle" | "discipline" | "charm" | "combat";

export interface Needs {
  hunger: number;
  energy: number;
  hygiene: number;
  morale: number;
}

export interface CharacterState {
  army?: ArmyState;
  lifeView?: LifeView;
  chronicle?: ChronicleEvent[];
  campaign?: CampaignState;
  storyChoices?: string[];
  campaignView?: CampaignState & { quests: Array<{ id: string; title: string; step: number; total: number; objective: string; options: Array<{ id: string; text: string; blocked?: string; fatalRisk: number }> }> };
  story?: { version: 1; stage: number; path: "street" | "army" | null; choice: string | null; events: Array<{ sequence: number; timeline: string; title: string; text: string }> };
  id: string;
  name: string;
  sex: ParentSex;
  childName: string;
  childAge: number;
  agentToken: string;
  mode: ControlMode;
  cash: number;
  grit: number;
  heat: number;
  needs: Needs;
  housing: HousingTier;
  location: string;
  act: 1 | 2 | 3;
  questStep: number;
  shelterDays: number;
  shiftsWorked: number;
  sobrietyDays: number;
  record: number;
  incomeConsistency: number;
  visitationAttendance: number;
  inventory: string[];
  tapes: string[];
  activeObjective: string;
  nextDecisionAt: string;
  decisionWindow: number;
  actedWindow: number;
  status: "active" | "traveling" | "working" | "sleeping" | "stuck" | "dead";
  actionLog: Array<{ at: string; action: string; detail: string }>;
  planNotes: Array<{ at: string; text: string }>;
  spectatorCount: number;
  lastSafeCheckpoint: Partial<CharacterState> | null;
}

export interface ClockState {
  gameTime: string;
  scale: number;
  paused: boolean;
  decisionSpacingSeconds: number;
  stuckMissedWindows: number;
  stuckFailedActions: number;
  stuckResetMinutes: number;
}

export interface CustodyFactors {
  housing: number;
  income: number;
  record: number;
  sobriety: number;
  visitation: number;
}

export interface CustodyOutcome {
  score: number;
  level: "supervised" | "unsupervised" | "weekends" | "shared";
  factors: CustodyFactors;
}

export function calculateCustody(input: {
  housing: HousingTier;
  incomeConsistency: number;
  record: number;
  sobrietyDays: number;
  visitationAttendance: number;
}): CustodyOutcome {
  const housingScores: Record<HousingTier, number> = {
    underpass: 0,
    tent: 0.1,
    shelter: 0.35,
    sro: 0.65,
    studio: 0.85,
    "two-bedroom": 1,
  };
  const factors = {
    housing: housingScores[input.housing],
    income: Math.max(0, Math.min(1, input.incomeConsistency / 100)),
    record: Math.max(0, 1 - input.record / 10),
    sobriety: Math.max(0, Math.min(1, input.sobrietyDays / 90)),
    visitation: Math.max(0, Math.min(1, input.visitationAttendance / 100)),
  };
  const score = Math.round((factors.housing * 0.3 + factors.income * 0.25 + factors.record * 0.2 + factors.sobriety * 0.15 + factors.visitation * 0.1) * 100);
  const level = score >= 82 ? "shared" : score >= 62 ? "weekends" : score >= 40 ? "unsupervised" : "supervised";
  return { score, level, factors };
}

export const ACTIONS = [
  "collect_recycling",
  "eat_diner",
  "day_labor",
  "claim_shelter",
  "sleep_shelter",
  "attend_visitation",
  "visit_sam",
  "travel",
  "busk",
  "enlist",
  "safe_idle",
  "story_decision",
  "quest_choice",
  "army_action",
] as const;
export type GameAction = (typeof ACTIONS)[number];

/** Spoiler-free decision prompts; revealed scenes remain server-authoritative. */
export const STORY_PROMPTS = [
  "A clerk asks about your signature on the Route 9 evacuation ledger. Open the record?",
  "Trace the duplicate through Nell's street witnesses or Vale's Army logistics archive. Each route puts a different ally at risk.",
  "Authenticate the addresses with your chosen ally. A duplicate without a witness proves very little.",
  "Floodwater threatens Mercy House. Rescue six residents and lose the original ledger, or secure the ledger while Nell evacuates without you. Sam may be hurt helping her. Neither choice can be undone.",
  "Dana, Sam and Vale each withheld part of the record to protect someone. Hear their accounts before deciding what the city may know.",
  "Publish the witness addresses to accelerate the audit, or submit sealed testimony to protect residents at the cost of delay. Custody still depends on sustained care.",
  "The inquiry is on the front page. Tuesday’s visit falls during the audit briefing. Keep the visit, or attend the briefing and accept another absence on the family-court record.",
  "A lawyer offers to circulate the case file. Release a redacted public record, or keep it within the legal process. Neither choice can unpublish addresses already disclosed.",
  "The inquiry has become a record. Prepare housing and hear the separate family-court order before entering the adult child’s archive.",
] as const;
export const STORY_CHOICES = [['open_record'], ['street', 'army'], ['verify_copy'], ['save_neighbors', 'secure_ledger'], ['hear_witnesses', 'challenge_dana', 'challenge_vale'], ['publish_names', 'protect_witnesses'], ['return_tuesday', 'follow_audit'], ['release_record', 'keep_private'], []] as const;
