import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface Dashboard {
  clock: { gameTime: string; scale: number; paused: boolean; decisionSpacingSeconds: number; stuckMissedWindows: number; stuckFailedActions: number; stuckResetMinutes: number };
  players: Array<{ id: string; name: string; location: string; cash: number; status: string }>;
  packs: Array<{ id: string; version: string; enabled: boolean }>;
  moderation: Array<{ id: string; reason: string; flagNumber: number; status: string; penalty: string }>;
  economy: { faucets: number; sinks: number };
  spectators: number;
}

function App() {
  const demo = new URLSearchParams(location.search).has("demo");
  const [authed, setAuthed] = useState(demo);
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState("World clock");
  const [error, setError] = useState("");
  const load = async () => {
    const response = await fetch("/api/admin/dashboard", { credentials: "include", headers: demo ? { "x-admin-secret": "dev-admin" } : {} });
    if (!response.ok) { setAuthed(false); return; }
    setData(await response.json());
  };
  useEffect(() => { if (authed) void load(); }, [authed]);
  if (!authed) return <Login onSuccess={() => setAuthed(true)} error={error} setError={setError} />;
  return <DashboardView data={data} tab={tab} setTab={setTab} demo={demo} reload={load} />;
}

function Login({ onSuccess, error, setError }: { onSuccess: () => void; error: string; setError: (value: string) => void }) {
  const [username, setUsername] = useState("warden"); const [password, setPassword] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const response = await fetch("/api/admin/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }); if (response.ok) onSuccess(); else setError("Credentials not accepted."); };
  return <main className="login"><form onSubmit={submit}><div className="warden-mark">RB</div><small>HALVERN SHARD CONTROL</small><h1>Warden sign-in</h1><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p>{error}</p>}<button>Sign in</button></form></main>;
}

function DashboardView({ data, tab, setTab, demo, reload }: { data: Dashboard | null; tab: string; setTab: (tab: string) => void; demo: boolean; reload: () => Promise<void> }) {
  const updateClock = async (body: object) => { await fetch("/api/admin/clock", { method: "POST", credentials: "include", headers: { "content-type": "application/json", ...(demo ? { "x-admin-secret": "dev-admin" } : {}) }, body: JSON.stringify(body) }); await reload(); };
  const tabs = ["World clock", "Players", "Moderation", "Content packs", "Agent safety", "Economy"];
  return <main className="admin-shell" data-testid="admin-clock"><aside><div className="admin-brand"><span>RB</span><div><strong>WARDEN</strong><small>HALVERN 01</small></div></div><nav>{tabs.map((name) => <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}><i>{icon(name)}</i>{name}<b>{name === "Moderation" && data?.moderation.length ? data.moderation.length : ""}</b></button>)}</nav><footer><span className="online" /> SHARD HEALTHY<small>v1.0.0 · 64 CAP</small></footer></aside><section className="admin-main"><header><div><small>SHARD ADMINISTRATION</small><h1>{tab}</h1></div><div className="admin-summary"><span><small>PLAYERS</small>{data?.players.length ?? 0} / 64</span><span><small>SPECTATORS</small>{data?.spectators ?? 0}</span><button onClick={() => void reload()}>Refresh</button></div></header>{!data ? <div className="skeleton" /> : tab === "World clock" ? <ClockPanel data={data} update={updateClock} /> : tab === "Content packs" ? <PackPanel data={data} /> : tab === "Moderation" ? <ModerationPanel data={data} /> : tab === "Players" ? <PlayersPanel data={data} /> : tab === "Agent safety" ? <SafetyPanel data={data} update={updateClock} /> : <EconomyPanel data={data} />}</section></main>;
}

function ClockPanel({ data, update }: { data: Dashboard; update: (body: object) => Promise<void> }) {
  const time = new Date(data.clock.gameTime);
  return <div className="clock-page"><section className="clock-readout"><div><small>AUTHORITATIVE GAME TIME</small><strong>{time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong><span>{time.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span></div><div className={data.clock.paused ? "clock-state paused" : "clock-state"}><i />{data.clock.paused ? "PAUSED" : `RUNNING · ${data.clock.scale}×`}</div></section><section className="control-section"><header><div><small>SIMULATION RATE</small><h2>Clock scale</h2></div><p>All jobs, curfews, hearings, deployments, and paydays follow this clock.</p></header><div className="scale-buttons">{[1, 5, 10, 30, 60].map((scale) => <button key={scale} className={data.clock.scale === scale ? "selected" : ""} onClick={() => void update({ scale, paused: false })}>{scale}×<small>{scale === 1 ? "REAL TIME" : scale === 60 ? "TEST / EVENT" : "ACCELERATED"}</small></button>)}</div><div className="clock-actions"><button className={data.clock.paused ? "resume" : "pause"} onClick={() => void update({ paused: !data.clock.paused })}>{data.clock.paused ? "▶ Resume world" : "Ⅱ Pause world"}</button><button onClick={() => void update({ gameTime: new Date(time.getTime() + 86_400_000).toISOString() })}>Jump +1 day</button><button onClick={() => void update({ gameTime: new Date(time.getTime() + 7 * 86_400_000).toISOString() })}>Jump +7 days</button></div></section><section className="schedule"><header><small>NEXT SCHEDULED EVENTS</small><h2>World queue</h2></header><table><thead><tr><th>In game time</th><th>Event</th><th>Scope</th><th>Status</th></tr></thead><tbody><tr><td>22:00 today</td><td>Shelter curfew</td><td>Downtown shelters</td><td><span>QUEUED</span></td></tr><tr><td>Friday 00:01</td><td>Army payroll</td><td>Active duty</td><td><span>QUEUED</span></td></tr><tr><td>Day 30, 09:00</td><td>Custody docket</td><td>Whitfield Court</td><td><span>QUEUED</span></td></tr></tbody></table></section></div>;
}

function PackPanel({ data }: { data: Dashboard }) { return <section className="table-page"><p>{data.packs.length} validated content packs loaded at boot.</p><table><thead><tr><th>Pack</th><th>Version</th><th>Dependencies</th><th>State</th></tr></thead><tbody>{data.packs.map((pack) => <tr key={pack.id}><td><strong>{pack.id}</strong></td><td>{pack.version}</td><td>{pack.id === "base-city" ? "None" : "base-city"}</td><td><span className={pack.enabled ? "enabled" : "disabled"}>{pack.enabled ? "ENABLED" : "DISABLED"}</span></td></tr>)}</tbody></table></section>; }
function ModerationPanel({ data }: { data: Dashboard }) { return <section className="table-page"><p>Reports preserve a 30-second voice snapshot and nearby chat evidence.</p><table><thead><tr><th>Flag</th><th>Reason</th><th>Penalty</th><th>Status</th></tr></thead><tbody>{data.moderation.length ? data.moderation.map((item) => <tr key={item.id}><td>FLAG {item.flagNumber}</td><td>{item.reason}</td><td>{item.penalty}</td><td>{item.status}</td></tr>) : <tr><td colSpan={4}>No pending flags.</td></tr>}</tbody></table></section>; }
function PlayersPanel({ data }: { data: Dashboard }) { return <section className="table-page"><table><thead><tr><th>Character</th><th>Location</th><th>Cash</th><th>Status</th></tr></thead><tbody>{data.players.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.location}</td><td>${item.cash}</td><td>{item.status}</td></tr>)}</tbody></table></section>; }
function SafetyPanel({ data, update }: { data: Dashboard; update: (body: object) => Promise<void> }) { return <section className="settings-page"><h2>Decision gates</h2><label>Minimum spacing, game seconds<input value={data.clock.decisionSpacingSeconds} readOnly /><button onClick={() => void update({ decisionSpacingSeconds: 45 })}>Reset 45</button></label><label>Missed windows before park<input value={data.clock.stuckMissedWindows} readOnly /></label><label>Repeated failures before park<input value={data.clock.stuckFailedActions} readOnly /></label><label>Checkpoint reset, minutes<input value={data.clock.stuckResetMinutes} readOnly /></label></section>; }
function EconomyPanel({ data }: { data: Dashboard }) { return <section className="economy-page"><div><small>TOTAL FAUCETS</small><strong>${data.economy.faucets}</strong></div><div><small>TOTAL SINKS</small><strong>${data.economy.sinks}</strong></div><div><small>NET SUPPLY</small><strong>${data.economy.faucets - data.economy.sinks}</strong></div></section>; }
function icon(name: string) { return ({ "World clock": "◷", Players: "◉", Moderation: "⚑", "Content packs": "▦", "Agent safety": "◇", Economy: "$" } as Record<string, string>)[name]; }

createRoot(document.getElementById("root")!).render(<App />);
