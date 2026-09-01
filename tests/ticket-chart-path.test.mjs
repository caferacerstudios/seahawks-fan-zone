import test from "node:test";
import assert from "node:assert/strict";
import { chartPath } from "../src/lib/tickets/chart-path.mjs";

test("chart path handles empty, single-point, and two-point runs", () => {
  assert.equal(chartPath([]), "");
  assert.equal(chartPath([{ x: 4, y: 8 }]), "M4,8");
  assert.equal(chartPath([{ x: 0, y: 2 }, { x: 10, y: 7 }]), "M0,2 L10,7");
});

test("chart path uses shape-preserving cubic curves through every source point", () => {
  const points = [{ x: 0, y: 10 }, { x: 10, y: 5 }, { x: 20, y: 8 }, { x: 30, y: 2 }];
  const path = chartPath(points);
  assert.equal((path.match(/ C/g) || []).length, points.length - 1);
  for (const point of points) assert.match(path, new RegExp(`(?:M| )${point.x},${point.y}(?: C|$)`));

  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  assert.ok(numbers.every(Number.isFinite));
  assert.match(path, /C/);
});

test("monotone runs keep cubic control points within neighboring values", () => {
  const path = chartPath([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }]);
  const yCoordinates = [...path.matchAll(/(?:M|C| )-?\d+(?:\.\d+)?(?:,)(-?\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
  assert.ok(yCoordinates.every(y => y >= 0 && y <= 20));
});
