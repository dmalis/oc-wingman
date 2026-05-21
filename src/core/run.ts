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
  maxRounds: number;
  executor: ReviewerExecutor;
  signal?: AbortSignal;
};

export async function runWingmanReview(input: RunWingmanReviewInput): Promise<WingmanRunResult> {
  const artifacts = await createRunArtifacts(input.cwd);
  const maxRounds = input.mode === "consensus" ? Math.max(1, input.maxRounds) : 1;
  const rawResults: ReviewerResult[] = [];
  let completedRounds = 0;
  for (let round = 1; round <= maxRounds; round += 1) {
    completedRounds = round;
    const prompt = buildReviewerPrompt(input.request, input.targetLabel, input.mode, round);
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
    if (input.mode !== "consensus" || consensusReached(roundResults)) break;
  }
  const ok = rawResults.filter((result) => result.status === "ok").length;
  const failed = rawResults.filter((result) => result.status === "failed").length;
  const cancelled = rawResults.filter((result) => result.status === "cancelled").length;
  const text = formatCompactRunResult({ ok, failed, cancelled, artifactDir: artifacts.dir, results: rawResults });
  await writeSynthesisInput(artifacts, buildSynthesisInput(rawResults));
  await writeRunSummary(artifacts, { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: completedRounds, cancelled: cancelled > 0, results: rawResults });
  return { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: completedRounds, cancelled: cancelled > 0, results: rawResults, artifactDir: artifacts.dir, summaryPath: artifacts.summaryPath, synthesisInputPath: artifacts.synthesisInputPath, text };
}

function buildReviewerPrompt(request: string, targetLabel: string, mode: WingmanMode, round: number): string {
  return [
    "You are a read-only Wingman reviewer.",
    "Inspect the provided project context if tools are available, but do not write files, edit files, commit, or run mutating commands.",
    `Mode: ${mode}`,
    `Target: ${targetLabel}`,
    `Round: ${round}`,
    "Return findings ordered by severity with concrete recommendations.",
    "",
    request,
  ].join("\n");
}

function consensusReached(results: ReviewerResult[]): boolean {
  const successful = results.filter((result) => result.status === "ok");
  return successful.length > 0 && successful.every((result) => /CONSENSUS:\s*yes/i.test(result.output ?? ""));
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
