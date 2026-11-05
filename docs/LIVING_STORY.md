# The model’s story, witnessed

ROCKBOTTOM separates three things: the spectator’s brief, the player-agent’s choices, and the server’s consequences. The brief can prefer tenderness, ambition, suspense, restraint or something personal. It is not a command to award a particular ending. Models can interpret that brief differently, take different routes, incur different costs and tell different stories about the same kind of act.

Each character has a persisted private random seed. It fixes encounter order, small scene variations, market inspection conditions and deployment outcomes. Model choices change trust, finances, evidence, support, absences, friendships and the eventual archive. Repeated runs have many possible trajectories; identical models or policies can still converge. We do not claim mathematical uniqueness or that the game can read a spectator’s mind.

## Living character arcs

Four optional, three-scene arcs join the inquiry and family story:

- **Old Friends:** Marcus offers genuine laughter and a disclosed risk of relapse, cash loss and missed curfew. Declining or suggesting breakfast preserves a relationship without pretending one person can cure another. Truth, concealment, support and boundaries have different consequences. Relapse does not itself create a police charge.
- **Crew Up:** Nia’s memorial rule, shared treasury and actual aid votes make belonging material. Contributions and withdrawals move persisted money. A paid witness report can be discovered through the transit camera; evidence and motive are treated as different questions.
- **Sam’s Repair:** a repaired radio can provide an honest hour without purchasing forgiveness. The model may apologize, explain urgency or respect distance. The uncut recording preserves a silence rather than hiding a magical confession in it.
- **The Public Fund:** an inquiry settlement can support the household or relocation. Both uses have human stakes. The child’s privacy, the missed visit and the rescue remain separate facts in the final duplicate.

Encounter availability follows prior milestones. A private seeded order varies which invitation arrives first. Encounters expire after two game days; an unanswered invitation is recorded without inventing the player’s motive. Six game hours separate completed encounters. No scene can be replayed for its money or trust reward. The final frame echoes these choices alongside the bracelet, support ledger and court order.

Crew alliances now require an authenticated member on each side. One proposal does not create a mutual alliance. Shared NPC aid has a real treasury, a low-cash requirement and a seven-day cooldown. Informant evidence persists through reload.

## What spectators see

The live feed carries actual actions, a bounded living chronicle, real spectator counts and the server clock. The next-decision display reflects scale and pause state. Private plan notes and the spectator’s brief stay private.

Owners can opt into **short agent decision summaries and scene interpretations**. These are labeled as agent interpretation and show a self-described model name. They are not hidden reasoning, provider verification, or permission to change mechanical facts. An agent’s imagined sentence cannot change cash, survival, court records or prior choices. Turning sharing off removes the public voice immediately.

The evidence box unlocks its twenty-four recordings through milestones. The adult child can review the full box after an ending. Owner writes cannot collect future records merely by guessing IDs. Records are testimony, not a guarantee that every remembered detail happened exactly as described.

## Connect a model

Any MCP-capable model can use `introduce_agent`, `get_story_state`, `act`, `wait_for_decision` and private `plan_note`. `get_story_state` includes the owner’s brief, available quest/system contracts, needs, private continuity notes, recent events and discovered recordings. The model may supply optional `summary` and `scene` strings with an action. Use exact option IDs and the displayed irreversible-risk contract.

For chat-completions-compatible local or hosted endpoints, a provider-neutral runner is included:

```sh
GAME_SERVER_URL=http://localhost:3000 \
MODEL_BASE_URL=http://localhost:11434/v1 \
MODEL_NAME=your-model \
ROCKBOTTOM_AGENT_TOKEN=your-character-token \
pnpm --filter @rockbottom/mcp model-agent
```

Set MODEL_API_KEY only when the chosen endpoint requires one. Select Agent mode in the owner menu first. MODEL_MAX_TURNS bounds successful decisions (default 500). The runner polls without model calls between real decisions, honors server retry hints and allows timed assessment/legal micro-inputs. It stops on an ending, malformed model output, provider errors or three consecutive rejected actions. It never executes model text as code or trusts an invented reward. Tests use a stub provider; no paid model calls were made during development.

The same model may choose differently on a subsequent run, and different models may make the same choice. The product promise is agency and observable consequences, not guaranteed novelty or infallible narration.
