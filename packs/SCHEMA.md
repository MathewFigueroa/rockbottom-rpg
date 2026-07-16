# ROCKBOTTOM content pack schema

A pack is a folder beneath `packs/` with `manifest.json`, `content.json`, and optional `assets/`, `maps/`, or patch files. The server validates every manifest and the top-level content shape at boot, resolves dependencies, and refuses to start on invalid data. All identifiers use lowercase kebab-case and remain stable after release.

## Manifest

```json
{
  "id": "act2-streets",
  "version": "1.0.0",
  "dependencies": ["base-city", "act1-thefloor"],
  "enabled": true
}
```

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `id` | string | yes | Stable pack ID matching `^[a-z0-9-]+$`. |
| `version` | semver string | yes | Three-part version used in shard compatibility checks. |
| `dependencies` | string[] | yes | Pack IDs that must be present. Order does not imply load order. |
| `enabled` | boolean | no | Default state. Admin overrides are applied by the repository adapter. |

## Content root

`content.json` requires `kind`. Recognized arrays are `maps`, `items`, `npcs`, `quests`, `dialogues`, `events`, `tapes`, and `endings`. A pack may add namespaced metadata, but engines must ignore unknown fields safely.

```json
{
  "kind": "story-act",
  "title": "Act 1: The Floor",
  "quests": [],
  "dialogues": [],
  "events": []
}
```

## Maps and patches

A map defines a tile grid, spawn, districts, landmarks, and transit edges.

```json
{
  "id": "halvern-city",
  "name": "Halvern City",
  "tileSize": 16,
  "width": 128,
  "height": 96,
  "spawn": { "x": 18, "y": 70, "district": "riverfront" },
  "districts": [{ "id": "riverfront", "bounds": [2, 52, 45, 42], "landmarks": ["Route 9 Underpass"], "pvp": "night" }],
  "transit": [{ "from": "riverfront", "to": "downtown", "minutes": 9, "fare": 2 }]
}
```

Map patches use `{ "map": "halvern-city", "set": [{ "x": 12, "y": 9, "tile": "market-awning" }] }`. Patches apply in dependency order, then pack ID order. Conflicting writes are reported at boot.

## Items

```json
{
  "id": "creased-photo",
  "name": "Creased Photo",
  "kind": "keepsake",
  "price": 0,
  "locked": true,
  "description": "Cannot be sold, dropped, traded, fenced, or stolen."
}
```

Common fields are `id`, `name`, `kind`, `price`, `description`, `locked`, need changes (`hunger`, `energy`, `hygiene`, `morale`), `skill`, and `tags`. Locked items must be rejected by every inventory mutation on the server.

## NPCs

NPCs use an ID, display name, role, location or schedule, portrait asset key, and either ambient `lines` or dialogue references.

```json
{
  "id": "mara-velasquez",
  "name": "Mara Velasquez",
  "role": "diner cook",
  "portrait": "portraits/mara-velasquez.png",
  "schedule": [{ "from": "05:00", "to": "15:00", "location": "maras-diner" }],
  "lines": ["Coffee is two. Advice costs more."]
}
```

## Dialogue trees

A dialogue contains nodes. `start` is the default entry node. Each node can provide `speaker`, `text`, `stage`, conditional `variants`, `choices`, `effect`, and `end`.

```json
{
  "id": "sam-first-flip",
  "speaker": "Sam Okafor",
  "nodes": [
    {
      "id": "start",
      "text": "Either come in or become architecture.",
      "choices": [
        { "text": "I need work.", "next": "lamp", "condition": "quest.the-floor.started" }
      ]
    },
    { "id": "lamp", "text": "Check it twice.", "effect": { "quest": "the-flip", "advance": 1 }, "end": true }
  ]
}
```

Template values use `{{playerName}}`, `{{childName}}`, and other server-approved variables. Content cannot execute code. Conditions are parsed by the pack expression interpreter; unsupported expressions fail validation.

## Quests

Quests use `steps` or `stages`, each with an ID, objective, optional scene/dialogue/minigame, conditions, effects, rewards, and explicit choices.

```json
{
  "id": "keys",
  "name": "Keys",
  "summary": "Land the SRO room.",
  "stages": [
    { "id": "deposit", "objective": "Save $270.", "condition": "cash >= 270" },
    { "id": "key", "objective": "Sign the lease.", "effect": { "housing": "sro", "item": "sro-key" } }
  ]
}
```

Every stage must leave at least one reachable next state. Risky or incomplete systems should route to a working fallback stage rather than a broken action.

## Events and schedules

Events use `id`, `trigger` or `schedule`, optional `condition`, `cooldownDays`, choices/scenes, and `effect`. Schedules are interpreted on the server-authoritative game clock.

```json
{
  "id": "army-payday",
  "schedule": "every 7 game days after enlistment",
  "condition": "armyStatus=active-duty",
  "effect": "rank base pay minus allotment"
}
```

Random events store their seed and roll in the audit log. Never silently reroll a deployment casualty, arrest, or story branch.

## Tapes

Tapes are collectible documentary records with complete readable content.

```json
{
  "id": "tape-03",
  "name": "Pawn Ticket 1187",
  "location": "Sam's back counter",
  "content": "OKAFOR PAWN & REPAIR..."
}
```

IDs `tape-01` through `tape-24` are reserved by the base story. Extension packs should prefix IDs, for example `eastbank-tape-01`.

## Endings

An ending has `id`, `name`, a deterministic `condition`, and ordered `scenes`. A scene can include `stage`, `narration`, `dialogue`, `choice`, and `end`.

```json
{
  "id": "forgiveness",
  "name": "FORGIVENESS",
  "condition": "shared custody won",
  "scenes": [
    { "stage": "The two photographs overlap.", "narration": "I keep the difference." },
    { "stage": "Title card.", "end": true }
  ]
}
```

## Assets

Pack assets live beneath the pack's `assets/` folder or reference generated base assets by relative key. Raster art uses integer dimensions, nearest-neighbor scaling, and the shared palette. Run `pnpm assets` after adding item/NPC IDs to regenerate missing base icons and portraits.

## Validation checklist

1. Use unique IDs and valid semver.
2. Declare every dependency.
3. Ensure every dialogue choice resolves to an existing node.
4. Ensure every quest stage has a reachable exit.
5. Store complete player-facing prose in pack JSON, not client code.
6. Run `pnpm build`, `pnpm test:unit`, and `pnpm test:e2e`.
7. Boot the admin panel and confirm the pack/version appears before publishing.
