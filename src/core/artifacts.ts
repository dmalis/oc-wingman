import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedReviewer, ReviewerResult } from "./types.ts";

export type RunArtifacts = {
  runId: string;
  dir: string;
  reviewersDir: string;
  summaryPath: string;
  synthesisInputPath: string;
};

export function createRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export async function createRunArtifacts(cwd: string, runId = createRunId()): Promise<RunArtifacts> {
  const dir = join(cwd, ".wingman", "runs", runId);
  const reviewersDir = join(dir, "reviewers");
  await mkdir(reviewersDir, { recursive: true });
  return { runId, dir, reviewersDir, summaryPath: join(dir, "summary.json"), synthesisInputPath: join(dir, "synthesis-input.md") };
}

function safeAlias(alias: string): string {
  return alias.replace(/[^a-z0-9._-]/g, "-");
}

export async function writeReviewerArtifact(artifacts: RunArtifacts, reviewer: ResolvedReviewer, input: Omit<ReviewerResult, "reviewer" | "artifactMarkdownPath" | "artifactJsonPath">): Promise<ReviewerResult> {
  const base = input.round > 1 ? `${safeAlias(reviewer.name)}-round-${input.round}` : safeAlias(reviewer.name);
  const artifactMarkdownPath = join(artifacts.reviewersDir, `${base}.md`);
  const artifactJsonPath = join(artifacts.reviewersDir, `${base}.json`);
  const result: ReviewerResult = { ...input, reviewer, artifactMarkdownPath, artifactJsonPath };
  await writeFile(artifactMarkdownPath, reviewerMarkdown(result), "utf8");
  await writeFile(artifactJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function reviewerMarkdown(result: ReviewerResult): string {
  return [
    `# ${result.reviewer.label}`,
    "",
    `Status: ${result.status}`,
    `Round: ${result.round}`,
    result.error ? `Error: ${result.error}` : undefined,
    "",
    "## Prompt",
    "",
    result.prompt,
    "",
    "## Output",
    "",
    result.output ?? "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export async function writeRunSummary(artifacts: RunArtifacts, summary: Record<string, unknown>): Promise<void> {
  await writeFile(artifacts.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export async function writeSynthesisInput(artifacts: RunArtifacts, text: string): Promise<void> {
  await writeFile(artifacts.synthesisInputPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}
