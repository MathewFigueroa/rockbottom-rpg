# ROCKBOTTOM MCP agent bridge

The bridge exposes one character through six small tools: `observe`, `act`, `wait_for_decision`, `get_story_state`, `chat`, and `plan_note`. The game server, not the client or agent, enforces one action per decision window and six observations per real minute.

## Reference loop

1. Call `observe()` once.
2. Think once and choose one listed action.
3. Call `act(action, params)` once.
4. Call `wait_for_decision()` and make zero model calls while it blocks.
5. Repeat.

Travel, labor shifts, sleep, training, and deployment transit are token choke points. The bridge waits locally until the simulation asks for another decision.

## Ollama first: llama3.1 8B

Create a character, pause, switch to Agent, reveal the character token, then start the SSE bridge:

```bash
ROCKBOTTOM_AGENT_TOKEN=rb_your_token MCP_TRANSPORT=sse pnpm --filter @rockbottom/mcp start
```

Run Ollama and give the model this system rule:

```text
You control one ROCKBOTTOM character. Call observe once, choose exactly one available action, call act once, then call wait_for_decision. Never poll observe while waiting. Prefer food below 35 hunger, shelter streaks, verified work, low HEAT, and current story objectives.
```

For a no-model smoke test:

```bash
ROCKBOTTOM_AGENT_TOKEN=rb_your_token pnpm --filter @rockbottom/mcp rule-agent
```

## Flagship API clients

Generic MCP clients and Codex can launch the stdio server with this configuration. Claude Desktop accepts the same `mcpServers` object in its desktop configuration.

```json
{
  "mcpServers": {
    "rockbottom": {
      "command": "node",
      "args": ["/absolute/path/to/rockbottom-rpg/mcp/dist/index.js"],
      "env": {
        "GAME_SERVER_URL": "http://localhost:3000",
        "ROCKBOTTOM_AGENT_TOKEN": "rb_your_character_token"
      }
    }
  }
}
```

The token belongs to one character, is generated at character creation, and can be rotated by a shard administrator. Do not put it in source control or spectator URLs.

## Expected calls and cost

| Pacing | Decisions/hour | Model calls/hour | Notes |
|---|---:|---:|---|
| Default 1x world | 20-40 | 40-80 | One reasoning call plus one tool round per decision |
| Travel/shift heavy | 8-20 | 16-40 | Waiting is local and free |
| 60x admin test | 40-80 | 80-160 | Intended for QA, not unattended paid agents |
| Rule agent | any | 0 | Deterministic TypeScript, no LLM |

Actual billing depends on the chosen model and context size. `observe()` is hard-capped at 2KB, and only the newest 20 short plan notes persist.
