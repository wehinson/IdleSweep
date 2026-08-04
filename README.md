# Idle Sweep

Idle Sweep is a dependency-free browser game built with native ES modules.

## Run locally

Native modules must be served over HTTP rather than opened with `file://`:

```powershell
npm run serve
```

Then open <http://localhost:8080>. Run the engine and save-state tests with
`npm test`.

The game autosaves in the browser. The Settings panel can export the complete
save as JSON or import a previously exported save.

## Engine tests

`npm test` runs the game engine directly with Node's built-in test runner. The
suite does not create a DOM or load the UI. Round scenarios dispatch actions to
`createRoundEngine`, with deterministic mine placement supplied through an
injected random-number function.
