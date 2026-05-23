import test from "node:test";
import assert from "node:assert/strict";
import { formatWingmanPrompt, reviewerSelectOptions, setupScopeOptions } from "../src/tui/options.ts";
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

test("reviewer picker includes all, specific reviewer, and cancel", () => {
  assert.deepEqual(reviewerSelectOptions([reviewer]).map((option) => option.value), ["all", "gemini", "cancel"]);
});

test("setup scope options include global and project", () => {
  assert.deepEqual(setupScopeOptions().map((option) => option.value), ["project", "global", "cancel"]);
});

test("formatWingmanPrompt encodes selected reviewers", () => {
  const prompt = formatWingmanPrompt("review config", ["gemini"]);
  assert.match(prompt, /wingman_review/);
  assert.match(prompt, /reviewerNames/);
  assert.match(prompt, /gemini/);
  assert.match(prompt, /stop and wait/i);
});
