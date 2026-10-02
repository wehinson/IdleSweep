# Branch status

## working-redesign — Five theme redesigns

- Category: display.
- Agent: Claude, with Codex as a collaborator.
- Base: `f3c5156` on `working`, in the worktree `C:\Code\IdleSweep-redesign`. The active `working` checkout is unchanged.
- Status: Ready for William to test. Experimental; not for release.
- Changes:
  - `themes/theme-kit.js` is a presentation-only runtime. It remaps text, glyphs, and fonts at render time, sets `html[data-theme]`, and adds a theme picker at the bottom left. Reads of `textContent`/`getAttribute` return the original text, so saves and game state never hold themed words.
  - Round 2 (William's feedback: keep the mining company and its words, and make it look better). Five designs that rename nothing and each re-lay out the page to fit 1440x900: Survey Ledger, Field Unit, and Cabinet '82 (Claude); Site Signage and Company Desktop (Codex). `themes/DESIGN-BRIEF.md` holds the references and the rules against slop. The round 1 reskins were removed.
  - `styles.css` lifts fonts, panel colours, number colours, and the mine colour into variables. The defaults are the same values as before.
  - `npm run theme-lab` serves both games' redesigns on port 8090.
- Tests: `npm test` passed all 109 tests, including `test/themes.test.js` (theme validity, CSS scoping, core vocabulary, colour-key collisions).
- UI verification: William approved in-app browser checks. Every theme loads with no console errors. Round 2 was checked at 1440x900, 900x560, and 375 px, on normal and 25x25 boards, and with the contract dialog open. No theme overflows at 375 px width. Original looks as before.
- Not verified: late-game panels (District map, Auto Mine crew, restructure modal) in every theme.
- Version impact: none. No save-format change; the theme choice is stored in `idle-sweeper.theme.v1`.
- Last update: 2026-09-30.

# Work log

- Branch: `working`, started from shipped commit `04f4295` on `main`.
- Agent: Codex.
- Status: Ready to Ship.
- Local server: `http://localhost:8080`, run with `node scripts/serve.js`.
- Verification: 104 engine tests pass. Approved isolated Edge checks pass with no script errors or browser alerts. JavaScript syntax, HTTP, and Git whitespace checks pass.
- Version impact: Current version is `0.2.6`; bump at ship.
- Last update: 2026-09-30.
- Notes: Refresh the local app after file changes. Existing progress keeps its purse; new games and new Runs start with $100. The live app remains on `main`.

## Requested changes checked

| Item | Result | Verification |
| --- | --- | --- |
| 1. Separate Workshop and Quartermaster | Quartermaster has Supplies and Equipment. Workshop has Upgrades, including storage, and Abilities. | Browser panel checks. |
| 2. One-term headings | Quartermaster, Supplies, Equipment, Workshop, Upgrades, and Abilities each use one heading. | Browser heading checks. |
| 3. Equipment theme and unlocks | Equipment uses the supply button style. The panel and inventory button appear after a recovered mine. Each purchase reveals the next item in price order. Starter tools do not unlock the panel or count as purchases. Purchase history survives use, reload, and restructuring. | Engine progression and retention tests; browser purchase, style, and reload checks. |
| 4. Starting purse | New games and new Runs start with $100. | Configuration and fresh-game browser check. |
| 5. Compact restructuring popup | Height is limited to the viewport. Content scrolls. Statistics use three columns, or two on small screens, with each label and value on one row. Action buttons stay visible. | Browser checks at 1440x800 and 390x520; Cancel works. |
| 6. Escape closes popups | Escape closes restructuring, contract, field-clear, Field Spec, inventory, and tooltips, and cancels equipment selection and delete confirmation. | Browser restructuring, Field Spec, and inventory checks; key handler inspection for the other popups. |
| 7. Hold to delete | First click arms the button. An uninterrupted four-second hold deletes progress. A red bar fills the button. Early release, Escape, focus loss, or page hiding cancels the hold. Pointer and keyboard input work. | Engine timing tests; browser midpoint, early release, full hold, keyboard, and Escape checks. No delete alert. |
| 8. Constant order | Upgrades and equipment unlock as growing prefixes in their fixed order. Storage upgrades follow the other upgrades. Abilities stay in their fixed order. | Engine and browser prefix checks; catalog order test. |
| 9. Keep maximum upgrades | Shovel, storage, Safety Radius, and Chording remain visible, disabled, and marked Max at their limits. | Browser maximum state checks. |
| 10. Scale flag replacement | Replacement restores half of flag capacity, rounded down: 7, 50, 125, or 250. Replacement cannot exceed missing flags. | Engine pool tests and browser detail check. |
| 11. Remove yellow Field Spec outlines | Keyboard focus uses a cyan inset cue instead of a yellow outline. | Browser computed style and Escape check. |
| 12. Raise treasure costs | Add Treasure starts at $120 with 2.0 growth; Add Mine starts at $90 with 1.8 growth. The treasure cross-cost factor from mines is 1.06. | Engine price comparisons across 15 levels. |
| 13. Two chording levels | First level costs 3 mines and opens touching tiles only. Second costs 8 mines and opens the full zero cascade. Existing saves with chording keep cascade access. | Direct engine reveal and reward checks; browser purchases and saved level checks. |

## Files and checks

- Application files changed: config, game adapter, HTML, CSS; shop, abilities, hold confirmation, catalog, round, and profile engine modules; save validation; hold button UI.
- Tests changed: shop, hold confirmation, rounds, cross costs, catalog order, and save state.
- Commands: `npm test`, `node --check`, `git diff --check`, direct HTTP requests, and approved isolated Edge checks.
- Recommendation: Ready to ship when requested. No release or deployment was performed for this change request.
