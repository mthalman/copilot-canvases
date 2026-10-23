// Integration tests for lib/server.mjs: start the per-instance HTTP server and
// hit its endpoints with the global fetch API. We exercise the routing layer
// end-to-end. /api/summary reads the user's real ~/.copilot databases (which
// may be absent in CI); getSummary tolerates missing DBs and returns a
// well-formed all-zero summary, so the routing assertions hold either way.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../extensions/copilot-activity/lib/server.mjs";

let entry;
let baseUrl;

before(async () => {
    entry = await startServer({ from: "2024-01-01T00:00:00.000Z", to: "2024-02-01T00:00:00.000Z", days: null });
    baseUrl = entry.url.replace(/\/$/, "");
});

after(async () => {
    await new Promise((resolve) => entry.server.close(() => resolve()));
});

test("GET / returns the HTML dashboard", async () => {
    const r = await fetch(`${baseUrl}/`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /text\/html/);
    const body = await r.text();
    assert.match(body, /<!doctype html>/i);
    assert.match(body, /Copilot Activity/);
});

test("GET /index.html also returns the HTML dashboard", async () => {
    const r = await fetch(`${baseUrl}/index.html`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /text\/html/);
});

test("GET /api/summary returns a JSON summary envelope", async () => {
    const r = await fetch(`${baseUrl}/api/summary`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    const body = await r.json();
    assert.ok(body.totals, "summary has totals");
    assert.equal(typeof body.totals.sessions, "number");
    assert.ok(body.range, "summary echoes the range");
});

test("GET /api/summary honors explicit from/to query params", async () => {
    const from = "2024-03-01T00:00:00.000Z";
    const to = "2024-03-02T00:00:00.000Z";
    const r = await fetch(`${baseUrl}/api/summary?from=${from}&to=${to}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body.range, { from, to });
});

test("GET /events opens a Server-Sent Events stream", async () => {
    const ac = new AbortController();
    const r = await fetch(`${baseUrl}/events`, { signal: ac.signal });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /text\/event-stream/);
    ac.abort();
    // The aborted read rejects; swallow it so the test still resolves cleanly.
    await r.body?.cancel().catch(() => {});
});

test("GET unknown path returns 404", async () => {
    const r = await fetch(`${baseUrl}/no/such/route`);
    assert.equal(r.status, 404);
});
