# Second Wind: The Second Copy

## Reviewable delivery

This branch is a coherent single-process vertical slice, not a claim of complete public-hosting readiness. Architecture remains Fastify + shared deterministic simulation, React/Pixi browser client, MCP agent bridge and versioned content packs. The new authored campaign is code-backed rather than a generic pack-expression interpreter.

1. Foundation: separate hashed owner credentials in HttpOnly same-site cookies; ownership on character and social writes; agent tokens stay out of public/action snapshots. Reports remain pending until an authenticated moderator decides. Unilateral alliances return a conflict until mutual consent exists. Manual and agent actions obey the same time gate; death is terminal. Production requires explicit secrets and origin.
2. Persistence: optional versioned atomic JSON snapshot selected with SAVE_PATH, mounted in Docker. Saves characters, story, runtime, owner hashes, agent credentials, crews, chat tail, cases, bans, pack flags and economy. Successful POST responses save synchronously. Background simulation checkpoints every five seconds and graceful close saves. This is a one-process adapter; no database transaction or cross-process coordination is claimed.
3. Story: six executable scenes, eight path/rescue/disclosure combinations, irreversible choices, earned evidence, resource consequences, agent story state, browser choices, and spectator action events over WebSocket with polling fallback.
4. Verification: ownership, redaction, manual/agent timing, death, replay rejection, all narrative branches, save/reload tests; CI typecheck, unit/browser tests, builds, audit and server container build.

## Story bible

The pitfall is both the collapsed Route 9 retaining wall and a civic habit: mistaking a clean record for a life safely lived. A parent loses work, housing and contact after opening a gate during a failed evacuation. The crime is real; the official explanation is incomplete. Recovery is meals, shifts, shelter and reliable visits before it is a conspiracy investigation. Poverty is never evidence of moral failure.

Three timelines cross: the night before the collapse, the days of recovery, and an inquiry on day thirty. Each scene labels its time. A signature first appears incriminating, then forged, then morally insufficient as a defense. The empty chair in the opening inquiry belongs to an erased resident, not a threatened child. The player is neither secretly omnipotent nor absolved of every mistake.

Dana Reyes protects residents, then must admit that hiding the duplicate weakened their case. Sam Okafor believes repaired objects tell the truth, then acknowledges editing a recording to protect a child. Nell distrusts institutions but must ask tenants for consent rather than use them as evidence. Sergeant Imani Vale separates lawful service from obedience to a corrupted contractor and testifies under her own name. The child retains a life and preferences beyond the parent's redemption; the final promise concerns Tuesday, not total forgiveness.

Street play obtains local testimony and tenant trust; Army logistics obtains archive access and a documented chain of custody. Neither path automatically grants custody or moral superiority. At the flood circuit failure the player chooses evacuation or the original ledger. Rescue loses the original but enables voluntary witnesses. Securing evidence raises heat and leaves Sam injured during evacuation. Disclosure can accelerate an audit at the cost of exposing addresses; sealed testimony protects witnesses but delays accountability. Custody remains governed by the existing five-factor system.

## Next milestones and acceptance criteria

- PostgreSQL/Prisma migrations and transactional command storage, clock persistence, encrypted credential storage, recoverable owner accounts, token rotation/revocation, retention policy, fsync durability and crash-injection restore tests. Current atomic rename protects against partial writes but is not a backup or power-loss guarantee. Stop the server and copy the entire SAVE_PATH file to restricted backup storage; restore to a new SAVE_PATH and start a single server. Never commit saves or expose them through static hosting. Verify character ID, narrative stage and owner access after restore.
- Generic pack interpreter with safe condition/effect vocabulary, deep reference validation and quest migrations. Implement existing Acts 2/3 deployment, casualty confirmation, rank/pay, markets, police/jail, duels and PvP rules. New campaign does not implement these systems.
- Extend six scenes into multi-stage witness quests, timed evacuation logistics, recurring route-specific jobs and relationship variables. Current branch changes evidence, heat, energy and ending text; it does not simulate injury recovery or a city flood.
- Harden all request schemas, authenticated expiring admin sessions, explicit spectator consent, per-stream capacity/backpressure, bounded global state, websocket origin checks, MCP SSE session authorization/body limits and cancellation, general proximity fan-out and multi-process shards.
- Moderation appeal/reversal with recomputed active sanctions, evidence retention and voice capture. Current decisions are terminal; no automatic punishment for overturned reports. No IP/device bans are claimed.
- Tune public-hosting time progression: shifts currently take eight game hours. Test/admin clocks can advance time; production needs transparent waiting/fast-forward rules that preserve shared-world causality.
- Require CI checks through repository branch rules after maintainer review. The workflow alone cannot enforce branch protection. Resolve dependency audit findings before hosting.

Spectator feeds expose revealed narrative only, with sequential scene numbers and timeline labels in story events and action text. Private plan notes remain private. Existing screenshot-only demo scenes are illustrative and are not unlocked campaign endings.
