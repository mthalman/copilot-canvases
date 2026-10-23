// Unit tests for lib/range.mjs — pure date math, no I/O.

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeRange } from "../extensions/copilot-activity/lib/range.mjs";

test("computeRange: explicit from/to passes through with days null", () => {
    const r = computeRange({ from: "2024-01-01T00:00:00.000Z", to: "2024-02-01T00:00:00.000Z" });
    assert.deepEqual(r, {
        from: "2024-01-01T00:00:00.000Z",
        to: "2024-02-01T00:00:00.000Z",
        days: null,
    });
});

test("computeRange: explicit from/to preserves an explicit days value", () => {
    const r = computeRange({ from: "2024-01-01T00:00:00.000Z", to: "2024-02-01T00:00:00.000Z", days: 7 });
    assert.equal(r.days, 7);
});

test("computeRange: defaults to a 30-day look-back when nothing is given", () => {
    const r = computeRange();
    assert.equal(r.days, 30);
    const spanMs = Date.parse(r.to) - Date.parse(r.from);
    const expected = 30 * 86400000;
    // Allow a little slack for clock movement between the two now() reads.
    assert.ok(Math.abs(spanMs - expected) < 5000, `span ${spanMs} ~= ${expected}`);
});

test("computeRange: days:0 means all time from a fixed floor", () => {
    const r = computeRange({ days: 0 });
    assert.equal(r.days, 0);
    assert.equal(r.from, "2000-01-01T00:00:00.000Z");
    assert.ok(Date.parse(r.to) > Date.parse(r.from));
});

test("computeRange: a numeric days produces a window of that many days", () => {
    const r = computeRange({ days: 7 });
    assert.equal(r.days, 7);
    const spanMs = Date.parse(r.to) - Date.parse(r.from);
    assert.ok(Math.abs(spanMs - 7 * 86400000) < 5000);
});

test("computeRange: from/to are valid ISO-8601 strings", () => {
    const r = computeRange({ days: 1 });
    assert.match(r.from, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.match(r.to, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});
