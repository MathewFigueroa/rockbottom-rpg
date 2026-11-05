import { useCallback, useEffect, useMemo, useState } from "react";
import { STORY_PROMPTS, STORY_CHOICES, type CharacterState, type ControlMode } from "@rockbottom/shared";
import { api } from "./api";
import { GameCanvas } from "./GameCanvas";

type Screen = "title" | "creation" | "game";

export function App() {
  const pathMatch = window.location.pathname.match(/^\/watch\/([^/]+)/);
  if (pathMatch?.[1]) return <Spectator characterId={pathMatch[1]} />;
  const query = new URLSearchParams(window.location.search);
  const forced = query.get("screen") as Screen | null;
  const characterId = query.get("character");
  const [screen, setScreen] = useState<Screen>(forced ?? (characterId ? "game" : "title"));
  const [id, setId] = useState(characterId ?? "");
  const scene = query.get("scene") ?? "opening";
  if (screen === "title") return <TitleScreen onBegin={() => setScreen("creation")} onContinue={() => setScreen(id ? "game" : "creation")} />;
  if (screen === "creation") return <CharacterCreation onBack={() => setScreen("title")} onCreated={(character) => { setId(character.id); setScreen("game"); window.history.replaceState({}, "", `/?character=${character.id}&scene=opening`); }} />;
  return <GameShell characterId={id} scene={scene} onExit={() => setScreen("title")} />;
}

function TitleScreen({ onBegin, onContinue }: { onBegin: () => void; onContinue: () => void }) {
  return (
    <main className="title-screen" data-testid="title-screen">
      <div className="title-grain" />
      <div className="overpass-silhouette"><span /><span /><span /></div>
      <section className="title-copy">
        <p className="eyebrow">A persistent city. A second chance.</p>
        <img className="logo" src="/assets/logo.png" alt="ROCKBOTTOM: Second Wind" />
        <p className="title-deck">Start with four dollars, one photograph, and a morning you cannot postpone.</p>
        <div className="title-actions">
          <button className="primary" onClick={onBegin}>Begin again</button>
          <button className="quiet" onClick={onContinue}>Continue</button>
        </div>
        <p className="mode-note"><span className="status-dot" /> Manual play and AI agent control</p>
      </section>
      <footer className="title-footer"><span>HALVERN CITY</span><span>ONLINE SHARD 01</span><span>v1.0</span></footer>
    </main>
  );
}

function CharacterCreation({ onBack, onCreated }: { onBack: () => void; onCreated: (character: CharacterState) => void }) {
  const [form, setForm] = useState({ name: "Jamie", sex: "female" as "female" | "male", childName: "Riley", childAge: 8, brief: "Show me a life shaped by care, ambition and the consequences of promises.", shareSummaries: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { onCreated(await api.createCharacter(form)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create character"); setBusy(false); }
  };
  return (
    <main className="creation-screen" data-testid="character-creation">
      <header className="creation-header"><button className="icon-button" onClick={onBack} aria-label="Back">←</button><span>New character</span><span className="step-count">01 / 01</span></header>
      <form className="creation-layout" onSubmit={submit}>
        <section className="portrait-stage" aria-label="Character preview">
          <div className={`pixel-person ${form.sex}`}><span className="head"/><span className="body"/><span className="leg one"/><span className="leg two"/></div>
          <p>Route 9, 5:42 AM</p>
        </section>
        <section className="creation-form">
          <p className="eyebrow">Before the city knows you</p>
          <h1>Who got back up?</h1>
          <label>Your name<input value={form.name} maxLength={24} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <fieldset><legend>Parent</legend><div className="segmented"><button type="button" className={form.sex === "female" ? "selected" : ""} onClick={() => setForm({ ...form, sex: "female" })}>Woman</button><button type="button" className={form.sex === "male" ? "selected" : ""} onClick={() => setForm({ ...form, sex: "male" })}>Man</button></div></fieldset>
          <div className="form-row"><label>Child's name<input value={form.childName} maxLength={24} onChange={(event) => setForm({ ...form, childName: event.target.value })} required /></label><label>Age<select value={form.childAge} onChange={(event) => setForm({ ...form, childAge: Number(event.target.value) })}>{[6, 7, 8, 9, 10].map((age) => <option key={age}>{age}</option>)}</select></label></div>
          <label>Your brief for the agent<textarea value={form.brief} maxLength={1000} onChange={event => setForm({ ...form, brief: event.target.value })} /></label>
          <label><input type="checkbox" checked={form.shareSummaries} onChange={event => setForm({ ...form, shareSummaries: event.target.checked })} />Share the agent’s short decision summaries and scene interpretations with spectators</label>
          <div className="keepsake"><img src="/assets/items/creased-photo.png" alt="Creased photograph" /><div><strong>Creased photo</strong><p>Always with you. It cannot be sold, dropped, traded, or stolen.</p></div><span className="lock">LOCKED</span></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary full" disabled={busy}>{busy ? "Entering Halvern..." : "Wake beneath Route 9"}</button>
        </section>
      </form>
    </main>
  );
}

function GameShell({ characterId, scene, onExit }: { characterId: string; scene: string; onExit: () => void }) {
  const [character, setCharacter] = useState<CharacterState | null>(null);
  const [message, setMessage] = useState("");
  const [pause, setPause] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visitationOpen, setVisitationOpen] = useState(false);
  const [campaignPanel, setCampaignPanel] = useState<"story" | "quests" | "life" | "records">("story");
  const load = useCallback(async () => {
    if (!characterId) return;
    try { setCharacter(await api.character(characterId)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Character unavailable"); }
  }, [characterId]);
  useEffect(() => { void load(); }, [load]);
  const act = async (action: string, params: Record<string, unknown> = {}, force = false) => {
    if (!character || busy) return;
    if (action === "attend_visitation" && !force) { setVisitationOpen(true); return; }
    setBusy(true);
    try { const result = await api.action(character.id, action, params); const updated = await api.character(character.id); setCharacter(updated); setCampaignPanel(["army_action", "street_action", "life_action"].includes(action) ? "life" : updated.storyChoices?.length ? "story" : "quests"); setMessage(["story_decision", "quest_choice", "army_action", "street_action", "life_action"].includes(action) ? "" : result.message); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Action failed"); } finally { setBusy(false); }
  };
  const setMode = async (mode: ControlMode) => { if (!character) return; setCharacter(await api.mode(character.id, mode)); };
  if (error) return <main className="fatal"><h1>Halvern is out of reach</h1><p>{error}</p><button onClick={onExit}>Return to title</button></main>;
  if (!character) return <main className="loading" aria-label="Loading Halvern"><span /><span /><span /></main>;
  const effectiveScene = normalizeScene(scene, character);
  const night = effectiveScene === "night";
  return (
    <main className={`game-shell scene-${effectiveScene}`} data-testid="game-shell">
      <GameCanvas scene={effectiveScene} location={character.location} night={night} />
      <div className="world-label"><span>{sceneTitle(effectiveScene)}</span><small>{sceneDistrict(effectiveScene)}</small></div>
      <header className="hud-top">
        <button className="character-chip" onClick={() => setPause(true)}><span className="mini-avatar">{character.name[0]}</span><span><strong>{character.name}</strong><small>{character.housing.toUpperCase()}</small></span></button>
        <div className="needs" aria-label="Character needs">
          <Need label="Hunger" icon="●" value={character.needs.hunger} />
          <Need label="Energy" icon="↯" value={character.needs.energy} />
          <Need label="Hygiene" icon="◆" value={character.needs.hygiene} />
          <Need label="Morale" icon="▲" value={character.needs.morale} />
        </div>
        <div className="resources"><span><small>CASH</small>${character.cash}</span><span><small>GRIT</small>{character.grit}</span><span className={character.heat > 20 ? "hot" : ""}><small>HEAT</small>{character.heat}</span></div>
        <button className="pause-button" onClick={() => setPause(true)} aria-label="Pause menu">Ⅱ</button>
      </header>
      <aside className="objective-panel"><div className="objective-number">{String(character.questStep + 1).padStart(2, "0")}</div><div><small>ACT {character.act}: {character.act === 1 ? "THE FLOOR" : character.act === 2 ? "THE LADDER" : "THE FRAME"}</small><strong>{character.activeObjective}</strong></div></aside>
      <div className="location-pip"><span>⌖</span>{character.location}</div>
      {message && <button className="toast" onClick={() => setMessage("")}>{message}</button>}
      {character.act >= 2 && <nav className="campaign-tabs" aria-label="Campaign view"><button onClick={() => setCampaignPanel("story")} aria-pressed={campaignPanel === "story"}>Story</button><button onClick={() => setCampaignPanel("quests")} aria-pressed={campaignPanel === "quests"}>Quests</button><button onClick={() => setCampaignPanel("life")} aria-pressed={campaignPanel === "life"}>Life</button><button onClick={() => setCampaignPanel("records")} aria-pressed={campaignPanel === "records"}>Records</button></nav>}
      {character.act >= 2 && campaignPanel === "story" && <section className="dialogue-panel story-dialogue" aria-label="Second Wind story"><div><small>{character.story?.events.at(-1)?.timeline ?? 'THE SECOND COPY'}</small><p>{character.story?.events.at(-1)?.text ?? 'A clerk has a question about your signature. Open the record.'}</p><p>{STORY_PROMPTS[character.story?.stage ?? 0]}</p><div className="choice-list">{(character.storyChoices ?? []).map(choice => <button key={choice} disabled={busy} onClick={() => void act('story_decision', { choice })}>{choice.replaceAll('_', ' ')}</button>)}</div></div></section>}
      {character.act >= 2 && campaignPanel === "quests" && <QuestJournal character={character} busy={busy} act={act} />}
      {character.act >= 2 && campaignPanel === "life" && <LifePanel character={character} busy={busy} act={act} />}
      {character.act >= 2 && campaignPanel === "records" && <RecordsPanel characterId={character.id} />}
      <ActionDock character={character} busy={busy} act={act} />
      <TouchControls onAction={() => void act(recommendedAction(character))} />
      {effectiveScene === "opening" && <OpeningPanel character={character} onClose={() => setMessage("The cart waits east of the pillar.")} />}
      {effectiveScene === "sam" && <SamDialogue />}
      {effectiveScene === "day-labor" && <ShiftOverlay character={character} />}
      {effectiveScene === "hearing" && <HearingOverlay character={character} />}
      {effectiveScene === "agent" && <AgentTicker character={character} />}
      {effectiveScene === "crew" && <CrewOverlay />}
      {effectiveScene === "army" && <ArmyOverlay />}
      {visitationOpen && <VisitationPanel character={character} onComplete={() => { setVisitationOpen(false); void act("attend_visitation", {}, true); }} />}
      {effectiveScene === "reveal" && !character.story && <FrameOverlay />}
      {(effectiveScene === "forgiveness" || effectiveScene === "honor") && <EndingOverlay ending={effectiveScene} childName={character.childName} />}
      {pause && <PausePanel character={character} onClose={() => setPause(false)} onMode={setMode} onDirector={async input => { await api.director(character.id, input); await load(); }} onExit={onExit} />}
    </main>
  );
}

function RecordsPanel({ characterId }: { characterId: string }) {
  const [records, setRecords] = useState<Array<{ id: string; name: string; content: string }>>([]);
  useEffect(() => { void api.records(characterId).then(setRecords); }, [characterId]);
  return <aside className="quest-journal" aria-label="Discovered records"><h2>The evidence box · {records.length}/24</h2><p>These are witnesses and records, not guarantees that every remembered detail happened.</p>{records.map(record => <details key={record.id}><summary>{record.name}</summary><p>{record.content}</p></details>)}</aside>;
}

function LifePanel({ character, busy, act }: { character: CharacterState; busy: boolean; act: (action: string, params?: Record<string, unknown>) => Promise<void> }) {
  const [consent, setConsent] = useState(false);
  const view = character.lifeView;
  return <aside className="quest-journal" aria-label="Life decisions"><h2>{view?.title ?? 'Life in Halvern'}</h2>{view?.summary.map((line, i) => <p key={i}>{line}</p>)}
    {view?.commands.some(c => c.consent) && <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I accept the displayed risk of permanent death for this deployment.</label>}
    {view?.commands.map((command, i) => <button key={`${command.label}-${i}`} disabled={busy || !!command.blocked || (!!command.consent && !consent)} title={command.blocked} onClick={() => { setConsent(false); void act(command.action, { ...command.params, confirmPermanentDeath: consent }); }}>{command.label}{command.blocked ? ` · ${command.blocked}` : ''}</button>)}
    <details><summary>What happened</summary>{character.chronicle?.slice(-8).map(e => <p key={e.id}>{e.text}</p>)}</details>
  </aside>;
}

function QuestJournal({ character, busy, act }: { character: CharacterState; busy: boolean; act: (action: string, params?: Record<string, unknown>) => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [selected, setSelected] = useState('');
  const quests = character.campaignView?.quests ?? [];
  const quest = quests.find(q => q.id === selected) ?? quests[0];
  return <aside className="quest-journal" aria-label="Quest journal">
    <h2>{character.campaign?.perspective === 'adult-child' ? 'The archive' : 'The next foothold'}</h2>
    {quests.length > 1 && <label>Quest<select aria-label="Active quest" value={quest?.id ?? ''} onChange={e => { setSelected(e.target.value); setConfirm(false); }}>{quests.map(q => <option key={q.id} value={q.id}>{q.title}</option>)}</select></label>}
    {quest ? <><h3>{quest.title} · {quest.step}/{quest.total}</h3><p>{quest.objective}</p>
      {quest.options.some(o => o.fatalRisk > 0) && <label><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} />I accept the displayed risk of permanent death for this deployment.</label>}
      <div>{quest.options.map(o => <button key={o.id} disabled={busy || !!o.blocked || (o.fatalRisk > 0 && !confirm)} title={o.blocked} onClick={() => { setConfirm(false); void act('quest_choice', { quest: quest.id, choice: o.id, confirmPermanentDeath: confirm }); }}>{o.text}{o.blocked ? ` · ${o.blocked}` : ''}</button>)}</div></> : <p>{character.campaign?.ending ?? 'Complete the inquiry decisions above; paid work and rest remain available.'}</p>}
    <details><summary>Record of consequences</summary>{character.campaign?.events.slice(-6).map(event => <p key={event.sequence}>{event.text}</p>)}</details>
  </aside>;
}

function Need({ label, icon, value }: { label: string; icon: string; value: number }) {
  return <div className={`need ${value < 25 ? "critical" : ""}`} title={`${label}: ${value}%`}><span>{icon}</span><div><small>{label}</small><i><b style={{ width: `${value}%` }} /></i></div></div>;
}

function ActionDock({ character, busy, act }: { character: CharacterState; busy: boolean; act: (action: string, params?: Record<string, unknown>) => Promise<void> }) {
  const actions = useMemo(() => {
    if (character.questStep === 0) return [{ id: "collect_recycling", label: "Collect recycling", icon: "♲" }, { id: "day_labor", label: "Work day labor", icon: "▰" }, { id: "eat_diner", label: "Eat at Mara's", icon: "◒" }];
    if (character.questStep === 1) return [{ id: "claim_shelter", label: "Claim C-14", icon: "⌂" }, { id: "day_labor", label: "Work a shift", icon: "▰" }, { id: "eat_diner", label: "Eat", icon: "◒" }];
    if (character.questStep === 2) return [{ id: "day_labor", label: "Work a shift", icon: "▰" }, { id: "sleep_shelter", label: "Sleep at shelter", icon: "☾" }, { id: "eat_diner", label: "Eat", icon: "◒" }];
    if (character.questStep === 3) return [{ id: "attend_visitation", label: "Attend visitation", icon: "◇" }, { id: "eat_diner", label: "Eat first", icon: "◒" }];
    return [{ id: "day_labor", label: "Work a shift", icon: "▰" }, { id: "sleep_shelter", label: "Sleep indoors", icon: "☾" }, { id: "eat_diner", label: "Eat", icon: "◒" }];
  }, [character.questStep]);
  return <nav className="action-dock" aria-label="Available actions">{actions.map((action, index) => <button key={action.id} disabled={busy || character.status === "dead" || character.campaign?.perspective === "adult-child"} onClick={() => void act(action.id)}><span>{action.icon}</span><div><small>{index + 1}</small>{action.label}</div></button>)}</nav>;
}

function OpeningPanel({ character, onClose }: { character: CharacterState; onClose: () => void }) {
  const [page, setPage] = useState(0);
  const [closed, setClosed] = useState(false);
  const lines = [
    <>Dawn arrives as tire noise before it arrives as light. Your shoulder has taken the shape of a concrete seam.</>,
    <>The photo survived the rain. <strong>{character.childName}</strong> is laughing at somebody outside the frame. One shoe is untied.</>,
    <>A shopping cart with two good wheels waits beside the pillar. The recycling center opens at six.</>,
  ];
  if (closed) return null;
  return <section className="dialogue-panel opening-dialogue"><img src="/assets/items/creased-photo.png" alt="Creased photo" /><div><small>NARRATION</small><p>{lines[page]}</p><div className="dialogue-actions">{page < lines.length - 1 ? <button onClick={() => setPage(page + 1)}>Continue <kbd>↵</kbd></button> : <button onClick={() => { setClosed(true); onClose(); }}>Stand up <kbd>↵</kbd></button>}</div></div></section>;
}

function VisitationPanel({ character, onComplete }: { character: CharacterState; onComplete: () => void }) {
  const [page, setPage] = useState(0);
  const scenes = [
    { speaker: character.childName, text: "Hi.", choices: ["Hi. It's good to see you.", "You got taller."] },
    { speaker: character.childName, text: "Do I put my bag here or are we going somewhere?", choices: ["Here is good. We can draw.", "We're staying in this room today."] },
    { speaker: character.childName, text: "Grandma said maybe the park.", choices: ["Maybe next time.", "I should have explained."] },
    { speaker: character.childName, text: "What do you want me to draw?", choices: ["Your favorite place.", "Whatever you want."] },
    { speaker: character.childName, text: "The library has a window seat. Grandma lets me read past dinner if it's raining.", choices: ["You left your blue crayon.", "Can I see you again?"] },
    { speaker: character.childName, text: "You can keep it. There are more in the box.", choices: ["I'll bring it next time."] },
  ];
  const scene = scenes[page]!;
  return <section className="visitation-panel" data-testid="first-visitation"><header><span>HALVERN FAMILY CENTER</span><strong>SUPERVISED VISIT · 90 MINUTES</strong></header><div className="visit-stage"><div className="plastic-chair one"/><div className="visit-child">{character.childName[0]}</div><div className="visit-player">{character.name[0]}</div><div className="plastic-chair two"/><div className="crayon"/></div><div className="visit-copy"><small>{scene.speaker.toUpperCase()}</small><p>{scene.text}</p><div>{scene.choices.map((choice) => <button key={choice} onClick={() => page === scenes.length - 1 ? onComplete() : setPage(page + 1)}>{choice}</button>)}</div></div></section>;
}

function SamDialogue() {
  const [line, setLine] = useState(0);
  const copy = ["You're blocking my light. Either come in or become architecture.", "Everybody needs work. I need the brass lamp from Nell's yard table on Carver.", "Twelve if it works. Six if you tell me it works before I test it."];
  return <section className="dialogue-panel sam-dialogue" data-testid="sam-dialogue"><img src="/assets/portraits/sam-okafor.png" alt="Sam Okafor" /><div><small>SAM OKAFOR · OKAFOR PAWN & REPAIR</small><p>{copy[line]}</p><div className="choice-list"><button onClick={() => setLine(Math.min(2, line + 1))}><kbd>1</kbd>{line === 0 ? "Mara said you buy found things." : "What will you pay?"}</button><button onClick={() => setLine(2)}><kbd>2</kbd>{line === 0 ? "I need work." : "Why not go yourself?"}</button></div></div></section>;
}

function ShiftOverlay({ character }: { character: CharacterState }) {
  return <section className="shift-overlay"><div className="stamp">SHIFT 04</div><small>AMATO CONTRACTING</small><h2>Drywall unload</h2><div className="shift-track"><i style={{ width: "68%" }} /></div><div className="shift-meta"><span>5h 27m worked</span><span>$42 on completion</span></div><p>Energy {character.needs.energy}% · Earnings debuff {character.needs.hunger < 30 ? "-10%" : "none"}</p></section>;
}

function HearingOverlay({ character }: { character: CharacterState }) {
  const factors = [{ name: "Housing", value: character.housing === "sro" ? 65 : 35, weight: 30 }, { name: "Income", value: Math.max(76, character.incomeConsistency), weight: 25 }, { name: "Record", value: 100 - character.record * 10, weight: 20 }, { name: "Sobriety", value: Math.min(100, Math.max(33, character.sobrietyDays)), weight: 15 }, { name: "Visits", value: Math.max(100, character.visitationAttendance), weight: 10 }];
  const score = Math.round(factors.reduce((sum, factor) => sum + factor.value * factor.weight / 100, 0));
  return <section className="hearing-overlay" data-testid="custody-hearing"><header><span>FAMILY COURT · REVIEW 01</span><strong>IN RE: {character.childName.toUpperCase()}</strong></header><div className="judge-row"><img src="/assets/portraits/judge-whitfield.png" alt="Judge Whitfield" /><blockquote>“This court is reviewing progress, not character. Character is too large for a Tuesday docket.”<cite>Judge Evelyn Whitfield</cite></blockquote></div><div className="factor-grid">{factors.map((factor) => <div key={factor.name}><span>{factor.name}<small>{factor.weight}% weight</small></span><i><b style={{ width: `${factor.value}%` }} /></i><strong>{factor.value}</strong></div>)}</div><footer><span>COMPOSITE <strong>{score}</strong></span><div><small>PROPOSED ORDER</small><strong>{score >= 62 ? "WEEKEND VISITS" : score >= 40 ? "UNSUPERVISED DAY VISITS" : "SUPERVISED VISITS"}</strong></div><button>Hear the order</button></footer></section>;
}

function AgentTicker({ character }: { character: CharacterState }) {
  return <aside className="agent-ticker"><header><div><span className="live-dot" /> LIVE AGENT</div><strong>{character.name}</strong><small>{character.spectatorCount} WATCHING</small></header><div className="agent-status"><span>RULE AGENT</span><strong>WAITING FOR DECISION</strong><small>Next window in 00:31</small></div><ol>{character.actionLog.slice(0, 5).map((entry, index) => <li key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{entry.action.replaceAll("_", " ")}</strong><p>{entry.detail}</p></div></li>)}</ol><div className="plan-note"><small>PLAN NOTE · OPT IN</small>Keep shelter streak. Eat if hunger drops below 35. Prefer verified shifts.</div></aside>;
}

function CrewOverlay() {
  return <section className="crew-overlay"><header><div><small>CREW TERRITORY</small><strong>RIVERFRONT KINGS</strong></div><span>REP 118</span></header><div className="crew-map-key"><span><i className="king" />Kings</span><span><i className="ally" />North Cut (allied)</span><span><i className="open" />Open</span></div><div className="crew-players"><span>YOU</span><span>NIA</span><span>JUNEBUG</span></div><footer><strong>Camp Three</strong><span>Shared stash: $604 · 18 meals · 3 bike tubes</span></footer></section>;
}

function ArmyOverlay() {
  return <section className="army-overlay"><div className="army-seal">★</div><small>UNITED STATES ARMY · HALVERN RECRUITING</small><h2>One form at a time.</h2><p>Guaranteed weekly pay. Aptitude-based rank. Deployment odds shown before every decision.</p><div className="army-terms"><span><small>BASE TERM</small>60 game days</span><span><small>PAYDAY</small>Every 7 days</span><span><small>VOUCHER</small>On discharge</span></div><button>The Score: begin assessment</button></section>;
}

function FrameOverlay() {
  return <section className="frame-overlay"><div className="laptop-frame"><div className="reconstruction">RECONSTRUCTION PAUSED<span>HALVERN_BUILD_24</span></div></div><div className="table-evidence"><img src="/assets/items/creased-photo.png" alt="The photograph" /><span className="tape-stack">24 TAPES</span><span className="court-stack">COURT RECORD</span></div><blockquote>“That is as far as the records take us cleanly.”<cite>Sam Okafor, decades later</cite></blockquote><button>Pull back</button></section>;
}

function EndingOverlay({ ending, childName }: { ending: string; childName: string }) {
  const honor = ending === "honor";
  return <section className={`ending-overlay ${ending}`}><small>ROCKBOTTOM: SECOND WIND</small><h1>{honor ? "HONOR" : "FORGIVENESS"}</h1><p>{honor ? "The money came home on time. You did not." : `I forgive the years you missed. I do not make them disappear. I keep the difference.`}</p><div className="ending-object">{honor ? "FORT HALVERN · NAME ETCHED" : `${childName.toUpperCase()} · THE PHOTOGRAPH, REVERSED`}</div><footer>NEW GAME+ UNLOCKED · TAPES VISIBLE FROM DAWN</footer></section>;
}

function PausePanel({ character, onClose, onMode, onDirector, onExit }: { character: CharacterState; onClose: () => void; onMode: (mode: ControlMode) => Promise<void>; onDirector: (input: { brief: string; shareSummaries: boolean }) => Promise<void>; onExit: () => void }) {
  const [showToken, setShowToken] = useState(false);
  const [brief, setBrief] = useState(character.director?.brief ?? "");
  const [share, setShare] = useState(character.director?.shareSummaries ?? false);
  return <div className="pause-scrim" role="dialog" aria-modal="true" aria-label="Pause menu"><section className="pause-panel"><header><div><small>GAME PAUSED</small><h2>{character.name}</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="control-mode"><small>CONTROL MODE</small><div className="segmented"><button className={character.mode === "manual" ? "selected" : ""} onClick={() => void onMode("manual")}>Manual</button><button className={character.mode === "agent" ? "selected" : ""} onClick={() => void onMode("agent")}>Agent</button></div><p>Agent mode submits one action per decision window. Travel, work, sleep, and training require no model calls.</p></div><div className="token-row"><div><small>CHARACTER AGENT TOKEN</small><code>{showToken ? character.agentToken : "rb_••••••••••••••••••••"}</code></div><button onClick={() => setShowToken(!showToken)}>{showToken ? "Hide" : "Reveal"}</button></div><label>Brief for your agent<textarea value={brief} maxLength={1000} onChange={e => setBrief(e.target.value)} /></label><label><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} />Share agent decision summaries</label><button onClick={() => void onDirector({ brief, shareSummaries: share })}>Save agent brief</button><a href={`/watch/${character.id}`}>Open spectator view ↗</a><button className="quiet full" onClick={onExit}>Save and return to title</button></section></div>;
}

function TouchControls({ onAction }: { onAction: () => void }) {
  return <div className="touch-controls"><div className="joystick" aria-label="Movement joystick"><span /></div><button className="context-action" onClick={onAction}><span>◎</span><small>ACTION</small></button></div>;
}

function Spectator({ characterId }: { characterId: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.watch>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const poll = async () => { try { const next = await api.watch(characterId); if (active) setData(next); } catch (reason) { if (active) setError(reason instanceof Error ? reason.message : "Stream unavailable"); } };
    void poll();
    const wsUrl = new URL(`/ws/watch/${characterId}`, import.meta.env.VITE_API_URL || window.location.origin); wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(wsUrl);
    socket.onmessage = event => { if (active) setData(JSON.parse(event.data)); };
    const timer = setInterval(() => { if (socket.readyState !== WebSocket.OPEN) void poll(); }, 3000);
    return () => { active = false; socket.close(); clearInterval(timer); };
  }, [characterId]);
  if (error) return <main className="fatal"><h1>Stream unavailable</h1><p>{error}</p></main>;
  if (!data) return <main className="loading"><span/><span/><span/></main>;
  return <main className="spectator-shell"><header><a href="/"><img src="/assets/logo-mark.png" alt="Rockbottom" /></a><div><span className="live-dot" /> LIVE SPECTATOR</div><span>{data.spectatorCount} WATCHING</span></header><section className="spectator-world"><GameCanvas scene="agent" location={data.character.location} night={false} /><div className="watch-label"><strong>{data.character.name}</strong><span className={data.character.status === "stuck" ? "stuck" : ""}>{data.character.status.toUpperCase()}</span></div></section><aside className="spectator-pane"><div className="agent-card"><span className="mini-avatar">{data.character.name[0]}</span><div><strong>{data.character.name}</strong><small>{data.character.mode === "agent" ? "AGENT CONTROL" : "MANUAL CONTROL"} · ACT {data.character.act}</small></div><span className="agent-badge">AGENT</span></div><div className="decision-clock"><small>NEXT DECISION</small><strong>{data.clock?.paused ? "PAUSED" : data.clock ? `${Math.max(0, Math.ceil((Date.parse(data.character.nextDecisionAt) - Date.parse(data.clock.gameTime)) / (1000 * data.clock.scale)))}s` : "WAITING"}</strong><p>Actions unlock when the simulation reaches the next decision.</p></div><h2>Action ticker</h2><ol>{data.actions.slice(0, 8).map((entry, index) => <li key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time><div><strong>{entry.action.replaceAll("_", " ")}</strong><p>{entry.detail}</p></div></li>)}</ol>{data.character.agentVoice && <section className="agent-voice"><h2>Agent interpretation</h2><small>{data.character.agentVoice.modelLabel} · self-described · {data.character.agentVoice.action.replaceAll("_", " ")}</small><p>{data.character.agentVoice.summary}</p><p>{data.character.agentVoice.scene}</p><small>This interpretation does not change the game’s recorded outcomes.</small></section>}
    <h2>Living record</h2><ol>{data.character.chronicle?.slice(-5).reverse().map(event => <li key={event.id}><div><strong>{event.chapter.replaceAll('_', ' ')}</strong><p>{event.text}</p></div></li>)}</ol><h2>Plan notes <small>PRIVATE</small></h2><div className="spectator-note">{data.planNotes[0]?.text ?? "Plan notes are private."}</div></aside></main>;
}

function normalizeScene(scene: string, character: CharacterState) {
  if (["opening", "overpass", "day-labor", "sam", "night", "hearing", "agent", "crew", "army", "reveal", "forgiveness", "honor"].includes(scene)) return scene;
  if (character.act === 3) return "reveal";
  return "city";
}
function sceneTitle(scene: string) { return ({ opening: "ROUTE 9 UNDERPASS", overpass: "ROUTE 9 UNDERPASS", "day-labor": "HALVERN DAY-LABOR LOT", sam: "OKAFOR PAWN & REPAIR", night: "MARKET ROW", hearing: "WHITFIELD COURTHOUSE", agent: "RIVERFRONT ROUTE", crew: "RIVERFRONT EAST", army: "HALVERN RECRUITING CENTER", reveal: "THE KITCHEN TABLE", forgiveness: "THE PHOTOGRAPH", honor: "FORT HALVERN MEMORIAL" } as Record<string, string>)[scene] ?? "HALVERN CITY"; }
function sceneDistrict(scene: string) { return scene === "night" ? "MARKET ROW · 11:42 PM" : scene === "army" ? "FORT HALVERN ANNEX" : scene === "hearing" ? "DOWNTOWN · DAY 30" : "HALVERN CITY"; }
function recommendedAction(character: CharacterState) { if (character.questStep === 0) return "collect_recycling"; if (character.questStep === 1) return "claim_shelter"; if (character.questStep === 2) return character.shiftsWorked < 4 ? "day_labor" : "sleep_shelter"; if (character.questStep === 3) return "attend_visitation"; return "busk"; }
