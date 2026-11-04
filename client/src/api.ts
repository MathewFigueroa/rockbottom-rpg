import type { CharacterState, ControlMode } from "@rockbottom/shared";

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
  hearing: (id: string) => json<{ score: number; level: string; factors: Record<string, number> }>(`/api/characters/${id}/hearing`),
  watch: (id: string) => json<{ character: CharacterState; actions: CharacterState["actionLog"]; planNotes: CharacterState["planNotes"]; spectatorCount: number }>(`/api/watch/${id}`),
};
