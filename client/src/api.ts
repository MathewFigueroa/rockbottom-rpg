import type { CharacterState, ControlMode, ClockState } from "@rockbottom/shared";

const API = import.meta.env.VITE_API_URL ?? "";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${url}`, { ...init, credentials: "include", headers: { "content-type": "application/json", ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(body.message ?? body.error ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

export const api = {
  createCharacter: (input: { name: string; sex: "male" | "female"; childName: string; childAge: number }) => json<CharacterState>("/api/characters", { method: "POST", body: JSON.stringify(input) }),
  character: (id: string) => json<CharacterState>(`/api/characters/${id}`),
  action: (id: string, action: string, params: Record<string, unknown> = {}) => json<{ ok: boolean; message: string; state: CharacterState }>(`/api/characters/${id}/action`, { method: "POST", body: JSON.stringify({ action, params }) }),
  mode: (id: string, mode: ControlMode) => json<CharacterState>(`/api/characters/${id}/mode`, { method: "POST", body: JSON.stringify({ mode }) }),
  recover: (id: string, recoveryCode: string) => json<{ id: string }>('/api/recover', { method: 'POST', body: JSON.stringify({ id, recoveryCode }) }),
  recoveryCode: (id: string) => json<{ recoveryCode: string }>(`/api/characters/${id}/recovery-code`, { method: 'POST', body: '{}' }),
  rotateToken: (id: string) => json<{ agentToken: string }>(`/api/characters/${id}/agent-token`, { method: 'POST', body: '{}' }),
  chat: (id: string) => json<Array<{ id: string; characterId: string; channel: string; message: string }>>(`/api/characters/${id}/chat`),
  people: () => json<Array<{ id: string; name: string; location: string }>>('/api/people'),
  sendChat: (id: string, input: { channel: string; message: string; recipientId?: string }) => json(`/api/chat`, { method: 'POST', body: JSON.stringify({ characterId: id, ...input }) }),
  records: (id: string) => json<Array<{ id: string; name: string; content: string }>>(`/api/characters/${id}/records`),
  director: (id: string, input: { brief: string; shareSummaries: boolean }) => json<{ ok: boolean }>(`/api/characters/${id}/director`, { method: "POST", body: JSON.stringify(input) }),
  hearing: (id: string) => json<{ score: number; level: string; factors: Record<string, number> }>(`/api/characters/${id}/hearing`),
  watch: (id: string) => json<{ clock?: ClockState; character: CharacterState; actions: CharacterState["actionLog"]; planNotes: CharacterState["planNotes"]; spectatorCount: number }>(`/api/watch/${id}`),
};
