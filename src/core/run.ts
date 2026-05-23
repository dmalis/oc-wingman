import { createRunArtifacts, writeReviewerArtifact, writeRunSummary, writeSynthesisInput } from "./artifacts.ts";
import { errorMessage } from "./errors.ts";
import { buildSynthesisInput, formatCompactRunResult } from "./synthesis.ts";
import type { ResolvedReviewer, ReviewerResult, WingmanMode, WingmanTarget, WingmanRunResult } from "./types.ts";

export type ReviewerExecutionInput = {
  reviewer: ResolvedReviewer;
  prompt: string;
  round: number;
  signal?: AbortSignal;
};

export type ReviewerExecutionOutput = {
  output: string;
  summary?: string;
};

export type ReviewerExecutor = (input: ReviewerExecutionInput) => Promise<ReviewerExecutionOutput>;

export type RunWingmanReviewInput = {
  cwd: string;
  request: string;
  mode: WingmanMode;
  target: WingmanTarget;
  targetLabel: string;
  reviewers: ResolvedReviewer[];
  maxParallelReviewers: number;
  executor: ReviewerExecutor;
  signal?: AbortSignal;
};

export async function runWingmanReview(input: RunWingmanReviewInput): Promise<WingmanRunResult> {
  const artifacts = await createRunArtifacts(input.cwd);
  const rawResults: ReviewerResult[] = [];
  const round = 1;
  const prompt = buildReviewerPrompt(input.request, input.targetLabel);
  const roundResults = await runWithLimit(input.reviewers, Math.max(1, input.maxParallelReviewers), async (reviewer) => {
    try {
      if (input.signal?.aborted) throw new DOMException("Run cancelled", "AbortError");
      const output = await input.executor({ reviewer, prompt, round, signal: input.signal });
      return await writeReviewerArtifact(artifacts, reviewer, { status: "ok", round, prompt, output: output.output, summary: output.summary });
    } catch (error) {
      return await writeReviewerArtifact(artifacts, reviewer, { status: input.signal?.aborted ? "cancelled" : "failed", round, prompt, error: errorMessage(error) });
    }
  });
  rawResults.push(...roundResults);
  const ok = rawResults.filter((result) => result.status === "ok").length;
  const failed = rawResults.filter((result) => result.status === "failed").length;
  const cancelled = rawResults.filter((result) => result.status === "cancelled").length;
  const text = formatCompactRunResult({ ok, failed, cancelled, artifactDir: artifacts.dir, results: rawResults });
  await writeSynthesisInput(artifacts, buildSynthesisInput(rawResults));
  await writeRunSummary(artifacts, { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: round, cancelled: cancelled > 0, results: rawResults });
  return { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: round, cancelled: cancelled > 0, results: rawResults, artifactDir: artifacts.dir, summaryPath: artifacts.summaryPath, synthesisInputPath: artifacts.synthesisInputPath, text };
}

function buildReviewerPrompt(request: string, targetLabel: string): string {
  return [
    "# Wingman second-opinion request",
    `Target: ${targetLabel}`,
    "",
    "## Instructions",
    "You are Wingman: an independent second-opinion reviewer for an OpenCode coding session.",
    "You are not the implementer and not the source of truth.",
    "Stay read-only. Do not edit files, write files, commit, or run mutating commands.",
    "Focus on correctness, risks, missed assumptions, alternatives, and whether the proposal is sound.",
    "If the user's request names a specific angle, weight that angle heavily.",
    "Be concrete, grounded, and concise.",
    "",
    "## Required output format",
    "Use exactly these sections:",
    "",
    "### Verdict",
    "One sentence: sound / needs attention / unclear, with why.",
    "",
    "### What looks right",
    "Bullets for points you agree with. Use `(none)` if nothing material.",
    "",
    "### Concerns or missed assumptions",
    "Bullets for material risks, gaps, or weak assumptions. Use `(none)` if nothing material.",
    "",
    "### Recommended next action",
    "Bullets with concrete next steps or checks. Keep this short.",
    "",
    "## Review focus",
    request,
  ].join("\n");
}

async function runWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function next(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      const item = items[current];
      if (!item) return;
      results[current] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}
