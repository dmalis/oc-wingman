import type { WingmanContextPack, WingmanMode, WingmanTarget } from "./types.ts";

const pathPattern = /(?:^|\s)([\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs|css|html|yaml|yml))(?:\s|$|,)/g;

export function inferWingmanContext(input: { cwd: string; request: string; targetHint?: string; sessionText?: string }): WingmanContextPack {
  const request = input.request.trim();
  const mode = inferMode(request);
  const target = inferTarget(request, input.targetHint, input.sessionText);
  return {
    target,
    label: targetLabel(target),
    focus: request,
    mode,
    cwd: input.cwd,
    content: input.sessionText ?? "",
    reason: `Inferred ${target.type} from Wingman request`,
  };
}

function inferMode(request: string): WingmanMode {
  if (/\b(consensus|decide|which|choose|trade[-\s]?off)\b/i.test(request)) return "consensus";
  if (/\b(skeptical|adversarial|red[-\s]?team|do not rubber[-\s]?stamp)\b/i.test(request)) return "adversarial";
  if (/\b(rescue|stuck|debug)\b/i.test(request)) return "rescue";
  return "audit";
}

function inferTarget(request: string, targetHint: string | undefined, sessionText: string | undefined): WingmanTarget {
  const focus = targetHint?.trim() || request;
  if (/\b(which|choose|decide|should we)\b/i.test(focus)) return { type: "question-consensus", question: focus, confidence: "high" };
  if (/\b(plan|spec|adr|design)\b/i.test(focus)) return { type: "current-plan", text: focus, confidence: "high" };
  const files = extractPaths(focus);
  if (files.length > 0) return { type: "files", paths: files, confidence: "high" };
  const branch = /\bbranch\s+diff\s+(?:against\s+)?([\w./-]+)/i.exec(focus)?.[1];
  if (branch) return { type: "branch-diff", base: branch, confidence: "medium" };
  const commit = /\bcommit\s+([a-f0-9]{7,40})\b/i.exec(focus)?.[1];
  if (commit) return { type: "commit", sha: commit, confidence: "high" };
  if (/\bworking\s+tree|diff|changes\b/i.test(focus)) return { type: "working-tree", confidence: "medium" };
  if (sessionText?.trim()) return { type: "last-turn", text: sessionText, confidence: "medium" };
  return { type: "freeform", focus, confidence: "low" };
}

function extractPaths(value: string): string[] {
  const paths = new Set<string>();
  for (const match of value.matchAll(pathPattern)) {
    const file = match[1]?.replace(/[,.]$/, "");
    if (file) paths.add(file);
  }
  return Array.from(paths);
}

function targetLabel(target: WingmanTarget): string {
  if (target.type === "files") return `Files: ${target.paths.join(", ")}`;
  if (target.type === "branch-diff") return `Branch diff against ${target.base}`;
  if (target.type === "commit") return `Commit ${target.sha}`;
  if (target.type === "question-consensus") return "Question consensus";
  if (target.type === "current-plan") return "Plan/spec review";
  if (target.type === "working-tree") return "Working tree";
  if (target.type === "last-turn") return "Last turn";
  return "Freeform";
}
