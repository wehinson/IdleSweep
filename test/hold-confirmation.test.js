import test from "node:test";
import assert from "node:assert/strict";
import { createHoldConfirmation } from "../src/engine/hold-confirmation.js";

test("delete confirmation requires arming and one uninterrupted four-second hold", () => {
  const hold = createHoldConfirmation();
  hold.start(0);
  assert.equal(hold.snapshot(5000).confirmed, false);
  hold.arm();
  hold.start(100);
  assert.equal(hold.snapshot(2100).progress, 0.5);
  assert.equal(hold.snapshot(4099).confirmed, false);
  assert.equal(hold.snapshot(4100).confirmed, true);
});

test("early release, Escape, and focus loss clear elapsed hold time", () => {
  const hold = createHoldConfirmation();
  hold.arm();
  hold.start(0);
  hold.cancel();
  hold.start(3000);
  assert.equal(hold.snapshot(5000).confirmed, false);
  hold.cancel(true);
  assert.deepEqual(hold.snapshot(10000), { armed: false, holding: false, progress: 0, confirmed: false });
});
