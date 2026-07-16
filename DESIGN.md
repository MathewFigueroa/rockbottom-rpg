# ROCKBOTTOM: Second Wind Design System

## Direction

A tactile civic-noir game interface built from transit signage, stamped case files, scratched enamel, and restrained pixel art. The physical scene is a player checking a cracked phone beneath an orange streetlamp before a shelter curfew, so the base is dark and low-glare with crisp paper-toned text and sodium-orange decisions.

## Color Strategy

Restrained, with cool concrete neutrals carrying most surfaces and sodium orange reserved for active decisions. Dawn blue marks neutral information; muted Army green identifies service content. All production tokens use OKLCH.

- `--ink`: `oklch(18% 0.015 245)`
- `--asphalt`: `oklch(23% 0.018 245)`
- `--concrete`: `oklch(34% 0.018 245)`
- `--paper`: `oklch(91% 0.018 80)`
- `--muted`: `oklch(70% 0.025 245)`
- `--sodium`: `oklch(72% 0.16 58)`
- `--dawn`: `oklch(68% 0.09 238)`
- `--army`: `oklch(58% 0.075 142)`
- `--danger`: `oklch(62% 0.15 28)`
- `--success`: `oklch(67% 0.10 150)`

## Typography

Use a compact system sans stack for all controls and body copy. Use the generated block-pixel logo only as art, never as functional text. UI labels are uppercase with modest tracking; story dialogue uses sentence case, generous leading, and a maximum line length of 68 characters.

## Layout

The game canvas owns the viewport. Desktop HUD elements anchor to edges and keep the world visible. Mobile uses a slim top status rail, a bottom objective strip, a left virtual joystick, and a right context button. Panels enter from an edge and never create nested card grids.

## Components

- Buttons: squared 6px corners, 44px minimum height, solid state fills, explicit focus ring.
- Need meters: labeled bars with icon, value, and patterned critical state.
- Dialogue: lower-third paper-dark panel with speaker portrait, short lines, numbered choices.
- Objective strip: one current task, location/distance, and optional deadline.
- System panels: enamel-dark surfaces with thin concrete borders and stamped section labels.
- Admin: familiar top bar, compact tables, clear semantic statuses, no game-like ornament beyond palette.

## Motion

Use 160-220ms opacity and transform transitions with ease-out-quint. Respect `prefers-reduced-motion`. World lighting changes gradually; decision prompts appear immediately. No bouncing, parallax, or decorative page-load choreography.

## Pixel Art

Use deterministic nearest-neighbor raster output at a 16px tile basis. Shapes are chunky and readable at 1x. Characters use four-direction silhouettes and restrained two-frame walks. Portraits use geometric facial planes and distinct palettes rather than realism.
