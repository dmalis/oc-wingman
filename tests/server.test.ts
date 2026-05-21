import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin from "../src/server.ts";

test("server plugin registers wingman_review tool and commands", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  assert.ok(hooks.tool?.wingman_review);
  const config: any = {};
  await hooks.config?.(config);
  assert.match(config.command.wingman.template, /wingman_review/);
  assert.match(config.command["wingman:setup"].template, /Wingman setup/);
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
