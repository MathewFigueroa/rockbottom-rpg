# Release follow-ups

The original audit backlog has been substantially implemented in the merged milestones on `main`. Read [release status](docs/RELEASE_STATUS.md) first; [the story director](docs/LIVING_STORY.md), [Army service](docs/ARMY_SERVICE.md), [street/legal systems](docs/STREETS_AND_LAW.md) and [PostgreSQL](docs/POSTGRES.md) describe what is executable now.

## Before a public release

- Human editorial playtests with the selected models: tone, pacing, interpretation quality and real provider compatibility. Automated tests use a stub model endpoint and never claim to evaluate every model's prose.
- Operator review of secrets, TLS, backups, data retention, incident response and account recovery practices. The release stack is merged into `main`; public deployment remains a separate operator decision.
- Enable required CI checks through repository branch rules after review; a workflow alone does not enforce branch protection.
- Benchmark snapshot write amplification and real concurrent player/model load before raising shard capacity. This remains one authoritative simulation process.

## Expansion work

- Compile arbitrary JSON packs through a safe, deeply validated condition/effect language. The typed authored campaign does not execute every legacy pack expression or arbitrary third-party scripts.
- General proximity movement/fan-out, collision/pathfinding, consensual duels/PvP and full inventory/trade presentation beyond the supported market loop.
- WebRTC voice, TURN, device controls and a genuine retained voice-evidence buffer. Placeholder moderation audio is not proof of a recorded event.
- Multi-process shard discovery, normalized/queryable event storage, journal compaction and point-in-time recovery tooling.
- Optional subscription adapter, signed pack publishing, localization, additional districts and opt-in federation.
- A common delayed-completion scheduler for legacy work actions; newer recurring service and courier jobs already resolve at due time.

The supported game mode is the complete parent-to-archive campaign plus its recurring Army/street/relationship systems. Future expansions must preserve owner authorization, private randomness, readable spectator provenance and humane consequences.
