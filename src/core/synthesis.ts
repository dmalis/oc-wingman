import type { ReviewerResult } from "./types.ts";

export function boundedExcerpt(value: string | undefined, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated: full output persisted in reviewer artifact]`;
}

export function formatCompactRunResult(input: { ok: number; failed: number; cancelled: number; artifactDir: string; results: ReviewerResult[]; maxExcerptChars?: number }): string {
  const maxExcerptChars = input.maxExcerptChars ?? 1200;
  const lines = [
    `Wingman status: ${input.ok} ok, ${input.failed} failed, ${input.cancelled} cancelled`,
    `Artifacts: ${input.artifactDir}`,
    "",
    "Reviewer status:",
    ...input.results.map((result) => `- [${result.status}] ${result.reviewer.key} (${result.reviewer.name})${result.artifactMarkdownPath ? ` -> ${result.artifactMarkdownPath}` : ""}`),
    "",
    "Reviewer excerpts:",
    ...input.results.flatMap((result) => [
      `## ${result.reviewer.name}`,
      boundedExcerpt(result.output ?? result.error, maxExcerptChars),
      "",
    ]),
    "Main agent: start your response with a compact Wingman status block, then synthesize reviewer opinions. State what to keep, what to dismiss, and concrete next actions. Do not dump raw reviewer output.",
  ];
  return lines.join("\n").trimEnd();
}

export function buildSynthesisInput(results: ReviewerResult[]): string {
  return results.map((result) => [`# ${result.reviewer.label}`, `Status: ${result.status}`, result.output ?? result.error ?? ""].join("\n\n")).join("\n\n---\n\n");
}
