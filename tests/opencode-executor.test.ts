import test from "node:test";
import assert from "node:assert/strict";
import { createOpenCodeReviewerExecutor, readOnlyPermissionRules, readOnlyToolFlags } from "../src/opencode/executor.ts";
import type { ResolvedReviewer } from "../src/core/types.ts";

const reviewer: ResolvedReviewer = {
  name: "gemini",
  provider: "google",
  model: "gemini-3.1-pro-preview",
  key: "google/gemini-3.1-pro-preview",
  label: "gemini (google/gemini-3.1-pro-preview)",
  sameProvider: false,
  sameModel: false,
  source: "merged",
  modelRef: { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini" }
};

test("read-only permissions deny edit and bash", () => {
  assert.deepEqual(readOnlyPermissionRules().filter((rule) => rule.action === "deny").map((rule) => rule.permission).sort(), ["bash", "edit", "write"]);
  assert.equal(readOnlyToolFlags().bash, false);
  assert.equal(readOnlyToolFlags().edit, false);
});

test("executor creates read-only session and extracts assistant text", async () => {
  const calls: string[] = [];
  const fakeClient = {
    session: {
      create: async (args: any) => { calls.push(`create:${args.model.providerID}/${args.model.id}`); return { data: { id: "session-1" } }; },
      prompt: async (args: any) => { calls.push(`prompt:${args.sessionID}:${args.tools.bash}`); return { data: {} }; },
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });
  assert.equal(output.output, "review output");
  assert.deepEqual(calls, ["create:google/gemini-3.1-pro-preview", "prompt:session-1:false"]);
});
