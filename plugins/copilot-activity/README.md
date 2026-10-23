# Copilot Activity

A [GitHub Copilot CLI](https://github.com/github/copilot-cli) **canvas extension** that summarizes your local Copilot activity for a chosen time period in an interactive dashboard.

It reads the Copilot app's local SQLite databases (read-only) and renders stat cards, charts, and breakdowns in a side-panel canvas.

## Features

- **Stat cards** — interactions, sessions, total tokens, PRs merged
- **Daily activity** column chart (interactions per day)
- **Breakdowns** — sessions by model, by session type, token usage, top repositories, activity types, workflow runs
- **Recent activity** feed
- **Time-period controls** — presets (24h / 7d / 30d / 90d / All) plus custom from/to date pickers
- **Agent-callable actions**:
  - `set_period` — change the period shown in the open canvas (live-updates over SSE)
  - `get_summary` — return aggregated stats for a period without changing the canvas

The dashboard page is fully self-contained (no external/CDN dependencies).

## Data sources

All reads are **read-only** against the Copilot app databases in `~/.copilot`:

| File | Tables used |
| --- | --- |
| `data.db` | `sessions` (tokens, model, type, mode), `activity_items` (PR events, agent events), `workflow_runs` |
| `session-store.db` | `turns` (interactions), `sessions` (top repositories) |

Timestamps stored by the app are ISO-8601 UTC strings, so date-range filtering is a simple lexicographic comparison.

## Files

| File | Purpose |
| --- | --- |
| `extensions/copilot-activity/extension.mjs` | Thin entry point — `joinSession` + `createCanvas`, per-instance canvas lifecycle (start/teardown of the local server) |
| `extensions/copilot-activity/lib/db.mjs` | Read-only SQLite aggregation via Node's built-in `node:sqlite` (DB paths injectable for tests) |
| `extensions/copilot-activity/lib/ui.mjs` | Self-contained dashboard page (HTML/CSS/JS) served to the canvas |
| `extensions/copilot-activity/lib/range.mjs` | Resolves a period descriptor (`days` / `from` / `to`) into a concrete `[from, to)` window |
| `extensions/copilot-activity/lib/server.mjs` | Per-instance loopback HTTP server, `/api/summary` routing, and SSE live updates |
| `test/*.test.mjs` | Unit/integration tests for everything under `lib/`, run with Node's built-in test runner |

All testable logic lives under `extensions/copilot-activity/lib/` so it can be exercised without bootstrapping a live Copilot SDK session; `extension.mjs` is just the SDK-wiring shell.

## Installation

After this plugin is published in `mthalman/copilot-canvases`, install it with:

```powershell
copilot plugin marketplace add mthalman/copilot-canvases
copilot plugin install copilot-activity@copilot-canvases
```

Start a new Copilot app session. The canvas keeps the ID `copilot-activity`.
See the [repository README](../../README.md#install-an-individual-plugin)
for direct subdirectory installation.

Do not load both the old standalone `copilot-activity` extension and this plugin:
they declare the same canvas ID. Disable or remove the old extension before
starting a session with the plugin. This repository migration does not change
your installed extensions. The dashboard reads the same local databases, so
no activity data needs to be moved.

## Local development

From the repository root, load the plugin without installing it globally:

```powershell
copilot --plugin-dir .\plugins\copilot-activity
```

Restart the session after edits, or reload extensions when the host exposes that
tool. The old dev-link scripts are replaced by `--plugin-dir`.

### Tests

Unit tests for the runtime modules live in `test/` and use Node's built-in
test runner — no `npm install` step. From this plugin directory, with Node 24+:

```powershell
npm test
# or, equivalently:
node --test test/*.test.mjs
```

Run `npm test` from the repository root to test every plugin.
[Repository CI](../../.github/workflows/ci.yml) runs those suites across
Linux, macOS, and Windows on Node 24 and 26.

## Requirements

- Node.js 24+ (uses the built-in `node:sqlite` module)
- The `@github/copilot-sdk` import is resolved automatically by the Copilot CLI — you don't install it.

## Usage

Open the canvas from the Copilot CLI (the agent can open it for you), then use the preset buttons or date pickers to change the period. You can also ask the agent things like "show me the last 90 days" or "how many PRs did I merge this week?", which drive the `set_period` / `get_summary` actions.

## Notes

- All data stays local; nothing is sent anywhere.
- Each open canvas instance runs its own loopback-only HTTP server on an ephemeral port.

## Source

Imported from [mthalman/copilot-activity-extension](https://github.com/mthalman/copilot-activity-extension)
at commit `04f2624741c5c493698051ab47f6d37ba7b8e5fe`.
Runtime code is preserved; packaging, test import paths, and documentation
are adapted for this repository. The original repository is not modified.
