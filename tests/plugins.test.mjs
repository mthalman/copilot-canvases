import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);

test("the marketplace indexes every plugin with one independently packaged canvas", async () => {
  const catalog = JSON.parse(await readFile(new URL(".github/plugin/marketplace.json", root)));
  assert.equal(catalog.name, "copilot-canvases");
  const directories = await readdir(new URL("plugins/", root));
  assert.deepEqual(catalog.plugins.map(({ name }) => name).sort(), directories.sort());
  assert.ok(catalog.plugins.length > 0);
  const names = new Set();
  for (const plugin of catalog.plugins) {
    assert.ok(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
    names.add(plugin.name);
    assert.equal(plugin.source, `./plugins/${plugin.name}`);
    const pluginRoot = new URL(`${plugin.source}/`, root);
    const manifest = JSON.parse(
      await readFile(new URL(".github/plugin/plugin.json", pluginRoot)),
    );
    assert.equal(manifest.name, plugin.name);
    assert.equal(manifest.version, plugin.version);
    assert.equal(manifest.description, plugin.description);
    assert.equal(manifest.extensions, "extensions");
    const extensions = await readdir(new URL("extensions/", pluginRoot));
    assert.deepEqual(extensions, [plugin.name]);
    const entrypoint = await readFile(
      new URL(`extensions/${plugin.name}/extension.mjs`, pluginRoot),
      "utf8",
    );
    assert.match(entrypoint, /@github\/copilot-sdk\/extension/);
    assert.match(entrypoint, /joinSession\(/);
    assert.match(entrypoint, /createCanvas\(/);
  }
});

test("imported plugin test packages match their manifests and need no SDK dependency", async () => {
  for (const name of ["ci-runs", "copilot-activity"]) {
    const pluginRoot = new URL(`plugins/${name}/`, root);
    const pkg = JSON.parse(await readFile(new URL("package.json", pluginRoot)));
    const manifest = JSON.parse(
      await readFile(new URL(".github/plugin/plugin.json", pluginRoot)),
    );
    assert.equal(pkg.name, manifest.name);
    assert.equal(pkg.version, manifest.version);
    assert.equal(pkg.engines.node, ">=24");
    assert.equal(pkg.scripts.test, "node --test test/*.test.mjs");
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
  }
});
