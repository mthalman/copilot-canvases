// Read-only aggregation of local GitHub Copilot activity from the app's
// SQLite databases. All timestamps stored by the app are ISO-8601 UTC ("...Z")
// strings, which sort lexicographically, so a range filter is a plain string
// comparison: created_at >= from AND created_at < to.

import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const COPILOT_DIR = path.join(os.homedir(), ".copilot");
const DATA_DB = path.join(COPILOT_DIR, "data.db");
const STORE_DB = path.join(COPILOT_DIR, "session-store.db");

function openRO(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return new DatabaseSync(file, { readOnly: true });
    } catch {
        return null;
    }
}

function dayOf(iso) {
    return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "unknown";
}

function bump(map, key) {
    const k = key == null || key === "" ? "unknown" : String(key);
    map.set(k, (map.get(k) || 0) + 1);
}

function toSortedArray(map, limit) {
    const arr = [...map.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
    return limit ? arr.slice(0, limit) : arr;
}

function allQuery(db, sql, ...params) {
    if (!db) return [];
    try {
        return db.prepare(sql).all(...params);
    } catch {
        return [];
    }
}

// Returns a fully aggregated summary for the half-open [from, to) window.
// Database file paths are injectable (defaulting to the real ~/.copilot
// locations) so the aggregation can be exercised against fixture databases
// in unit tests without touching the user's data.
export function getSummary(from, to, { dataDb = DATA_DB, storeDb = STORE_DB } = {}) {
    const data = openRO(dataDb);
    const store = openRO(storeDb);

    const totals = {
        sessions: 0,
        interactions: 0,
        prsMerged: 0,
        prsApproved: 0,
        prComments: 0,
        workflowRuns: 0,
        tokens: { input: 0, output: 0, cached: 0, reasoning: 0, total: 0 },
    };
    const dailySessions = new Map();
    const dailyInteractions = new Map();
    const byModel = new Map();
    const byType = new Map();
    const byMode = new Map();
    const byExecLocation = new Map();
    const activityByType = new Map();
    const topRepos = new Map();
    const workflowByStatus = new Map();
    const recentActivity = [];

    // --- data.db: sessions ---
    const sessions = allQuery(
        data,
        `SELECT session_type, model, mode, execution_location, created_at,
                total_input_tokens, total_output_tokens, total_cached_tokens, total_reasoning_tokens
         FROM sessions
         WHERE created_at >= ? AND created_at < ?`,
        from,
        to,
    );
    for (const s of sessions) {
        totals.sessions++;
        totals.tokens.input += s.total_input_tokens || 0;
        totals.tokens.output += s.total_output_tokens || 0;
        totals.tokens.cached += s.total_cached_tokens || 0;
        totals.tokens.reasoning += s.total_reasoning_tokens || 0;
        bump(dailySessions, dayOf(s.created_at));
        bump(byModel, s.model);
        bump(byType, s.session_type);
        bump(byMode, s.mode);
        bump(byExecLocation, s.execution_location);
    }
    totals.tokens.total = totals.tokens.input + totals.tokens.output;

    // --- data.db: activity_items ---
    const activity = allQuery(
        data,
        `SELECT activity_type, created_at, preview, session_id
         FROM activity_items
         WHERE created_at >= ? AND created_at < ?
         ORDER BY created_at DESC`,
        from,
        to,
    );
    for (const a of activity) {
        bump(activityByType, a.activity_type);
        if (a.activity_type === "pr_merged") totals.prsMerged++;
        else if (a.activity_type === "pr_approved") totals.prsApproved++;
        else if (a.activity_type === "pr_comment_added") totals.prComments++;
        if (recentActivity.length < 40) {
            recentActivity.push({
                type: a.activity_type,
                created_at: a.created_at,
                preview: (a.preview || "").slice(0, 220),
                session_id: a.session_id,
            });
        }
    }

    // --- data.db: workflow_runs ---
    const runs = allQuery(
        data,
        `SELECT status, started_at FROM workflow_runs
         WHERE started_at >= ? AND started_at < ?`,
        from,
        to,
    );
    for (const r of runs) {
        totals.workflowRuns++;
        bump(workflowByStatus, r.status);
    }

    // --- session-store.db: turns (interactions) ---
    const turns = allQuery(
        store,
        `SELECT timestamp FROM turns WHERE timestamp >= ? AND timestamp < ?`,
        from,
        to,
    );
    for (const t of turns) {
        totals.interactions++;
        bump(dailyInteractions, dayOf(t.timestamp));
    }

    // --- session-store.db: sessions (top repositories) ---
    const storeSessions = allQuery(
        store,
        `SELECT repository, created_at FROM sessions
         WHERE created_at >= ? AND created_at < ?`,
        from,
        to,
    );
    for (const s of storeSessions) {
        if (s.repository) bump(topRepos, s.repository);
    }

    data?.close();
    store?.close();

    return {
        range: { from, to },
        generatedAt: new Date().toISOString(),
        totals,
        daily: {
            sessions: Object.fromEntries(dailySessions),
            interactions: Object.fromEntries(dailyInteractions),
        },
        byModel: toSortedArray(byModel),
        byType: toSortedArray(byType),
        byMode: toSortedArray(byMode),
        byExecLocation: toSortedArray(byExecLocation),
        activityByType: toSortedArray(activityByType),
        topRepos: toSortedArray(topRepos, 10),
        workflowByStatus: toSortedArray(workflowByStatus),
        recentActivity,
    };
}

export function dataAvailable(dataDb = DATA_DB) {
    return fs.existsSync(dataDb);
}
