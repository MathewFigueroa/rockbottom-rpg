export interface LifeCommand { action: string; label: string; params: Record<string, string | number | boolean>; consent?: boolean; blocked?: string }
export interface LifeView { title: string; summary: string[]; commands: LifeCommand[] }
export interface ChronicleEvent { id: string; at: string; chapter: string; text: string; kind: 'choice' | 'consequence' | 'letter' }
export interface ArmyState {
  version: 1; phase: 'assessment' | 'training' | 'active' | 'terminal-leave' | 'discharged';
  assessment: { index: number; correct: number; deadline: string; finished: boolean };
  trainingDays: number; discipline: number;
  drill?: { index: number; mistakes: number; deadline: string };
  term: number; termEnd?: string; nextPay?: string; nextOffer?: string;
  paychecks: number; grossPaid: number; supportPaid: number; rank: 'E-1' | 'E-2' | 'E-3' | 'E-4'; allotment: number;
  squad: { petty: boolean; dominguez: boolean; bond: number };
  rotation: number;
  offer?: { id: number; expires: string; days: number; baseRisk: number };
  deployed?: { id: number; due: string; risk: number; squadRisk: number; gross: number; withSquad: boolean; tactic: string };
  history: Array<{ id: number; at: string; risk: number; roll: number; survived: boolean; petty: boolean; dominguez: boolean }>;
}
export interface MarketState { day: number; serial: number; offers: Record<string, { price: number; stock: number }> }
export interface StreetItem { id: string; sku: string; paid: number; inspected: boolean; defective?: boolean; repaired: boolean; stolen: boolean }
export interface StreetEvidence { id: string; kind: 'fencing' | 'fraud'; at: string; resolved: boolean; restitution: boolean }
export interface StreetState {
  version: 1; caseNumber?: number; items: StreetItem[]; evidence: StreetEvidence[];
  lastCourierDay: number; courier?: { id: string; due: string; deadline: string; opened: boolean };
  legal?: { id: string; status: 'summons' | 'jailed' | 'released' | 'closed'; evidence: string[]; escrow: number; hearingAt?: string; defender: boolean; called: boolean; outcome?: 'diversion' | 'convicted' };
  communityDays: number; repairedCase?: string;
}
