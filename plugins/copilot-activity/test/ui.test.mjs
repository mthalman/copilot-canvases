// Unit tests for lib/ui.mjs — the self-contained dashboard page is a pure
// string builder, so we just assert its shape and that the initial period is
// embedded for the client-side script to bootstrap from.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHtml } from "../extensions/copilot-activity/lib/ui.mjs";

test("renderHtml: returns a full HTML document titled Copilot Activity", () => {
    const html = renderHtml({ from: "a", to: "b", days: 7 });
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<title>Copilot Activity<\/title>/);
});

test("renderHtml: embeds the initial period as JSON", () => {
    const html = renderHtml({ days: 7 });
    assert.match(html, /"days":7/);
});

test("renderHtml: tolerates being called with no argument", () => {
    const html = renderHtml();
    assert.match(html, /<!doctype html>/i);
});

test("renderHtml: page is self-contained (no external script/style src)", () => {
    const html = renderHtml({ days: 30 });
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /<link[^>]+stylesheet/i);
});
