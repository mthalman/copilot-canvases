# CI Runs

A [canvas extension](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions) for the [GitHub Copilot app](https://github.com/github/app) that surfaces a side-panel dashboard of:

1. **Copilot tab** — pull requests currently in scope as Copilot project sessions on this machine, read directly from `~/.copilot/data.db`. By default this lists only sessions for PRs **you authored**; flip **Show others' PRs** in the `⚙` settings menu to also include sessions for PRs others authored (e.g. codeflow/bot PRs), along with their CI run trees.
2. **All my PRs tab** — every open pull request you authored across GitHub, with their **Azure Pipelines** check status grouped by build, deep-linked into each AzDO job log.
3. **Watched tab** — a manually curated list of any GitHub PRs (yours or not) you want to keep an eye on. Paste a PR URL to start tracking its CI; remove with the ✕ button. Watched PRs participate in the failure / completion notifier the same way authored PRs do.
4. **Inspect mode** — when the canvas is opened with one or more `ciRunUrl` input parameters pointing at **Azure DevOps** pipeline runs, the surface is dedicated to inspecting those runs (the PR tabs are hidden). Lets you inspect a branch's CI run *before* a PR exists. Re-opening the same panel with another run URL adds it to the list; each run has a ✕ button to remove it. Public pipelines are read anonymously; private pipelines authenticate through the Azure CLI.

PRs that appear in both tabs get an `in session` badge in the "All my PRs" view so you can see at a glance which of your open PRs already have a Copilot session waiting on them.

## Requirements

- The [GitHub Copilot app](https://github.com/github/app)
- Node.js 24 or newer (uses built-in `node:sqlite`; no npm dependencies).
- [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth status`).
- *(Optional)* [Azure CLI](https://aka.ms/azure-cli) (`az`), signed in with `az login` — only needed to inspect **private** Azure DevOps pipeline runs via the **CI Run** input (see [Inspecting a CI run by URL](#inspecting-a-ci-run-by-url)). Public pipelines need no auth.

## Install

After this plugin is published in `mthalman/copilot-canvases`, install it with:

```powershell
copilot plugin marketplace add mthalman/copilot-canvases
copilot plugin install ci-runs@copilot-canvases
```

Start a new Copilot app session, then ask it to open `ci-runs`.
See the [repository README](../../README.md#install-an-individual-plugin)
for direct subdirectory installation.

### Migrate an existing standalone installation

Do not load both the old standalone `ci-runs` extension and this plugin:
they declare the same canvas ID. Disable or remove the old extension before
starting a session with the plugin. This repository migration does not change
your installed extensions.

To keep settings, watched PRs, and display snapshots, back up the old extension's
`artifacts` directory and copy it next to the new `extension.mjs` before starting
the plugin. In this checkout that destination is
`extensions\ci-runs\artifacts` relative to this plugin directory; in an installed
plugin it is the same path beneath the installed plugin's root.

## Local development

From the repository root, load the plugin without installing it globally:

```powershell
copilot --plugin-dir .\plugins\ci-runs
```

The runtime lives in `extensions\ci-runs`: `extension.mjs` is the SDK wiring
and `lib` contains the implementation. Tests live in this plugin's `test`
directory. Restart the session after edits, or reload extensions when the
host exposes that tool. The old dev-link scripts are replaced by `--plugin-dir`.

### Tests

Unit tests for everything under `lib/` live in `test/` and use Node's
built-in test runner — no `npm install` step. From this plugin directory,
with Node 24+:

```powershell
npm test
# or, equivalently:
node --test test/*.test.mjs
```

Run `npm test` from the repository root to test every plugin.
[Repository CI](../../.github/workflows/ci.yml) runs those suites across
Linux, macOS, and Windows on Node 24 and 26.

## Usage

Ask the agent something like:

> show me my PR CI runs

The agent will open the `ci-runs` canvas in a side panel. From there:

- Click `↻ Refresh` to re-read the local session DB and re-query GitHub.
- Click the AzDO build link to open the run in `dev.azure.com`.
- Expand `show jobs` on a build to see per-job status with deep links to each job log.
- Open the `⚙` settings menu to toggle notifications, show others' PRs in the Copilot tab, and configure a **repository filter**.

> **Notification scoping:** the Copilot app runs one process per session, so CI
> failure / completion alerts are delivered only to the session(s) that
> currently have the `ci-runs` canvas open **in PR-dashboard mode**. Sessions
> that never opened the canvas (or have since closed it) receive no alerts, even
> with notifications enabled. A panel opened in **inspect mode** (with a
> `ciRunUrl`) hides the PR tabs and does **not** arm the notifier, so inspecting
> a standalone Azure DevOps run won't surface alerts for unrelated PRs. The
> notifier keeps tracking CI state while the panel is closed, so reopening it
> won't replay a backlog of already-settled runs.

### Showing others' PRs in the Copilot tab

By default the **Copilot** tab lists only sessions whose PR **you authored**, so
sessions opened against codeflow/bot PRs (e.g. "Source code updates from …") are
hidden. Enable **Show others' PRs (not just mine)** in the `⚙` settings menu to
also list those sessions and fetch their CI run trees. The tab count then reads
`(shown of total)` so you can see how many sessions are hidden when the toggle
is off, and each not-yours row gets an `@author` badge. The preference persists
to the `display` section of `artifacts/settings.json`. This setting only affects
the Copilot tab's display — it does not change the failure/completion notifier,
which continues to watch your authored and watched PRs.

### Inspecting a CI run by URL

The canvas accepts an optional **`ciRunUrl`** input parameter — the URL of an
Azure DevOps pipeline run. This is handy when you're iterating on a branch and
kicking off ADO builds *before* opening a PR. Ask the agent something like:

> open the CI runs canvas for https://dev.azure.com/{org}/{project}/_build/results?buildId=123

When opened with that input, the canvas enters **inspect mode**: the PR tabs are
hidden and the surface is dedicated to the run(s), showing each build's overall
status and per-job timeline with deep links to each job log. Re-opening the same
panel with another run URL adds it to the list (deduped); each run has a ✕ button
to remove it, and removing the last one leaves an empty placeholder.

- **Public pipelines** are read anonymously — no setup required.
- **Private pipelines** authenticate through the [Azure CLI](https://aka.ms/azure-cli).
  The canvas first tries anonymous access; if Azure DevOps refuses it, it runs
  `az account get-access-token` to mint a token scoped to the Azure DevOps REST
  API. If `az` isn't installed, or you're not signed in, the panel shows an
  actionable message (install `az`, or run `az login`) rather than a raw error.

Only Azure DevOps pipeline URLs (`dev.azure.com/...` or
`{org}.visualstudio.com/...` with a `buildId`) are supported.

### Repository filter

The settings menu (`⚙`) has a **Repository filter** section: a single list of
glob patterns (one per line) matched against each PR's `owner/repo`.

- A bare pattern is an **allowlist** entry — when any allowlist patterns are
  present, only repos matching at least one are queried.
- A pattern prefixed with `!` is an **exclusion** — repos matching it are
  hidden.
- Patterns are evaluated top-to-bottom and the **last** matching line wins
  (just like `.gitignore`), so a later, more-specific line can override an
  earlier broad one.
- An empty list means "all repos".

Glob syntax: `*` matches any characters (including `/`), `?` matches a single
character; matching is case-insensitive. Example:

```
my-org/*
!my-org/legacy-*
```

…queries every repo in `my-org` except those whose name starts with `legacy-`.
Because matching is last-match-wins, you can also carve a single repo back out
of a broad exclusion:

```
!my-org/*
my-org/keep-me
```

…hides every `my-org` repo except `my-org/keep-me`. (Order matters: put the
narrow re-inclusion *after* the broad exclusion.)

The filter applies to the **Copilot** and **All my PRs** tabs (and to the
failure/completion notifier), so a filtered-out repo produces no alerts. It does
**not** apply to the **Watched** tab — that list is an explicit, per-PR allowlist
you curate by URL. The config persists to the `repoFilter` section of
`artifacts/settings.json`.

## Limitations

- **Schema drift**: the GitHub Copilot app's `data.db` schema is internal and may change between app versions. The SQL queries fail gracefully and surface the error in the panel.
- **No deep-link into a Copilot session**: the GitHub Copilot app does not expose a URL scheme, so the "Copilot tab" links to the PR on GitHub rather than the session itself.

## License

MIT — see [LICENSE](./LICENSE).

## Source

Imported from [mthalman/ci-github-canvas](https://github.com/mthalman/ci-github-canvas)
at commit `bbeb9b478479bd95c2cd8ed70a9e3d0cb5ab4bbb`.
Runtime code is preserved; packaging, test import paths, and documentation
are adapted for this repository. The original repository is not modified.
