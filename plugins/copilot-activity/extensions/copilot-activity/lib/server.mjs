// Local HTTP server that backs the canvas iframe. Each panel instance gets
// its own ephemeral 127.0.0.1 server; the canvas open handler in extension.mjs
// starts one per instanceId (tracking the returned entry) and closes it on
// onClose. The entry carries the connected SSE clients and the currently
// displayed period so the agent actions can mutate and broadcast it.

import { createServer } from "node:http";

import { getSummary } from "./db.mjs";
import { computeRange } from "./range.mjs";
import { renderHtml } from "./ui.mjs";

export function sendJson(res, obj, status = 200) {
    const body = JSON.stringify(obj);
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(body);
}

// Push the current period to every connected SSE client so open canvases
// live-update when the agent (or another action) changes the window.
export function broadcastPeriod(entry) {
    const payload = JSON.stringify(entry.period);
    for (const res of entry.clients) {
        try {
            res.write(`event: period\ndata: ${payload}\n\n`);
        } catch {
            /* client gone */
        }
    }
}

// Start a loopback-only server for a single canvas instance. Returns the
// entry object (with `server`, `url`, `clients`, and `period`) that the
// caller keeps to drive broadcasts and teardown.
export async function startServer(initialPeriod) {
    const entry = { clients: new Set(), period: initialPeriod };

    const server = createServer((req, res) => {
        const url = new URL(req.url, "http://127.0.0.1");

        if (url.pathname === "/" || url.pathname === "/index.html") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            res.end(renderHtml(entry.period));
            return;
        }

        if (url.pathname === "/api/summary") {
            const from = url.searchParams.get("from");
            const to = url.searchParams.get("to");
            try {
                const range = from && to ? { from, to } : computeRange(entry.period);
                sendJson(res, getSummary(range.from, range.to));
            } catch (err) {
                sendJson(res, { error: String(err?.message || err) }, 500);
            }
            return;
        }

        if (url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            entry.clients.add(res);
            req.on("close", () => entry.clients.delete(res));
            return;
        }

        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
    });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    entry.server = server;
    entry.url = `http://127.0.0.1:${port}/`;
    return entry;
}
