# copilot-canvases

Custom GitHub Copilot canvases, packaged as independently installable plugins:
one plugin per canvas. The root is a plugin marketplace, not a canvas extension.

## Try the starter locally

Use a recent Copilot CLI and a canvas-capable host such as the GitHub Copilot app.
The canvas SDK is experimental; a plain terminal cannot display the canvas.
Node.js 22 or newer is sufficient for the repository's dependency-free tests.

From this repository, load only the starter plugin for a CLI session:

```powershell
copilot --plugin-dir .\plugins\starter-canvas
```

This development flag does not install the plugin globally. In a canvas-capable
session using the plugin, ask Copilot to open `starter-canvas` with input `{}`,
then invoke its `echo` action with `{"message":"Hello"}`. Expect a page titled
**Starter canvas** and an action result of `{"message":"Hello"}`.
The action returns to the agent; it does not update the page.

## Install an individual plugin

These remote commands work **after the scaffold is published to GitHub**.
Creating this scaffold locally does not publish it.

```powershell
copilot plugin marketplace add mthalman/copilot-canvases
copilot plugin install starter-canvas@copilot-canvases
```

Alternatively, install just that repository subdirectory without registering
the marketplace:

```powershell
copilot plugin install mthalman/copilot-canvases:plugins/starter-canvas
```

Start a new Copilot app session after installation. Only the selected plugin
is installed; the marketplace does not activate all canvases.

## Add a canvas plugin

1. Copy `plugins\starter-canvas` to `plugins\<canvas-name>`.
2. Rename its `extensions\starter-canvas` directory to `extensions\<canvas-name>`.
3. Update the plugin's `.github\plugin\plugin.json` name, description, and version.
   Keep `"extensions": "extensions"`: this points to the directory whose immediate
   children contain extension entrypoints.
4. Update `id`, `displayName`, description, schemas, and actions in `canvas.mjs`,
   then replace `index.html`. Use a unique canvas ID and keep the entrypoint named
   `extension.mjs`.
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

The starter uses one ephemeral HTTP server per panel, bound only to
`127.0.0.1`. Repeated opens reuse the server; closing the panel stops it.
It stores no user data. For a stateful canvas, persist data under a stable
document or artifact identity, not the transient panel `instanceId`.
Keep stdout free of logging because the extension uses it for JSON-RPC.

## Validate

```powershell
node --test .\tests\starter-canvas.test.mjs
node --check .\plugins\starter-canvas\extensions\starter-canvas\extension.mjs
node --check .\plugins\starter-canvas\extensions\starter-canvas\canvas.mjs
copilot --plugin-dir .\plugins\starter-canvas plugin list --json
```

The tests cover catalog paths, plugin packaging, HTTP serving, repeated opens,
independent panels, cleanup, and the echo handler. They do not exercise host
rendering or runtime schema validation. In a canvas-capable host, also check
capability discovery, open, and action invocation; invalid `echo` input should
return `canvas_input_invalid`, and `canvas.open` used as an action name should
return `canvas_reserved_action_name`.

Format references: [Copilot plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
and the installed SDK's `docs/extensions.md` and `canvas.d.ts` (available through
the `extensions_manage` guide when that tool is exposed).
