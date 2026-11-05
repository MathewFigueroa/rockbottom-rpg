# ROCKBOTTOM: Second Wind — review build

## Playable game

This stack delivers a complete authored campaign from four dollars under Route 9 to a recorded family-court outcome and the adult child’s archive. It also supplies recurring systems that allow a model to live differently between story decisions: Army assessment/training/service, scheduled deployments, shared street markets, courier work, evidence-based police cases, jail and legal aid, community record repair, crew aid and informant consequences, relapse/recovery, friendship repair and the inquiry’s aftermath.

The story is intentionally not a route to an inevitable heroic ending. Eight nonlinear inquiry scenes and seven quest chains connect to twelve optional character scenes. The parent can recover, compromise, decline a risk, die in service, or leave an unfinished life. The child’s frame distinguishes testimony, interpretation, uncertainty and fact. Private seeds vary context and outcomes; models choose what they think the spectator would value. Some runs may converge. Novelty is possible, not guaranteed.

Two deterministic policy playthroughs now start with fresh characters, execute Act 1 and the Street chain, play every optional arc, address legal consequences, earn housing, attend the actual hearing, and reach different recorded endings. Other tests cover the Army career, terminal death/HONOR, privacy, durable saves and all original path/rescue/disclosure combinations. Tests are evidence of implemented behavior, not a replacement for a human editorial playtest with the chosen model.

## Review stack

1. PR #1: owner protection, durable local saves and the original Second Copy slice.
2. PR #2: transactional PostgreSQL persistence and recovery operations.
3. PR #3: Acts 2–3 quests, housing, actual custody and the frame.
4. PR #4: full training and recurring Army service.
5. PR #5: markets, scheduled courier work, police/jail/legal aid.
6. PR #6: living character arcs, private viewer briefs, optional agent interpretations, earned records and model runner.
7. PR #7: authenticated MCP sessions, private chat boundaries, moderation appeals, owner recovery/token rotation, request cancellation and final playthrough tests.

8. PR #8: shorter local spectator waits, evidence exploration and story context.
9. PR #9: needs-aware agent menus, counted progress and stalled-routine feedback.
10. README follow-up: current setup documentation, repaired Compose service layout and configuration validation.

All remain unmerged until the owner approves. The branches are stacked in that order; each PR’s base narrows its review diff to one milestone. No deployment or merge has been performed.

## Run and spectate

Use Node 22+ and the pinned pnpm version. Install with `pnpm install --frozen-lockfile`, then `pnpm dev`. Create a character in the browser. The private viewer brief can express what kind of story you would like without promising its ending. Choose Agent mode in the owner menu and use the character’s token with an MCP client or the provider-neutral runner documented in [LIVING_STORY.md](LIVING_STORY.md). A model endpoint and credentials, if required by that provider, are supplied by the operator. No paid model calls were made during development.

Open the character’s `/watch/<id>` link to observe actual actions, the living record, discovered context, current clock and spectator count. Optional public model summaries are interpretations, not private deliberation or authoritative mechanics. Models cannot award themselves resources, override odds, invent a legal acquittal or reverse a prior death.

World actions use game time, which the operator can scale/pause in the admin clock. Model waiting does not require model calls. Timed assessment/drill windows scale at entry to stay usable on an accelerated shard. Legacy work actions apply their effects at command acceptance and gate subsequent actions for the declared duration; newly scheduled service/courier jobs settle at their due time. This distinction is explicit rather than hidden behind a claim that all jobs share a scheduler.

## Ownership and recovery

The browser owner credential is an HttpOnly cookie. Save a recovery code from the owner menu with the character link in a private location. Creating a new code invalidates the previous code. Only its hash is persisted; the plaintext is returned once. The title-screen recovery form issues a new owner credential and invalidates the old browser credential. Agent tokens are separate and can be rotated without losing progress. There is no email-based identity provider or password reset service.

## Connection and moderation boundaries

Remote MCP uses `Authorization: Bearer <token>` on both SSE setup and message posts. Tokens in URLs and ambient server-token delegation are rejected. Sessions are bound to the opening credential, with host/origin checks, bounded body size, per-agent/global capacity and rate limits. Local binding defaults to loopback. Docker explicitly binds its private service interface and advertises the `/mcp` proxy prefix. Standard I/O remains available. Correct production entrypoints and production-only MCP packaging are verified in CI.

Public chat contains public messages only. Crew messages require membership; direct messages require a named recipient and are readable only by the sender, recipient and authorized moderators. Legacy private messages lacking recipient/membership metadata remain restricted to their sender. Reporter receipts never expose another actor’s private moderation evidence. The old fingerprint field is retained for schema compatibility as an account-correlation hash; it is not device evidence and does not claim hardware or IP bans.

Sanctions require moderator decisions. Appeals require notes, preserve a review trail, recompute remaining sanctions and compensate a reversed upheld sanction only once. They do not automatically accuse the reporter. Admin sessions expire server-side as well as in the cookie. These are moderation mechanics, not a production voice-evidence classifier or legal compliance certification.

## Honest release boundaries

The core campaign and the systems described above are playable and tested. Public hosting is still a separate operator release decision. This is one authoritative process with a transactionally saved JSONB world, not horizontally scaled simulation. Existing Prisma schemas are unused scaffolding; runtime PostgreSQL uses parameterized node-postgres queries. See [POSTGRES.md](POSTGRES.md) for migrations, imports and backups.

Future expansions include voice/WebRTC and real voice evidence, continuous proximity movement/combat and consensual PvP, arbitrary third-party JSON pack compilation, signed publishing/federation, cross-shard accounts, provider-specific model evaluations, broader localization and more authored districts. Existing illustrative screenshot scenes do not imply these features are implemented. The selected authored campaign and its systems are the supported game mode in this review build.

## Short spectator waits

New worlds default to 10 game seconds between otherwise instantaneous decisions. Longer work/travel/sleep durations remain game-time durations. For a local world with exactly one character, `node tools/spectator-pacing.mjs CHARACTER_ID` adjusts the global clock after each new deadline to target a 10-second wall-clock wait. It requires the local development admin interface and refuses multi-character worlds. It preserves deadlines, pay and legal/service outcomes. The clock supports up to 3600×; waits longer than ten game hours can exceed the target. Model inference time is additional and cannot be promised to fit the timer. Stop the helper before changing the clock manually; its last clock scale persists until changed.

Spectators can inspect the current objective, family context, resources and earned evidence, and select a local interpretation priority. That priority is not sent to the player-agent or saved as a game choice.
