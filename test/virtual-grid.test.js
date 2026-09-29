import test from "node:test";
import assert from "node:assert/strict";
import { visibleGridRange, visibleIndexes } from "../src/ui/virtual-grid.js";

test("virtual range renders only the visible Board region with overscan", () => {
  const range = visibleGridRange({ scrollLeft: 340, scrollTop: 680, clientWidth: 340, clientHeight: 340, rows: 1000, cols: 1000, cellSize: 34, overscan: 2 });
  assert.deepEqual(range, { firstRow: 18, lastRow: 32, firstCol: 8, lastCol: 22 });
  assert.equal(visibleIndexes(range, 1000).length, 225);
});
