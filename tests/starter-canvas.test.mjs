import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { canvasOptions } from "../plugins/starter-canvas/extensions/starter-canvas/canvas.mjs";

const root = new URL("../", import.meta.url);

test("the marketplace indexes one independently packaged extension per plugin", async () => {
  const catalog = JSON.parse(await readFile(new URL(".github/plugin/marketplace.json", root)));
  assert.equal(catalog.name, "copilot-canvases");
  assert.ok(catalog.plugins.length > 0);
  const names = new Set();
  for (const plugin of catalog.plugins) {
    assert.ok(!names.has(plugin.name), `Duplicate plugin: ${plugin.name}`);
    names.add(plugin.name);
    const pluginRoot = new URL(`${plugin.source}/`, root);
    const manifest = JSON.parse(
      await readFile(new URL(".github/plugin/plugin.json", pluginRoot)),
    );
    assert.equal(manifest.name, plugin.name);
    assert.equal(manifest.version, plugin.version);
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

test("opening a canvas serves the starter page on loopback", async (t) => {
  const instanceId = "page";
  t.after(() => canvasOptions.onClose({ instanceId }));
  const opened = await canvasOptions.open({ instanceId });
  assert.equal(new URL(opened.url).hostname, "127.0.0.1");
  assert.equal(opened.title, "Starter canvas");
  const response = await fetch(opened.url);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(await response.text(), /Your canvas is ready/);
});

test("concurrent opens of the same instance reuse one server", async (t) => {
  const instanceId = "reopen";
  t.after(() => canvasOptions.onClose({ instanceId }));
  const [first, second] = await Promise.all([
    canvasOptions.open({ instanceId }),
    canvasOptions.open({ instanceId }),
  ]);
  assert.equal(first.url, second.url);
  assert.equal((await canvasOptions.open({ instanceId })).url, first.url);
});

test("different instances have independent server lifetimes", async (t) => {
  t.after(() => canvasOptions.onClose({ instanceId: "second" }));
  const first = await canvasOptions.open({ instanceId: "first" });
  t.after(() => canvasOptions.onClose({ instanceId: "first" }));
  const second = await canvasOptions.open({ instanceId: "second" });
  assert.notEqual(first.url, second.url);
  await canvasOptions.onClose({ instanceId: "first" });
  await assert.rejects(fetch(first.url));
  assert.equal((await fetch(second.url)).status, 200);
});

test("the server handles HEAD, missing paths, and unsupported methods", async (t) => {
  const instanceId = "routes";
  t.after(() => canvasOptions.onClose({ instanceId }));
  const { url } = await canvasOptions.open({ instanceId });
  const head = await fetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(new URL("/missing", url))).status, 404);
  const post = await fetch(url, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("closing is idempotent and an instance can be opened again", async (t) => {
  const instanceId = "close";
  t.after(() => canvasOptions.onClose({ instanceId }));
  const first = await canvasOptions.open({ instanceId });
  await canvasOptions.onClose({ instanceId });
  await canvasOptions.onClose({ instanceId });
  await assert.rejects(fetch(first.url));
  const reopened = await canvasOptions.open({ instanceId });
  assert.equal((await fetch(reopened.url)).status, 200);
});

test("echo returns the raw action result without rendering message content", async () => {
  const action = canvasOptions.actions.find(({ name }) => name === "echo");
  assert.deepEqual(await action.handler({ input: { message: "<script>example</script>" } }), {
    message: "<script>example</script>",
  });
  assert.deepEqual(action.inputSchema.required, ["message"]);
  assert.equal(action.inputSchema.additionalProperties, false);
  assert.ok(canvasOptions.actions.every(({ name }) => !name.startsWith("canvas.")));
});
