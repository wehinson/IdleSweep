# Theme redesigns

This branch (`working-redesign`) holds five redesigns (round 3) of Sweeper Inc. Use the
theme picker at the bottom-left of the page to switch between them. You can also
open `?theme=<id>`. **Original** is the default, and it is unchanged.

| id | Name | Designer |
| --- | --- | --- |
| `classic-95` | Classic 95 | Claude |
| `night-shift` | Night Shift | Claude |
| `desert-95` | Desert | Claude |
| `program-manager` | Program Manager | Codex |
| `luna-xp` | Luna | Codex |

Round 3 (William's feedback: Company Desktop was the clear favourite). Five versions of the classic Windows Minesweeper look, with the board in the middle, Survey Ledger-level readability, a dark version (Night Shift), and a sand texture (Desert): Classic 95, Night Shift, and Desert (Claude); Program Manager and Luna (Codex). Claude's three come from one window system in `themes/_build`. The round 2 designs were removed. Every design keeps the game's words. See `DESIGN-BRIEF.md` for the rules against slop.

## How a theme works

A theme changes only presentation. It never changes engine state, config values, or save data.

- `themes/theme-kit.js` is shared by all themes. It does these things:
  - It remaps display text: DOM text nodes, the `title`, `aria-label`, `data-tooltip`, `placeholder`, and `alt` attributes, and canvas `fillText`.
  - It remaps literal canvas colours and fonts.
  - It sets `<html data-theme="<id>">`.
  - It loads the theme's Google Fonts.
  - It draws the picker.
- `themes/<id>/theme.js` calls `ThemeKit.register({...})` with these fields:
  - `id`, `name`, `author` (`"Claude"` or `"Codex"`), `title` (the document title)
  - `fonts`: a Google Fonts CSS URL
  - `phrases`: `{ "Original text": "Themed text" }`. Matches are whole words and longest first. UPPERCASE and Capitalized variants are added automatically. Glyphs such as `✹` can be keys too.
  - `labels` (optional): `{ "#css-selector": "inner HTML" }` for fixed elements whose label spans several nodes, such as `Auto<br>Mine`.
  - `canvas` (optional): `{ colors: { "#hex": "#hex" }, fonts: { "Courier New": "Family" } }`
- `themes/<id>/theme.css`: **every selector must start with `html[data-theme="<id>"]`**. `npm test` checks this. Override the `:root` variables on `html[data-theme="<id>"]`, then restyle any selector in `styles.css`. You can use `::before`/`::after`, backgrounds, SVG data URIs, and keyframes. Name keyframes `<id>-<name>`.

## Rules

- Do not edit `game.js`, `config.js`, `src/engine/**`, or `styles.css` for a theme.
- The Original theme must look and read exactly as before.
- Engine tests must still pass (`npm test`), including `test/themes.test.js`.
- Text replacements must keep the meaning. The player must still understand each control.

## Theme Lab (one server for both games)

```
npm run theme-lab
```

This opens <http://localhost:8090>. The index lists both games and every theme. `/sweep/` serves the IdleSweep redesign worktree, and `/snake/` serves the IdleSnake redesign worktree. They must be sibling folders (`C:\Code\IdleSweep-redesign` and `C:\Code\IdleSnake-redesign`), or you can set `SWEEP_ROOT` and `SNAKE_ROOT`. Each game's own `npm run serve` also works; use the picker there.
