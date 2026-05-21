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
