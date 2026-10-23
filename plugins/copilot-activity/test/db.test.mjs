// Unit tests for lib/db.mjs aggregation. We build fixture SQLite databases in
// a temp dir with just the columns getSummary reads, then point getSummary at
// them via its injectable path options — no dependency on the user's real
// ~/.copilot databases.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { getSummary, dataAvailable } from "../extensions/copilot-activity/lib/db.mjs";

let tmpDir;
let dataDb;
let storeDb;

// In-range window used by every assertion below.
const FROM = "2024-03-01T00:00:00.000Z";
const TO = "2024-04-01T00:00:00.000Z";
const IN1 = "2024-03-05T10:00:00.000Z";
const IN2 = "2024-03-06T11:00:00.000Z";
const OUT_BEFORE = "2024-02-01T00:00:00.000Z";
const OUT_AFTER = "2024-05-01T00:00:00.000Z";

before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-activity-db-"));
    dataDb = path.join(tmpDir, "data.db");
    storeDb = path.join(tmpDir, "session-store.db");

    const data = new DatabaseSync(dataDb);
    data.exec(`
        CREATE TABLE sessions (
            session_type TEXT, model TEXT, mode TEXT, execution_location TEXT, created_at TEXT,
            total_input_tokens INTEGER, total_output_tokens INTEGER,
            total_cached_tokens INTEGER, total_reasoning_tokens INTEGER
        );
        CREATE TABLE activity_items (
            activity_type TEXT, created_at TEXT, preview TEXT, session_id TEXT
        );
        CREATE TABLE workflow_runs (status TEXT, started_at TEXT);
    `);

    const insSession = data.prepare(
        `INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Two in-range sessions + one out-of-range that must be excluded.
    insSession.run("chat", "gpt-x", "agent", "local", IN1, 100, 50, 10, 5);
    insSession.run("chat", "gpt-x", "ask", "remote", IN2, 200, 80, 20, 0);
    insSession.run("chat", "gpt-y", "agent", "local", OUT_BEFORE, 999, 999, 999, 999);

    const insActivity = data.prepare(`INSERT INTO activity_items VALUES (?, ?, ?, ?)`);
    insActivity.run("pr_merged", IN1, "merged a PR", "s1");
    insActivity.run("pr_approved", IN1, "approved", "s1");
    insActivity.run("pr_comment_added", IN2, "commented", "s2");
    insActivity.run("pr_merged", OUT_AFTER, "out of range", "s9");

    const insRun = data.prepare(`INSERT INTO workflow_runs VALUES (?, ?)`);
    insRun.run("completed", IN1);
    insRun.run("failed", IN2);
    insRun.run("completed", OUT_AFTER);
    data.close();

    const store = new DatabaseSync(storeDb);
    store.exec(`
        CREATE TABLE turns (timestamp TEXT);
        CREATE TABLE sessions (repository TEXT, created_at TEXT);
    `);
    const insTurn = store.prepare(`INSERT INTO turns VALUES (?)`);
    insTurn.run(IN1);
    insTurn.run(IN2);
    insTurn.run(OUT_BEFORE);
    const insStoreSession = store.prepare(`INSERT INTO sessions VALUES (?, ?)`);
    insStoreSession.run("octo/repo-a", IN1);
    insStoreSession.run("octo/repo-a", IN2);
    insStoreSession.run("octo/repo-b", IN1);
    insStoreSession.run("octo/repo-out", OUT_AFTER);
    store.close();
});

after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("getSummary: totals only count in-range sessions and sum their tokens", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.equal(s.totals.sessions, 2);
    assert.equal(s.totals.tokens.input, 300);
    assert.equal(s.totals.tokens.output, 130);
    assert.equal(s.totals.tokens.cached, 30);
    assert.equal(s.totals.tokens.reasoning, 5);
    assert.equal(s.totals.tokens.total, 430);
});

test("getSummary: PR activity counts come from in-range activity_items", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.equal(s.totals.prsMerged, 1);
    assert.equal(s.totals.prsApproved, 1);
    assert.equal(s.totals.prComments, 1);
});

test("getSummary: workflow runs are counted and grouped by status", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.equal(s.totals.workflowRuns, 2);
    const byStatus = Object.fromEntries(s.workflowByStatus.map((x) => [x.key, x.count]));
    assert.equal(byStatus.completed, 1);
    assert.equal(byStatus.failed, 1);
});

test("getSummary: interactions come from in-range turns", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.equal(s.totals.interactions, 2);
});

test("getSummary: top repositories are aggregated and sorted by count", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.equal(s.topRepos[0].key, "octo/repo-a");
    assert.equal(s.topRepos[0].count, 2);
    const repos = s.topRepos.map((r) => r.key);
    assert.ok(!repos.includes("octo/repo-out"));
});

test("getSummary: byModel groups in-range sessions by model", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    const byModel = Object.fromEntries(s.byModel.map((x) => [x.key, x.count]));
    assert.equal(byModel["gpt-x"], 2);
    assert.ok(!("gpt-y" in byModel));
});

test("getSummary: range and generatedAt are echoed in the result", () => {
    const s = getSummary(FROM, TO, { dataDb, storeDb });
    assert.deepEqual(s.range, { from: FROM, to: TO });
    assert.match(s.generatedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test("getSummary: missing databases yield an all-zero summary, not a throw", () => {
    const s = getSummary(FROM, TO, {
        dataDb: path.join(tmpDir, "nope-data.db"),
        storeDb: path.join(tmpDir, "nope-store.db"),
    });
    assert.equal(s.totals.sessions, 0);
    assert.equal(s.totals.interactions, 0);
    assert.deepEqual(s.recentActivity, []);
});

test("dataAvailable: true for an existing file, false for a missing one", () => {
    assert.equal(dataAvailable(dataDb), true);
    assert.equal(dataAvailable(path.join(tmpDir, "missing.db")), false);
});
