# Design brief: round 2

William's feedback on round 1: the themes changed the concept, and they looked like
"AI slop". In this round, keep the concept: **Sweeper Inc. is a mining company**, and the
game keeps every word it has now. Make it **look better**.

Each design is one art direction for the same game. Each one has a specific real-world
reference, and it must look like a careful designer made it.

## What stays the same

- All text, names, numbers, and glyph meanings. Themes must not use `phrases` or `labels`
  for words. A glyph may be drawn differently with CSS, but it must keep its meaning.
- Every element and every control. Nothing may be hidden or removed. Every state must
  still be readable: hidden, open, numbers 1–8, flag, mine, treasure tiers, curio, hint,
  disabled, maxed, selected, and focus.
- Game logic. Use CSS only. Layout changes are allowed through CSS: grid, `order`,
  position, size, and spacing.

## Layout is in scope

The desktop layout today is one long horizontal row that scrolls sideways. A design may
arrange the cabinet and the five panels into a better layout, for example a grid that fits
a 1440×900 screen without horizontal scrolling. It must still work from 375 px to 1920 px
wide, and the contract-running overlay (`body.is-contract-running`) must still work.

## Rules against slop

Do not use:

1. Purple-to-pink or blue-to-purple gradients, or neon glow as decoration.
2. Glassmorphism, `backdrop-filter` blur, or frosted panels.
3. Glow (`box-shadow` with a large blur in an accent colour) on more than one or two
   focal elements.
4. Gradients on every surface. Prefer flat colour, or a texture that has a reason.
5. Emoji or decorative Unicode as ornament.
6. Animated backgrounds, or motion that does not show a change in game state.
7. More than one display typeface and one text typeface. Monospace is allowed for
   numbers only.
8. Random values. Use one spacing scale (4/8/12/16/24/32), one radius system, and one
   border weight system.
9. Low contrast. Body text must meet 4.5:1 contrast, and large numbers must meet 3:1.
10. Cards inside cards inside cards. Use rules, spacing, and type to group items, not
    extra boxes.

Do:

- Start from the reference. Name the real object or document, and copy its decisions:
  its palette, its type, its materials, and how it shows hierarchy.
- Use a strict palette: neutrals plus one or two accents. Give the accents meaning. For
  example, use red only for danger and mines.
- Make the board the hero. Tiles must be crisp, and the numbers instantly legible. Give
  the numbers a deliberate colour set.
- Give each panel a clear hierarchy: a title, then a key number, then actions. Keep
  secondary text secondary.
- Align to a grid. Keep the left edges consistent.

## The five directions

| id | Name | Designer | Reference |
| --- | --- | --- | --- |
| `survey-ledger` | Survey Ledger | Claude | A 1960s mining company's printed paperwork: survey plates on graph paper, ledger forms, typewritten entries, one red rubber stamp. Off-white paper, black ink, red for danger only. Editorial grid. |
| `field-unit` | Field Unit | Claude | Rugged industrial hardware, like a mining survey instrument or a heavy-equipment control panel. Charcoal housings, safety-yellow labels, stencil markings, recessed LCD readouts, real physical buttons. |
| `cabinet-82` | Cabinet '82 | Claude | A real 1982 upright arcade cabinet, done faithfully: black laminate and printed side art, a backlit marquee, a CRT with a proper bezel and glass, real arcade button colours, and instruction cards on the control panel. |
| `site-signage` | Site Signage | Codex | A mine site's safety-signage and wayfinding system (ISO 7010, DIN 1451): yellow and black hazard, green safe conditions, blue mandatory actions, white pictogram plates, rigid grids. |
| `company-desktop` | Company Desktop | Codex | Sweeper Inc.'s internal 1995 desktop software: a Windows 95-style system UI with grey bevels, title bars, a 3D border system, and system fonts. The board is the real Minesweeper look, done precisely. |
