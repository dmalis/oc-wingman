import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/core/config.ts";
import { resolveConfiguredReviewers, reviewerMatchesHint, selectReviewers } from "../src/core/reviewers.ts";
import type { CurrentModel, ModelRef } from "../src/core/types.ts";

const models: ModelRef[] = [
  { providerID: "openai", modelID: "gpt-5.5", name: "GPT 5.5" },
  { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
  { providerID: "google", modelID: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
  { providerID: "anthropic", modelID: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }
];

function config(exclude: "same-provider" | "same-model") {
  return normalizeConfig({
    exclude,
    reviewers: [
      { name: "main", provider: "openai", model: "gpt-5.5" },
      { name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" },
      { name: "flash", provider: "google", model: "gemini-3.1-flash" },
      { name: "claude", provider: "anthropic", model: "claude-sonnet-4-6" }
    ]
  }, "memory");
}

test("same-provider policy excludes current provider and exact model", () => {
  const current: CurrentModel = { providerID: "google", modelID: "gemini-3.1-pro-preview" };
  const reviewers = resolveConfiguredReviewers(config("same-provider"), models, current);
  assert.deepEqual(reviewers.map((reviewer) => reviewer.name), ["main", "claude"]);
});

test("same-model policy allows same provider but never exact same model", () => {
  const current: CurrentModel = { providerID: "google", modelID: "gemini-3.1-pro-preview" };
  const reviewers = resolveConfiguredReviewers(config("same-model"), models, current);
  assert.deepEqual(reviewers.map((reviewer) => reviewer.name), ["main", "flash", "claude"]);
});

test("selectReviewers handles aliases and ambiguous hints", () => {
  const reviewers = resolveConfiguredReviewers(config("same-model"), models, { providerID: "openai", modelID: "gpt-5.5" });
  assert.deepEqual(selectReviewers({ eligible: reviewers, names: ["claude"] }).map((reviewer) => reviewer.name), ["claude"]);
  assert.equal(reviewerMatchesHint(reviewers[0], "gemini"), true);
  assert.deepEqual(selectReviewers({ eligible: reviewers, names: ["gemini"] }).map((reviewer) => reviewer.name), ["gemini"]);
  assert.throws(() => selectReviewers({ eligible: reviewers, hint: "google" }), /Multiple eligible Wingman reviewers match/);
});

test("missing configured model reports unavailable reviewer", () => {
  const bad = normalizeConfig({ reviewers: [{ name: "missing", provider: "nope", model: "none" }] }, "memory");
  assert.throws(() => resolveConfiguredReviewers(bad, models, undefined), /Configured Wingman reviewer nope\/none is not available/);
});

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
