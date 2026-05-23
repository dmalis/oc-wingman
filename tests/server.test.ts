import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../src/server.ts";

test("server plugin registers wingman_review tool and commands", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  assert.ok(hooks.tool?.wingman_review);
  assert.ok(hooks.tool?.wingman_setup);
  const config: any = {};
  await hooks.config?.(config);
  assert.match(config.command.wingman.template, /wingman_review/);
  assert.match(config.command.wingman.template, /wingman_setup/);
  assert.match(config.command["wingman:setup"].template, /wingman_setup/);
  assert.match(config.command["wingman:setup"].template, /\$ARGUMENTS/);
});

test("server plugin blocks follow-up tools after Wingman until next user message", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const after = hooks["tool.execute.after"] as ((input: any, output: any) => Promise<void> | void) | undefined;
  const before = hooks["tool.execute.before"] as ((input: any, output: any) => Promise<void> | void) | undefined;
  const chatMessage = hooks["chat.message"] as ((input: any, output: any) => Promise<void> | void) | undefined;

  assert.ok(after);
  assert.ok(before);
  assert.ok(chatMessage);

  await after({ tool: "wingman_review", sessionID: "session-1", callID: "call-1", args: {} }, { title: "", output: "", metadata: {} });
  await assert.rejects(() => Promise.resolve(before({ tool: "read", sessionID: "session-1", callID: "call-2" }, { args: {} })), /Wingman returned/);

  await chatMessage({ sessionID: "session-1" }, { message: {}, parts: [{ type: "text", text: "continue" }] });
  await before({ tool: "read", sessionID: "session-1", callID: "call-3" }, { args: {} });
});

test("wingman_setup lists available models when no reviewer is supplied", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-setup-"));
  const fakeClient = {
    v2: {
      model: {
        list: async () => ({ data: [{ providerID: "google", id: "gemini-3.1-pro-preview", name: "Gemini" }] })
      }
    }
  };
  const hooks = await plugin({ directory: root, worktree: root, project: {} as any, client: fakeClient as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const result = await hooks.tool!.wingman_setup.execute({}, { directory: root } as any);

  assert.match(String(result), /Available Wingman reviewer models/);
  assert.match(String(result), /google\/gemini-3.1-pro-preview/);
  assert.match(String(result), /\/wingman:setup project gemini google gemini-3.1-pro-preview/);
});

test("wingman_setup writes project reviewer config", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-setup-"));
  await mkdir(join(root, ".git"));
  const fakeClient = {
    v2: {
      model: {
        list: async () => ({ data: [{ providerID: "google", id: "gemini-3.1-pro-preview", name: "Gemini" }] })
      }
    }
  };
  const hooks = await plugin({ directory: root, worktree: root, project: {} as any, client: fakeClient as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const result = await hooks.tool!.wingman_setup.execute({ scope: "project", name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" }, { directory: root } as any);
  const saved = JSON.parse(await readFile(join(root, ".wingman", "config.json"), "utf8"));

  assert.match(String(result), /Wingman project config saved/);
  assert.deepEqual(saved.reviewers, [{ name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" }]);
});

test("wingman_setup preserves existing config while upserting reviewer", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-setup-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".wingman"));
  await writeFile(join(root, ".wingman", "config.json"), `${JSON.stringify({
    version: 1,
    exclude: "same-model",
    defaultReviewers: "ask",
    maxParallelReviewers: 2,
    reviewers: [{ name: "existing", provider: "openai", model: "gpt-5" }]
  }, null, 2)}\n`, "utf8");
  const hooks = await plugin({ directory: root, worktree: root, project: {} as any, client: { v2: { model: { list: async () => ({ data: [] }) } } } as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  await hooks.tool!.wingman_setup.execute({ scope: "project", name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" }, { directory: root } as any);
  const saved = JSON.parse(await readFile(join(root, ".wingman", "config.json"), "utf8"));

  assert.equal(saved.exclude, "same-model");
  assert.equal(saved.defaultReviewers, "ask");
  assert.equal(saved.maxParallelReviewers, 2);
  assert.deepEqual(saved.reviewers.map((reviewer: any) => reviewer.name), ["existing", "gemini"]);
});

test("wingman_review lists v2 models for the current directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-server-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".wingman"));
  await writeFile(join(root, ".wingman", "config.json"), `${JSON.stringify({
    version: 1,
    reviewers: [{ name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" }]
  }, null, 2)}\n`, "utf8");
  const modelListCalls: unknown[] = [];
  const fakeClient = {
    v2: {
      model: {
        list: async (input: unknown) => {
          modelListCalls.push(input);
          assert.deepEqual(input, { location: { directory: root } });
          return { data: [{ providerID: "google", id: "gemini-3.1-pro-preview", name: "Gemini" }] };
        }
      }
    },
    session: {
      create: async () => ({ data: { id: "session-1" } }),
      prompt: async () => ({ data: {} }),
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const hooks = await plugin({ directory: root, worktree: root, project: {} as any, client: fakeClient as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const result = await hooks.tool!.wingman_review.execute({ focus: "Review README.md", maxRounds: 1 }, { directory: root, worktree: root, abort: new AbortController().signal } as any);

  assert.match(String(result), /Wingman status: 1 ok, 0 failed, 0 cancelled/);
  assert.equal(modelListCalls.length, 1);
});

test("wingman_review falls back to v1 provider models", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-server-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".wingman"));
  await writeFile(join(root, ".wingman", "config.json"), `${JSON.stringify({
    version: 1,
    reviewers: [{ name: "free", provider: "openrouter", model: "z-ai/glm-4.5-air:free" }]
  }, null, 2)}\n`, "utf8");
  const providerListCalls: unknown[] = [];
  const fakeClient = {
    provider: {
      list: async (input: unknown) => {
        providerListCalls.push(input);
        assert.deepEqual(input, { query: { directory: root } });
        return { data: { all: [{ id: "openrouter", name: "OpenRouter", models: { "z-ai/glm-4.5-air:free": { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air" } } }] } };
      }
    },
    session: {
      create: async () => ({ data: { id: "session-1" } }),
      prompt: async () => ({ data: {} }),
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const hooks = await plugin({ directory: root, worktree: root, project: {} as any, client: fakeClient as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const result = await hooks.tool!.wingman_review.execute({ focus: "Review README.md", maxRounds: 1 }, { directory: root, worktree: root, abort: new AbortController().signal } as any);

  assert.match(String(result), /Wingman status: 1 ok, 0 failed, 0 cancelled/);
  assert.equal(providerListCalls.length, 1);
});

test("chat.message rewrites natural Wingman requests", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const output = { message: {}, parts: [{ type: "text", text: "run this by claude" }] };
  const chatMessage = hooks["chat.message"] as ((input: any, output: any) => Promise<void> | void) | undefined;

  assert.ok(chatMessage);
  await chatMessage({ sessionID: "s", model: { providerID: "openai", modelID: "gpt-5.5" } }, output);

  const text = String(output.parts[0].text);
  assert.match(text, /Wingman detected a review request/);
  assert.match(text, /wingman_review/);
  assert.match(text, /- focus: this/);
  assert.match(text, /- reviewerHint: claude/);
  assert.match(text, /- currentProviderID: openai/);
  assert.match(text, /- currentModelID: gpt-5\.5/);
});

test("chat.message leaves non-matching chat unchanged", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const output = { message: {}, parts: [{ type: "text", text: "Gemini has a large context window" }] };
  const chatMessage = hooks["chat.message"] as ((input: any, output: any) => Promise<void> | void) | undefined;

  assert.ok(chatMessage);
  await chatMessage({ sessionID: "s" }, output);

  assert.equal(output.parts[0].text, "Gemini has a large context window");
});

test("chat.message rewrites only the first detected text intent", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  const output = {
    message: {},
    parts: [
      { type: "text", text: "ordinary setup note" },
      { type: "text", text: "check this with codex" },
      { type: "text", text: "run this by claude" },
    ],
  };
  const chatMessage = hooks["chat.message"] as ((input: any, output: any) => Promise<void> | void) | undefined;

  assert.ok(chatMessage);
  await chatMessage({ sessionID: "s" }, output);

  assert.equal(output.parts[0].text, "ordinary setup note");
  assert.match(output.parts[1].text, /- reviewerHint: codex/);
  assert.equal(output.parts[2].text, "run this by claude");
});
