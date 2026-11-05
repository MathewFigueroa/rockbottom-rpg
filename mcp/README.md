# ROCKBOTTOM model connections

The server owns actions and consequences. The bridge exposes `observe`, `act`, `wait_for_decision`, `introduce_agent`, `get_story_state`, `chat`, `read_chat` and `plan_note` for one character.

## Provider-neutral model runner

Create a character, choose Agent mode in the owner menu and supply its agent token privately:

```bash
GAME_SERVER_URL=http://localhost:3000 \
MODEL_BASE_URL=http://localhost:11434/v1 \
MODEL_NAME=your-installed-model \
ROCKBOTTOM_AGENT_TOKEN=your-character-token \
pnpm --filter @rockbottom/mcp model-agent
```

A chat-completions-compatible model service must already be running. Set `MODEL_API_KEY` if that service requires it. `MODEL_MAX_TURNS` defaults to 500 accepted decisions. Hosted requests may incur provider charges; compatibility and interpretation quality vary by model.

The runner reads the exact needs-aware `decision_context` menu, validates model selections, retains recent successful choices and re-prompts stalled routines. Food and recovery are distinct from paid shifts and story milestones. Three consecutive invalid/rejected choices stop the runner with an error; it does not choose an action for the model. Waiting makes no model calls. See [the complete model contract](../docs/LIVING_STORY.md).

## Stdio MCP client

```bash
pnpm --filter @rockbottom/mcp build
```

Example configuration:

```json
{
  "mcpServers": {
    "rockbottom": {
      "command": "node",
      "args": ["/absolute/path/to/rockbottom-rpg/mcp/dist/src/index.js"],
      "env": {
        "GAME_SERVER_URL": "http://localhost:3000",
        "ROCKBOTTOM_AGENT_TOKEN": "your-character-token"
      }
    }
  }
}
```

A client should call `get_story_state`, choose an exact available action/params, submit `act`, then use `wait_for_decision` without model calls during the wait. `observe` supplies a compact view and is limited to six calls per real minute. `get_story_state` includes the private viewer brief, needs, action contracts, discovered recordings and continuity notes. Optional public summaries are interpretations, not private reasoning or authoritative facts.

The provider-neutral runner contains the progress guard. A custom MCP client must implement its own needs/progress policy using the same state contracts; the server still validates all gameplay mechanics.

## SSE transport

`pnpm dev` already starts the development bridge. To start it separately after building:

```bash
MCP_TRANSPORT=sse GAME_SERVER_URL=http://localhost:3000 pnpm --filter @rockbottom/mcp start
```

Connect to `http://localhost:3001/sse`, sending `Authorization: Bearer <character-token>` on both setup and message posts. Credentials in URLs and ambient server-token delegation are rejected. Each session is bound to its opening credential. Local binding defaults to loopback; allowed hosts/origins, session limits, request limits and body size are enforced.

Behind the provided Caddy proxy, connect to `https://YOUR_DOMAIN/mcp/sse`. Docker advertises the `/mcp` message prefix and explicitly binds the private service interface. Change `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` for your reviewed domain configuration.

Owner credentials are separate from agent tokens. The browser owner can rotate an agent token or create a recovery code from the owner menu. Never commit tokens or put them in spectator links. Public spectator state excludes private notes and viewer briefs; direct/crew chat has participant checks.

## Reference smoke agent

```bash
ROCKBOTTOM_AGENT_TOKEN=your-character-token pnpm --filter @rockbottom/mcp rule-agent
```

This is a deterministic Act 1 reference policy, not a model or a complete story agent. It makes zero model calls. For the local single-character ten-second spectator helper, see [the main README](../README.md#short-spectator-waits).
