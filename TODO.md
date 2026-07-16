# Registered production follow-ups

No listed item leaves a broken route. Each is shipped behind a working in-memory, deterministic, or no-op interface so local play and the acceptance suite remain complete.

## Persistence adapters

- `server/prisma/sqlite.prisma` and `server/prisma/postgres.prisma`: schemas ship, while `server/src/store.ts` currently selects the in-memory repository. Implement `PrismaStore` with the same methods, run migrations, and select SQLite for development or Postgres in production.
- `server/src/store.ts`: add the optional Redis broadcast/cache adapter. The current process-local maps are the documented fallback and are appropriate for one server process.
- `server/src/index.ts`: persist pack enablement, moderation evidence, crew diplomacy, chat retention, and economy counters through the repository adapter.

## Simulation breadth

- `server/src/simulation.ts`: Act 1 is fully playable. The complete Acts 2 and 3 data ships in `packs/`, while the generic quest interpreter currently exposes presentation/demo states rather than executing every authored stage. Implement pack-expression conditions, stage effects, and safe migrations for active quest state.
- `packs/act2-army/content.json`: implement seeded deployment resolution, squad-size casualty modifiers, rank/pay tables, the timed training input evaluator, and permanent-death confirmation against the authored interfaces.
- `packs/act2-streets/content.json`: implement pawn inventory markets, scheduled courier demand, HPD pathfinding, jail/bail timers, crew rat evidence discovery, and relapse consequence rolls.
- `server/src/simulation.ts`: add hospital cash loss for non-deployment defeats, consensual duel state, Industrial night-PvP enforcement, and high-HEAT PvP consent rules.
- `server/src/index.ts`: the lobby returns one working 64-player shard. Add multi-process shard discovery and capacity placement before official hosting.

## Real-time social systems

- `server/src/index.ts`: spectator WebSocket state is live. Add the general proximity entity/chat WebSocket fan-out so clients no longer poll REST for all shared world state.
- `client/src/App.tsx`: add push-to-talk WebRTC mesh negotiation, per-player mute, reconnect behavior, and device selection. Text chat and mute-safe spectator views already work.
- `server/src/index.ts`: moderation evidence currently uses a valid placeholder audio data URI through the pluggable evidence field. Connect the rolling 30-second voice-channel PCM/Opus ring buffer and evidence retention policy.
- `server/src/index.ts`: replace the keyword/severity classifier seam with a production toxicity model. Keep human uphold/overturn decisions authoritative.
- `server/src/index.ts`: device fingerprint hashing is implemented. Add salt rotation and documented false-positive appeal tooling. Browser MAC bans are technically impossible.

## Admin and operations

- `admin/src/main.tsx`: the clock, packs, players, moderation list, agent thresholds, spectators, and economy readouts work. Add player teleport/reset/manual-ban mutations, moderation audio playback controls, editable appeal notes, and day-by-day faucet/sink charts.
- `server/src/index.ts`: pack toggles are validated and queued for safe reload. Add file watching only for development; production should use explicit versioned reloads.
- `server/src/premium/index.ts`: replace `EnvironmentPremiumGate` with the Stripe test-mode subscription adapter for the official hosted service. Self-hosted `PREMIUM_ALL_FREE=true` must remain supported.
- `deploy/`: add a TURN service profile before advertising voice across restrictive NATs, and add Prometheus/OpenTelemetry exporters for public shards.

## Client polish

- `client/src/GameCanvas.tsx`: procedural Pixi scenes are complete for the accepted views. Add collision layers, camera interpolation, authored tilemap streaming, four-direction sprite animation, and district props from the generated tilesets.
- `client/src/App.tsx`: add the full inventory, trade, skill-tree, crew management, tape reader, minimap, and ASVAB/training interfaces over the existing server and pack contracts.
- `client/src/App.tsx`: the browser experience is mobile-first and install-free. A future optional PWA manifest/offline shell belongs on the public roadmap; it must not become mandatory installation.

## Federation and ecosystem

- `packs/SCHEMA.md`: top-level validation is enforced. Add JSON Schema files for deep dialogue-node references, quest reachability, localization keys, and asset existence, then expose a standalone `pnpm pack:validate` command.
- Add signed pack publishing, compatibility ranges, sandbox review, and a community marketplace only after the base schema stabilizes.
- Add opt-in shard federation for account portability without sharing moderation evidence or private agent notes by default.
