import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/index.ts";

test("test runner is active", () => {
  assert.equal(1 + 1, 2);
});

test("root plugin export combines server and TUI entrypoints", () => {
  assert.equal(typeof plugin, "function");
  assert.equal(plugin.id, "oc-wingman-tui");
  assert.equal(typeof plugin.tui, "function");
});
