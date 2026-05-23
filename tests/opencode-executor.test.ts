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
      create: async (args: any) => { calls.push(`create:${args.body.title}`); return { data: { id: "session-1" } }; },
      prompt: async (args: any) => ({ data: { info: { role: "assistant" }, parts: [{ type: "text", text: "assistant review" }] } }),
      messages: async () => ({ data: [{ info: { role: "user" }, parts: [{ type: "text", text: "review" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });

  assert.equal(output.output, "assistant review");
});

test("executor does not treat metadata-less prompt echo as assistant output", async () => {
  const fakeClient = {
    session: {
      create: async () => ({ data: { id: "session-1" } }),
      prompt: async () => ({ data: { parts: [{ type: "text", text: "review" }] } }),
      messages: async () => ({ data: [{ info: { role: "assistant" }, parts: [{ type: "text", text: "real review" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });

  assert.equal(output.output, "real review");
});

test("executor ignores user-role prompt echoes in message fallback", async () => {
  const fakeClient = {
    session: {
      create: async () => ({ data: { id: "session-1" } }),
      prompt: async () => ({ data: { parts: [{ type: "text", text: "review" }] } }),
      messages: async () => ({ data: [{ info: { role: "user" }, parts: [{ type: "text", text: "review" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });

  assert.equal(output.output, "");
});

test("executor ignores user-role prompt echoes with model metadata", async () => {
  const fakeClient = {
    session: {
      create: async () => ({ data: { id: "session-1" } }),
      prompt: async () => ({ data: { parts: [{ type: "text", text: "review" }] } }),
      messages: async () => ({ data: [{ info: { role: "user", providerID: "google", modelID: "gemini" }, parts: [{ type: "text", text: "different prompt wording" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });

  assert.equal(output.output, "");
});

test("executor falls back to assistant messages when prompt returns no text", async () => {
  const calls: string[] = [];
  const fakeClient = {
    session: {
      create: async (args: any) => { calls.push(`create:${args.body.title}`); return { data: { id: "session-1" } }; },
      prompt: async (args: any) => { calls.push(`prompt:${args.path.id}:${args.body.model.providerID}/${args.body.model.modelID}:${args.body.tools.bash}`); return { data: {} }; },
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });
  assert.equal(output.output, "review output");
  assert.deepEqual(calls, ["create:Wingman gemini", "prompt:session-1:google/gemini-3.1-pro-preview:false"]);
});

test("executor uses v1 OpenCode SDK request shapes", async () => {
  const calls: unknown[] = [];
  const fakeClient = {
    session: {
      create: async (args: any) => { calls.push(args); return { data: { id: "session-1" } }; },
      prompt: async (args: any) => { calls.push(args); return { data: {} }; },
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  await executor({ reviewer, prompt: "review", round: 1 });

  assert.deepEqual(calls[0], {
    query: { directory: "/repo" },
    body: { title: "Wingman gemini" }
  });
  assert.deepEqual(calls[1], {
    path: { id: "session-1" },
    query: { directory: "/repo" },
    body: {
      model: { providerID: "google", modelID: "gemini-3.1-pro-preview" },
      tools: readOnlyToolFlags(),
      system: "You are a read-only reviewer. Do not edit files, write files, commit, or run mutating commands.",
      parts: [{ type: "text", text: "review" }],
    }
  });
});
