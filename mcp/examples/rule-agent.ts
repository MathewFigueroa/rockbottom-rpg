/**
 * Zero-LLM reference agent. It completes Act 1 by reading only compact observations,
 * choosing once, acting once, and waiting without inference between decisions.
 */
const server = process.env.GAME_SERVER_URL ?? "http://localhost:3000";
const token = process.env.ROCKBOTTOM_AGENT_TOKEN;
if (!token) throw new Error("Set ROCKBOTTOM_AGENT_TOKEN to the character token shown in the pause menu.");

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${server}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } });
  const body = await response.json() as any;
  if (!response.ok && response.status !== 202) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return body;
}

for (;;) {
  const observation = await api("/api/agent/observe", { method: "POST" });
  const action = choose(observation);
  process.stdout.write(`${new Date().toISOString()} ${action}\n`);
  await api("/api/agent/act", { method: "POST", body: JSON.stringify({ action, params: {} }) });
  if (observation.objective?.includes("Choose your line")) break;
  await waitForDecision();
}

function choose(observation: any) {
  const { needs, resources, objective } = observation;
  if (needs.hunger < 35 && resources.cash >= 6) return "eat_diner";
  if (objective.includes("Earn your first $50")) return resources.cash < 35 ? "collect_recycling" : "day_labor";
  if (objective.includes("Claim a bed")) return "claim_shelter";
  if (objective.includes("Hold the bed")) {
    const match = objective.match(/Bed (\d+)\/7, shifts (\d+)\/4/);
    const bed = Number(match?.[1] ?? 0), shifts = Number(match?.[2] ?? 0);
    return shifts < 4 && needs.energy >= 20 ? "day_labor" : bed < 7 ? "sleep_shelter" : "safe_idle";
  }
  if (objective.includes("supervised visitation")) return "attend_visitation";
  return "safe_idle";
}

async function waitForDecision() {
  for (;;) {
    const result = await api("/api/agent/wait");
    if (result.ready) return;
    const waitMs = Math.max(250, Math.min(10_000, new Date(result.retry_at).getTime() - Date.now()));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
