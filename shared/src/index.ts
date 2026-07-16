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
] as const;
export type GameAction = (typeof ACTIONS)[number];
