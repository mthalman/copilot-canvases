// Extension: copilot-activity
// Summarizes the user's local GitHub Copilot activity for a given time period
// in an interactive canvas.

import { joinSession, createCanvas } from "@github/copilot-sdk/extension";

import { getSummary, dataAvailable } from "./lib/db.mjs";
import { computeRange } from "./lib/range.mjs";
import { startServer, broadcastPeriod } from "./lib/server.mjs";

// One local HTTP server per open canvas instance (its own ephemeral port),
// keyed by ctx.instanceId. The open handler starts/reuses one; onClose tears
// it down. Lives here because it's tied to the canvas lifecycle.
// entry = { server, url, clients: Set<res>, period }
const servers = new Map();

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "copilot-activity",
            displayName: "Copilot Activity",
            description:
                "Dashboard summarizing your local GitHub Copilot activity (sessions, tokens, PRs, and events) for a chosen time period.",
            inputSchema: {
                type: "object",
                properties: {
                    days: {
                        type: "number",
                        description: "Look-back window in days (e.g. 1, 7, 30, 90). Use 0 for all time.",
                    },
                    from: { type: "string", description: "Start of range (ISO-8601). Overrides days when paired with 'to'." },
                    to: { type: "string", description: "End of range (ISO-8601). Overrides days when paired with 'from'." },
                },
            },
            actions: [
                {
                    name: "set_period",
                    description:
                        "Change the time period shown in the open Copilot Activity canvas. Provide 'days' (0 = all time) or an explicit 'from'/'to' ISO range.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            days: { type: "number", description: "Look-back window in days; 0 for all time." },
                            from: { type: "string", description: "Start ISO-8601 timestamp." },
                            to: { type: "string", description: "End ISO-8601 timestamp." },
                        },
                    },
                    handler: async (ctx) => {
                        const entry = servers.get(ctx.instanceId);
                        if (!entry) return { ok: false, error: "Canvas is not open." };
                        entry.period = computeRange(ctx.input || {});
                        broadcastPeriod(entry);
                        const summary = getSummary(entry.period.from, entry.period.to);
                        return { ok: true, period: entry.period, totals: summary.totals };
                    },
                },
                {
                    name: "get_summary",
                    description:
                        "Return aggregated Copilot activity stats for a time period without changing the canvas. Provide 'days' (0 = all time) or an explicit 'from'/'to' ISO range.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            days: { type: "number", description: "Look-back window in days; 0 for all time." },
                            from: { type: "string", description: "Start ISO-8601 timestamp." },
                            to: { type: "string", description: "End ISO-8601 timestamp." },
                        },
                    },
                    handler: async (ctx) => {
                        const range = computeRange(ctx.input || {});
                        return getSummary(range.from, range.to);
                    },
                },
            ],
            open: async (ctx) => {
                if (!dataAvailable()) {
                    await session.log("copilot-activity: local data.db not found.", { level: "warning" });
                }
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    const period = computeRange(ctx.input || {});
                    entry = await startServer(period);
                    servers.set(ctx.instanceId, entry);
                } else if (ctx.input && (ctx.input.days != null || (ctx.input.from && ctx.input.to))) {
                    entry.period = computeRange(ctx.input);
                    broadcastPeriod(entry);
                }
                return { title: "Copilot Activity", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    for (const res of entry.clients) {
                        try {
                            res.end();
                        } catch {
                            /* ignore */
                        }
                    }
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});
