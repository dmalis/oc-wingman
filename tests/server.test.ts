import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/server.ts";

test("server plugin registers wingman_review tool and commands", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  assert.ok(hooks.tool?.wingman_review);
  const config: any = {};
  await hooks.config?.(config);
  assert.match(config.command.wingman.template, /wingman_review/);
  assert.match(config.command["wingman:setup"].template, /Wingman setup/);
});
