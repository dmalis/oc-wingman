import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRunArtifacts, writeReviewerArtifact, writeRunSummary } from "../src/core/artifacts.ts";
import { formatCompactRunResult } from "../src/core/synthesis.ts";
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

test("writes full reviewer output while compact result remains bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-artifacts-"));
  const artifacts = await createRunArtifacts(root, "run-abc");
  const longOutput = "Finding line\n".repeat(500);
  const result = await writeReviewerArtifact(artifacts, reviewer, { status: "ok", round: 1, prompt: "review", output: longOutput });
  await writeRunSummary(artifacts, { runId: "run-abc", request: "review", results: [result], cancelled: false, rounds: 1 });

  const markdown = await readFile(result.artifactMarkdownPath!, "utf8");
  assert.equal(markdown.includes(longOutput.slice(0, 200)), true);

  const compact = formatCompactRunResult({ ok: 1, failed: 0, cancelled: 0, artifactDir: artifacts.dir, results: [result], maxExcerptChars: 120 });
  assert.equal(compact.length < longOutput.length, true);
  assert.match(compact, /run-abc/);
  assert.match(compact, /reviewers\/gemini.md/);
});
