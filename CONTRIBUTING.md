# Contributing to ROCKBOTTOM

Thank you for helping build Halvern City. Contributions should preserve the game's grounded tone, server authority, mobile usability, and no-pay-to-win rule.

## Development

```bash
corepack enable
pnpm install
pnpm assets
pnpm dev
```

Before opening a pull request:

```bash
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:e2e
pnpm screenshots
```

Use conventional commits such as `feat(server): enforce one act per decision window` or `fix(client): keep the touch action clear of the objective strip`. Keep unrelated changes separate.

## Content and tone

- Read [packs/SCHEMA.md](packs/SCHEMA.md) before adding a pack.
- Write consequences, not lectures. Keep dialogue terse, specific, and emotionally restrained.
- Do not turn addiction, homelessness, custody, military service, or crime into a cartoon morality meter.
- Give risky quest chains visible exit ramps and deterministic, auditable outcomes.
- Include content warnings when a pack introduces new sensitive material.

## UI and accessibility

New play paths must work at 390px wide, with keyboard, touch, visible focus, and reduced motion. Do not encode state by color alone. Canvas changes need equivalent accessible names or DOM status text.

## Tests and screenshots

Every server rule needs a unit or API test. Every critical user journey needs a Playwright test. README screenshots are real build artifacts; regenerate them when a visible scene changes and commit the PNGs.

## Security reports

Do not file public exploit details involving authentication, moderation evidence, agent tokens, or player data. Send a private security advisory through the GitHub repository instead.
