import test from "node:test";
import assert from "node:assert/strict";
import { createGame } from "../src/engine/game-engine.js";

test("engine dispatches deterministic actions and publishes effects", () => {
  const seen = [];
  const game = createGame({
    config: {},
    initialState: { ticks: 0 },
    clock: () => 100,
    rng: () => 0.25,
    reducer(state, action, services) {
      if (action.type === "tick") {
        return { state: { ticks: state.ticks + action.deltaMs }, effects: [{ type: "clock", at: services.clock() }] };
      }
      return state;
    },
  });
  game.subscribe((state, action, effects) => seen.push({ state, action, effects }));
  game.tick(50);
  assert.deepEqual(game.getState(), { ticks: 50 });
  assert.equal(seen[0].effects[0].at, 100);
});
