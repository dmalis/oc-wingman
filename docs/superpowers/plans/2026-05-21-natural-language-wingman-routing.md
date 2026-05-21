# Natural-Language Wingman Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route clear natural-language review phrases in OpenCode chat to the existing `wingman_review` tool, while only using configured Wingman reviewers.

**Architecture:** Add one pure intent parser and routing-instruction builder under `src/core/intent.ts`, keep configured reviewer matching in `src/core/reviewers.ts`, and add a thin `chat.message` hook in `src/server.ts`. The hook rewrites the first matching user text part into an explicit instruction for the main model rather than running reviewers directly.

**Tech Stack:** TypeScript ESM, `@opencode-ai/plugin`, Node `node:test` through `tsx --test`, `tsc --noEmit`.

---

## Scope Check

The spec covers one integrated feature: natural-language chat routing for the existing standalone OpenCode Wingman plugin. It does not require schema changes, TUI changes, direct hook auto-runs, or a separate hint registry.

Commit steps are intentionally omitted because this session does not include an explicit user request to commit.

## File Structure

- Create `src/core/intent.ts`: pure parser for natural Wingman phrases and routing-instruction builder.
- Create `tests/intent.test.ts`: parser positive/negative coverage and routing-instruction coverage.
- Modify `src/core/reviewers.ts`: preserve exact configured reviewer-name priority and add built-in alias matching over configured reviewers only.
- Modify `tests/reviewers.test.ts`: default alias coverage and exact-name precedence coverage.
- Modify `src/server.ts`: add the `chat.message` hook that rewrites the first detected Wingman intent.
- Modify `tests/server.test.ts`: hook rewrite and non-trigger preservation coverage.
- Modify `README.md`: document natural-language examples, configured-reviewer grounding, and restart behavior.

## Task 1: Add Intent Parser And Routing Instruction

**Files:**
- Create: `src/core/intent.ts`
- Create: `tests/intent.test.ts`

- [ ] **Step 1: Write the failing parser and instruction tests**

Create `tests/intent.test.ts` with:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { buildWingmanRoutingInstruction, parseWingmanChatIntent } from "../src/core/intent.ts";

test("parses natural reviewer-hint review phrases", () => {
  assert.deepEqual(parseWingmanChatIntent("audit with gemini"), { focus: "audit", reviewerHint: "gemini" });
  assert.deepEqual(parseWingmanChatIntent("check this with codex"), { focus: "check this", reviewerHint: "codex" });
  assert.deepEqual(parseWingmanChatIntent("run this by claude"), { focus: "this", reviewerHint: "claude" });
  assert.deepEqual(parseWingmanChatIntent("get gemini to look at this"), { focus: "look at this", reviewerHint: "gemini" });
  assert.deepEqual(parseWingmanChatIntent("ask claude for a second opinion on this"), { focus: "this", reviewerHint: "claude" });
  assert.deepEqual(parseWingmanChatIntent("get a second opinion from deepseek"), { focus: "second opinion", reviewerHint: "deepseek" });
});

test("parses explicit Wingman requests", () => {
  assert.deepEqual(parseWingmanChatIntent("ask wingman deepseek: review the plan"), { focus: "review the plan", reviewerHint: "deepseek" });
  assert.deepEqual(parseWingmanChatIntent("ask wingman claude review this plan"), { focus: "review this plan", reviewerHint: "claude" });
  assert.deepEqual(parseWingmanChatIntent("wingman review this plan"), { focus: "review this plan" });
});

test("parses all-reviewer requests without inventing reviewer names", () => {
  assert.deepEqual(parseWingmanChatIntent("wingman this with all reviewers"), { focus: "this", allReviewers: true });
  assert.deepEqual(parseWingmanChatIntent("ask all reviewers to audit this"), { focus: "audit this", allReviewers: true });
  assert.deepEqual(parseWingmanChatIntent("review this with all reviewers"), { focus: "review this", allReviewers: true });
  assert.deepEqual(parseWingmanChatIntent("audit this with all reviewers"), { focus: "audit this", allReviewers: true });
});

test("does not parse passive model mentions or config discussion", () => {
  assert.equal(parseWingmanChatIntent("Gemini has a large context window"), undefined);
  assert.equal(parseWingmanChatIntent("Codex docs say the API changed"), undefined);
  assert.equal(parseWingmanChatIntent("configure gemini as a reviewer"), undefined);
  assert.equal(parseWingmanChatIntent("wingman config uses gemini"), undefined);
  assert.equal(parseWingmanChatIntent("wingman setup should use codex"), undefined);
  assert.equal(parseWingmanChatIntent("wingman how do I configure gemini as a reviewer"), undefined);
  assert.equal(parseWingmanChatIntent("wingman help me set up codex reviewer"), undefined);
  assert.equal(parseWingmanChatIntent("wingman setup with all reviewers"), undefined);
  assert.equal(parseWingmanChatIntent("wingman how do I configure gemini as a reviewer with all reviewers"), undefined);
  assert.equal(parseWingmanChatIntent("what do you think about gemini?"), undefined);
});

test("builds a reviewer-hint routing instruction", () => {
  const text = buildWingmanRoutingInstruction(
    { focus: "review this plan", reviewerHint: "claude" },
    { providerID: "openai", modelID: "gpt-5.5" },
  );

  assert.match(text, /Wingman detected a review request/);
  assert.match(text, /Call wingman_review with/);
  assert.match(text, /- focus: review this plan/);
  assert.match(text, /- reviewerHint: claude/);
  assert.match(text, /- currentProviderID: openai/);
  assert.match(text, /- currentModelID: gpt-5\.5/);
  assert.match(text, /Only resolve reviewer hints against configured Wingman reviewers/);
  assert.match(text, /Do not dump raw reviewer output/);
});

test("builds an all-reviewer routing instruction without reviewer names or hints", () => {
  const text = buildWingmanRoutingInstruction({ focus: "this", allReviewers: true });

  assert.match(text, /- focus: this/);
  assert.match(text, /all eligible configured reviewers/);
  assert.doesNotMatch(text, /reviewerHint:/);
  assert.doesNotMatch(text, /reviewerNames:/);
});

test("builds a no-hint instruction that asks before calling the tool", () => {
  const text = buildWingmanRoutingInstruction({ focus: "review this plan" });

  assert.doesNotMatch(text, /Call wingman_review with/);
  assert.match(text, /Ask the user which configured eligible reviewers to use before calling wingman_review/);
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `npx tsx --test tests/intent.test.ts`

Expected: the command fails because `../src/core/intent.ts` does not exist yet.

- [ ] **Step 3: Add the minimal parser and instruction implementation**

Create `src/core/intent.ts` with:

```ts
import type { CurrentModel } from "./types.ts";

export type WingmanChatIntent = {
  focus: string;
  reviewerHint?: string;
  reviewerNames?: string[];
  allReviewers?: boolean;
};

const knownReviewerHints = new Set([
  "claude",
  "codex",
  "deepseek",
  "gemini",
  "gpt",
  "grok",
  "openai",
  "opus",
  "sonnet",
  "xai",
]);

const reviewerToken = "([a-z0-9][a-z0-9._:/-]*)";
const reviewStartPattern = /^(?:audit|check|review|inspect|critique|look\s+at|take\s+a\s+look|second\s+opinion)\b/i;
const configDiscussionPattern = /\b(?:config|configuration|configure|setup|set\s+up|install|plugin)\b/i;

export function parseWingmanChatIntent(text: string): WingmanChatIntent | undefined {
  const input = cleanFocus(text);
  if (!input) return undefined;

  return parseAllReviewerIntent(input) ?? parseExplicitWingmanIntent(input) ?? parseReviewerHintIntent(input);
}

export function buildWingmanRoutingInstruction(intent: WingmanChatIntent, currentModel?: CurrentModel): string {
  const hasReviewerSelection = intent.allReviewers || Boolean(intent.reviewerHint) || Boolean(intent.reviewerNames?.length);
  const lines = ["Wingman detected a review request."];

  if (!hasReviewerSelection) {
    lines.push(`Review focus: ${intent.focus}`);
    if (currentModel) lines.push(`Current model: ${currentModel.providerID}/${currentModel.modelID}`);
    lines.push("No reviewer hint was provided. Ask the user which configured eligible reviewers to use before calling wingman_review.");
    lines.push("Do not call wingman_review until the user chooses reviewers.");
    lines.push("Only resolve reviewer hints against configured Wingman reviewers. Do not guess unconfigured models. If no configured reviewer matches, ask the user to configure or choose reviewers.");
    lines.push("After the tool returns, synthesize what to keep, what to dismiss, and concrete next actions. Do not dump raw reviewer output.");
    return lines.join("\n");
  }

  lines.push("Call wingman_review with:", `- focus: ${intent.focus}`);

  if (currentModel) {
    lines.push(`- currentProviderID: ${currentModel.providerID}`, `- currentModelID: ${currentModel.modelID}`);
  }

  if (intent.reviewerNames?.length) {
    lines.push(`- reviewerNames: ${JSON.stringify(intent.reviewerNames)}`);
  } else if (intent.reviewerHint) {
    lines.push(`- reviewerHint: ${intent.reviewerHint}`);
  }

  if (intent.allReviewers) {
    lines.push("The user asked for all eligible configured reviewers. Do not pass reviewerHint or reviewerNames.");
  } else if (!intent.reviewerHint && !intent.reviewerNames?.length) {
    lines.push("No reviewer hint was provided. Ask the user which configured eligible reviewers to use before calling wingman_review.");
  }

  lines.push("Only resolve reviewer hints against configured Wingman reviewers. Do not guess unconfigured models. If no configured reviewer matches, ask the user to configure or choose reviewers.");
  lines.push("After the tool returns, synthesize what to keep, what to dismiss, and concrete next actions. Do not dump raw reviewer output.");
  return lines.join("\n");
}

function parseAllReviewerIntent(input: string): WingmanChatIntent | undefined {
  const wingmanAll = input.match(/^(?:(?:ask|use)\s+wingman|wingman)\s+(.+?)\s+(?:with|using)\s+all(?:\s+eligible)?\s+reviewers?\.?$/i);
  if (wingmanAll?.[1]) {
    const focus = cleanFocus(wingmanAll[1]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const askAll = input.match(/^ask\s+all(?:\s+eligible)?\s+reviewers?\s+to\s+(.+?)\.?$/i);
  if (askAll?.[1]) {
    const focus = cleanFocus(askAll[1]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const reviewAll = input.match(/^(audit|check|review|inspect|critique)\b(?:\s+(.+?))?\s+(?:with|using)\s+all(?:\s+eligible)?\s+reviewers?\.?$/i);
  if (reviewAll?.[1]) {
    const target = reviewAll[2] ? ` ${cleanFocus(reviewAll[2])}` : "";
    const focus = cleanFocus(`${reviewAll[1].toLowerCase()}${target}`);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  return undefined;
}

function parseExplicitWingmanIntent(input: string): WingmanChatIntent | undefined {
  const match = input.match(/^(?:(?:ask|use)\s+wingman|wingman)\b\s*:?\s*-?\s*(.+?)\.?$/i);
  const rawFocus = match?.[1] ? cleanFocus(match[1]) : "";
  if (!rawFocus) return undefined;

  const colonHint = rawFocus.match(new RegExp(`^${reviewerToken}\\s*:\\s*(.+)$`, "i"));
  if (colonHint?.[1] && colonHint[2]) {
    const focus = cleanFocus(colonHint[2]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, reviewerHint: cleanHint(colonHint[1]) };
  }

  const spaceHint = rawFocus.match(new RegExp(`^${reviewerToken}\\s+(.+)$`, "i"));
  if (spaceHint?.[1] && spaceHint[2] && knownReviewerHints.has(cleanHint(spaceHint[1]))) {
    const focus = cleanFocus(spaceHint[2]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, reviewerHint: cleanHint(spaceHint[1]) };
  }

  if (isConfigDiscussion(rawFocus)) return undefined;
  return { focus: rawFocus };
}

function parseReviewerHintIntent(input: string): WingmanChatIntent | undefined {
  const withReviewer = input.match(new RegExp(`^(audit|check|review|inspect|critique)\\b(?:\\s+(.+?))?\\s+(?:with|using|via)\\s+${reviewerToken}\\.?$`, "i"));
  if (withReviewer?.[1] && withReviewer[3]) {
    const target = withReviewer[2] ? ` ${cleanFocus(withReviewer[2])}` : "";
    return { focus: cleanFocus(`${withReviewer[1].toLowerCase()}${target}`), reviewerHint: cleanHint(withReviewer[3]) };
  }

  const runBy = input.match(new RegExp(`^run\\s+(.+?)\\s+(?:by|past)\\s+${reviewerToken}\\.?$`, "i"));
  if (runBy?.[1] && runBy[2]) return { focus: cleanFocus(runBy[1]), reviewerHint: cleanHint(runBy[2]) };

  const getTo = input.match(new RegExp(`^get\\s+${reviewerToken}\\s+to\\s+(.+?)\\.?$`, "i"));
  if (getTo?.[1] && getTo[2] && reviewStartPattern.test(getTo[2])) return { focus: cleanFocus(getTo[2]), reviewerHint: cleanHint(getTo[1]) };

  const secondOpinion = input.match(new RegExp(`^ask\\s+${reviewerToken}\\s+for\\s+(?:a\\s+)?second\\s+opinion(?:\\s+on\\s+(.+?))?\\.?$`, "i"));
  if (secondOpinion?.[1]) return { focus: cleanFocus(secondOpinion[2] ?? "second opinion"), reviewerHint: cleanHint(secondOpinion[1]) };

  const secondOpinionFrom = input.match(new RegExp(`^get\\s+(?:a\\s+)?second\\s+opinion\\s+from\\s+${reviewerToken}(?:\\s+on\\s+(.+?))?\\.?$`, "i"));
  if (secondOpinionFrom?.[1]) return { focus: cleanFocus(secondOpinionFrom[2] ?? "second opinion"), reviewerHint: cleanHint(secondOpinionFrom[1]) };

  const askTo = input.match(new RegExp(`^ask\\s+${reviewerToken}\\s+to\\s+(.+?)\\.?$`, "i"));
  if (askTo?.[1] && askTo[2] && reviewStartPattern.test(askTo[2])) return { focus: cleanFocus(askTo[2]), reviewerHint: cleanHint(askTo[1]) };

  return undefined;
}

function cleanFocus(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.?!]+$/g, "").trim();
}

function isConfigDiscussion(value: string): boolean {
  return configDiscussionPattern.test(value) && !reviewStartPattern.test(value);
}

function cleanHint(value: string): string {
  return value.trim().replace(/^[^a-z0-9]+|[^a-z0-9._:/-]+$/gi, "").toLowerCase();
}
```

- [ ] **Step 4: Run the parser tests and verify they pass**

Run: `npx tsx --test tests/intent.test.ts`

Expected: all tests in `tests/intent.test.ts` pass.

## Task 2: Ground Reviewer Alias Matching In Configured Reviewers

**Files:**
- Modify: `src/core/reviewers.ts`
- Modify: `tests/reviewers.test.ts`

- [ ] **Step 1: Add failing reviewer alias tests**

Append these tests to `tests/reviewers.test.ts`:

```ts
test("selectReviewers resolves built-in aliases against configured reviewers only", () => {
  const aliasModels: ModelRef[] = [
    { providerID: "openai", modelID: "o4-mini", name: "O4 Mini" },
    { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
    { providerID: "anthropic", modelID: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { providerID: "xai", modelID: "grok-4", name: "Grok 4" },
  ];
  const reviewers = resolveConfiguredReviewers(normalizeConfig({
    reviewers: [
      { name: "codex-reviewer", provider: "openai", model: "o4-mini" },
      { name: "gemini-reviewer", provider: "google", model: "gemini-3.1-pro-preview" },
      { name: "sonnet-reviewer", provider: "anthropic", model: "claude-sonnet-4-6" },
      { name: "grok-reviewer", provider: "xai", model: "grok-4" },
    ],
  }, "memory"), aliasModels, undefined);

  assert.deepEqual(selectReviewers({ eligible: reviewers, hint: "codex" }).map((reviewer) => reviewer.name), ["codex-reviewer"]);
  assert.deepEqual(selectReviewers({ eligible: reviewers, hint: "gemini" }).map((reviewer) => reviewer.name), ["gemini-reviewer"]);
  assert.deepEqual(selectReviewers({ eligible: reviewers, hint: "claude" }).map((reviewer) => reviewer.name), ["sonnet-reviewer"]);
  assert.deepEqual(selectReviewers({ eligible: reviewers, hint: "grok" }).map((reviewer) => reviewer.name), ["grok-reviewer"]);
  assert.throws(() => selectReviewers({ eligible: reviewers, hint: "deepseek" }), /No eligible configured Wingman reviewer matches deepseek/);
});

test("exact reviewer name wins before provider or model alias matches", () => {
  const exactModels: ModelRef[] = [
    { providerID: "anthropic", modelID: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { providerID: "google", modelID: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
  ];
  const reviewers = resolveConfiguredReviewers(normalizeConfig({
    reviewers: [
      { name: "gemini", provider: "anthropic", model: "claude-sonnet-4-6" },
      { name: "flash", provider: "google", model: "gemini-3.1-flash" },
    ],
  }, "memory"), exactModels, undefined);

  assert.deepEqual(selectReviewers({ eligible: reviewers, hint: "gemini" }).map((reviewer) => reviewer.key), ["anthropic/claude-sonnet-4-6"]);
});
```

- [ ] **Step 2: Run reviewer tests and verify the new tests fail**

Run: `npx tsx --test tests/reviewers.test.ts`

Expected: at least the `codex` alias assertion fails because `openai/o4-mini` does not contain `codex` in its configured provider or model text.

- [ ] **Step 3: Update reviewer matching with ordered resolution**

Replace `reviewerMatchesHint`, `selectReviewers`, and `selectOne` in `src/core/reviewers.ts` with this implementation, keeping the existing imports and other functions unchanged:

```ts
const builtInReviewerAliases: Record<string, string[]> = {
  claude: ["anthropic", "claude"],
  codex: ["openai", "codex", "gpt"],
  deepseek: ["deepseek"],
  gemini: ["google", "gemini"],
  gpt: ["openai", "gpt"],
  grok: ["xai", "grok"],
  openai: ["openai", "gpt", "codex"],
  opus: ["anthropic", "claude", "opus"],
  sonnet: ["anthropic", "claude", "sonnet"],
  xai: ["xai", "grok"],
};

export function reviewerMatchesHint(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, hint: string): boolean {
  const normalized = normalizeHint(hint);
  if (!normalized) return false;
  return reviewerMatchesConfiguredText(reviewer, normalized) || reviewerMatchesBuiltInAlias(reviewer, normalized);
}

export function selectReviewers(input: { eligible: ResolvedReviewer[]; hint?: string; names?: string[] }): ResolvedReviewer[] {
  const names = input.names?.map((name) => name.trim()).filter(Boolean) ?? [];
  if (names.length > 0) return dedupeReviewers(names.flatMap((name) => selectOne(input.eligible, name)));
  const hint = input.hint?.trim();
  if (hint) return selectOne(input.eligible, hint);
  return input.eligible;
}

function selectOne(eligible: ResolvedReviewer[], name: string): ResolvedReviewer[] {
  const normalized = normalizeHint(name);
  const exactMatches = eligible.filter((reviewer) => reviewer.name.toLowerCase() === normalized || reviewer.key.toLowerCase() === normalized);
  if (exactMatches.length > 0) return requireSingleReviewer(exactMatches, name);

  const configuredTextMatches = eligible.filter((reviewer) => reviewerMatchesConfiguredText(reviewer, normalized));
  if (configuredTextMatches.length > 0) return requireSingleReviewer(configuredTextMatches, name);

  const aliasMatches = eligible.filter((reviewer) => reviewerMatchesBuiltInAlias(reviewer, normalized));
  if (aliasMatches.length > 0) return requireSingleReviewer(aliasMatches, name);

  throw new WingmanError("reviewer.unavailable", `No eligible configured Wingman reviewer matches ${name}.`);
}

function requireSingleReviewer(matches: ResolvedReviewer[], name: string): ResolvedReviewer[] {
  if (matches.length === 1) return matches;
  throw new WingmanError("reviewer.ambiguous", `Multiple eligible Wingman reviewers match ${name}: ${matches.map((reviewer) => reviewer.key).join(", ")}.`);
}

function reviewerMatchesConfiguredText(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, normalizedHint: string): boolean {
  if (!normalizedHint) return false;
  return reviewerSearchText(reviewer).includes(normalizedHint);
}

function reviewerMatchesBuiltInAlias(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, normalizedHint: string): boolean {
  const aliases = builtInReviewerAliases[normalizedHint] ?? [];
  if (aliases.length === 0) return false;
  const haystack = reviewerSearchText(reviewer);
  return aliases.some((alias) => haystack.includes(alias));
}

function reviewerSearchText(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">): string {
  return `${reviewer.name} ${reviewer.provider} ${reviewer.model} ${reviewer.provider}/${reviewer.model}`.toLowerCase();
}

function normalizeHint(hint: string): string {
  return hint.trim().toLowerCase();
}
```

- [ ] **Step 4: Run reviewer tests and verify they pass**

Run: `npx tsx --test tests/reviewers.test.ts`

Expected: all tests in `tests/reviewers.test.ts` pass.

## Task 3: Add Server `chat.message` Routing

**Files:**
- Modify: `src/server.ts`
- Modify: `tests/server.test.ts`

- [ ] **Step 1: Add failing server hook tests**

Append these tests to `tests/server.test.ts`:

```ts
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
```

- [ ] **Step 2: Run server tests and verify the new hook tests fail**

Run: `npx tsx --test tests/server.test.ts`

Expected: the first new test fails because `hooks["chat.message"]` is missing.

- [ ] **Step 3: Add the hook to the server plugin**

Modify imports at the top of `src/server.ts`:

```ts
import { tool, type Plugin } from "@opencode-ai/plugin";
import { loadEffectiveConfig } from "./core/config.ts";
import { buildWingmanRoutingInstruction, parseWingmanChatIntent } from "./core/intent.ts";
import { inferWingmanContext } from "./core/target.ts";
import { resolveConfiguredReviewers, selectReviewers } from "./core/reviewers.ts";
import { runWingmanReview } from "./core/run.ts";
import { createOpenCodeReviewerExecutor } from "./opencode/executor.ts";
import type { CurrentModel, ModelRef } from "./core/types.ts";
```

Add this hook inside the object returned by the plugin, after `config` and before `tool`:

```ts
    async "chat.message"(input, output) {
      for (const part of output.parts as Array<{ type?: string; text?: string }>) {
        if (part.type !== "text" || typeof part.text !== "string") continue;
        const intent = parseWingmanChatIntent(part.text);
        if (!intent) continue;
        part.text = buildWingmanRoutingInstruction(intent, input.model);
        return;
      }
    },
```

- [ ] **Step 4: Run server tests and verify they pass**

Run: `npx tsx --test tests/server.test.ts`

Expected: all tests in `tests/server.test.ts` pass.

## Task 4: Document Natural-Language Routing

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the README with natural-language usage notes**

Replace `README.md` with:

```md
# oc-wingman

Standalone OpenCode Wingman plugin for read-only model reviews.

## Install

Add both plugin entrypoints to OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./src/server.ts",
    "./src/tui/index.ts"
  ]
}
```

Restart OpenCode after changing plugin config. OpenCode loads plugin config at startup.

## Commands

- `/wingman:setup`: choose reviewer models and write global or project config.
- `/wingman`: choose reviewers for one read-only review run.

## Natural Chat

You can also ask for a Wingman review in normal chat:

```text
audit with gemini
check this with codex
run this by claude
wingman this with all reviewers
```

Natural phrases route only to configured Wingman reviewers. A phrase like `check this with gemini` works when a configured reviewer matches `gemini` by reviewer name, provider/model text, or the built-in `gemini` alias over configured reviewers. Wingman never invents an unconfigured reviewer from global model availability.

Passive model mentions do not trigger reviews, so text like `Gemini has a large context window` remains normal chat.

## Config

Global config lives at `~/.config/oc-wingman/config.json`.
Project config lives at `.wingman/config.json` in the project root.
Project reviewers merge over global reviewers by `name` alias.

## Artifacts

Every run writes full reviewer output under `.wingman/runs/` before returning compact chat output.
Optional audit logs live in `.wingman/logs/YYYY-MM-DD.jsonl` when `logging.enabled` is true.
```

- [ ] **Step 2: Run full verification**

Run: `npm run verify`

Expected: `tsc --noEmit` exits 0 and `tsx --test tests/*.test.ts` reports all tests passing.

## Task 5: Final Review

**Files:**
- Review: `src/core/intent.ts`
- Review: `src/core/reviewers.ts`
- Review: `src/server.ts`
- Review: `README.md`

- [ ] **Step 1: Inspect the working diff**

Run: `git diff -- src/core/intent.ts src/core/reviewers.ts src/server.ts tests/intent.test.ts tests/reviewers.test.ts tests/server.test.ts README.md`

Expected: the diff contains only the parser, reviewer alias matching, server chat hook, tests, and README updates described in this plan.

- [ ] **Step 2: Run full verification again after reviewing the diff**

Run: `npm run verify`

Expected: `tsc --noEmit` exits 0 and `tsx --test tests/*.test.ts` reports all tests passing.

- [ ] **Step 3: Report restart requirement**

In the final implementation response, tell the user that OpenCode must be restarted after plugin changes because plugin code is loaded at startup.
