# copilot-canvases

Custom GitHub Copilot canvases, packaged as independently installable plugins:
one plugin per canvas. The root is a plugin marketplace, not a canvas extension.

## Plugins

- [CI Runs](plugins/ci-runs/README.md) (`ci-runs`): Copilot sessions, PRs,
  Azure Pipelines, and GitHub Actions dashboards.
- [Copilot Activity](plugins/copilot-activity/README.md) (`copilot-activity`):
  local sessions, token usage, PR activity, and event statistics.

Each `plugins\<name>` directory is independently installable and contains its
own `.github\plugin\plugin.json` and `extensions\<name>\extension.mjs`.
Imported plugins also keep their tests, test-only `package.json`, and
documentation inside their plugin directory. Source snapshot commits and
standalone-install migration notes are in each plugin's README.

## Try a plugin locally

Use a recent Copilot CLI and a canvas-capable host such as the GitHub Copilot app.
The canvas SDK is experimental; a plain terminal cannot display the canvas.
Node.js 24 or newer is required for the full dependency-free test suite
and the imported canvases, which use built-in `node:sqlite`.

From this repository, load a plugin for a CLI session:

```powershell
copilot --plugin-dir .\plugins\copilot-activity
```

This development flag does not install the plugin globally. In a canvas-capable
session using the plugin, ask Copilot to open `copilot-activity` with input `{}`.
Expect the **Copilot Activity** dashboard.

## Install an individual plugin

These remote commands work **after the scaffold is published to GitHub**.
Creating this scaffold locally does not publish it.

```powershell
copilot plugin marketplace add mthalman/copilot-canvases
copilot plugin install ci-runs@copilot-canvases
copilot plugin install copilot-activity@copilot-canvases
```

Alternatively, install just that repository subdirectory without registering
the marketplace:

```powershell
copilot plugin install mthalman/copilot-canvases:plugins/copilot-activity
```

Start a new Copilot app session after installation. Only the selected plugin
is installed; the marketplace does not activate all canvases.
Choose any plugin name listed above; the two install commands are independent.
To develop either imported plugin locally, pass its directory to
`copilot --plugin-dir` as shown above.

## Add a canvas plugin

1. Create `plugins\<canvas-name>` with its own `.github\plugin\plugin.json`.
2. Add the runtime entrypoint at `extensions\<canvas-name>\extension.mjs`
   beneath that plugin directory, alongside any renderer assets and helpers.
3. Set the plugin manifest's name, description, and version.
   Keep `"extensions": "extensions"`: this points to the directory whose immediate
   children contain extension entrypoints.
4. Register the canvas with `joinSession` and `createCanvas`, using a unique
   `id`, descriptive `displayName`, schemas, and actions. Keep the entrypoint
   named `extension.mjs`.
5. Add an entry to `.github\plugin\marketplace.json` with the same plugin name and
   version and a source of `./plugins/<canvas-name>`.
6. Add tests for the new canvas and load its directory with `--plugin-dir`.

Each plugin contains its own manifest and extension assets, with no runtime
imports from sibling plugins. `extension.mjs` registers the canvas through
`joinSession` and `createCanvas` from `@github/copilot-sdk/extension`.
Copilot resolves that SDK at runtime: do not add it as a package dependency.
The manifest uses Copilot's legacy plugin format, which supports the
`extensions` directory field; do not add an Agent Plugins `$schema` declaration
without migrating its different extension semantics.

Bind canvas HTTP servers only to `127.0.0.1` on ephemeral ports, reuse them
when panels reopen, and stop them when panels close. For a stateful canvas,
persist data under a stable document or artifact identity, not the transient
panel `instanceId`.
Keep stdout free of logging because the extension uses it for JSON-RPC.

## Validate

```powershell
npm test
npm --prefix .\plugins\ci-runs test
npm --prefix .\plugins\copilot-activity test
node --test .\tests\plugins.test.mjs
node --check .\plugins\ci-runs\extensions\ci-runs\extension.mjs
node --check .\plugins\copilot-activity\extensions\copilot-activity\extension.mjs
copilot --plugin-dir .\plugins\ci-runs --plugin-dir .\plugins\copilot-activity plugin list --json
```

`npm test` runs packaging checks and every plugin's tests; the following
commands select individual suites. No dependency installation is needed.
Repository CI runs the full suite on Linux, macOS, and Windows with Node 24 and 26.

The tests cover the imported runtime modules, catalog paths, plugin packaging,
and HTTP endpoints. They do not exercise host rendering or runtime schema
validation. In a canvas-capable host, also check capability discovery, open,
and action invocation; inputs that violate a declared schema should return
`canvas_input_invalid`, and `canvas.open` used as an action name should return
`canvas_reserved_action_name`.

Format references: [Copilot plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
and the installed SDK's `docs/extensions.md` and `canvas.d.ts` (available through
the `extensions_manage` guide when that tool is exposed).
