import type { ResolvedReviewer } from "../core/types.ts";

export type PickerOption<Value extends string = string> = {
  title: string;
  value: Value;
  description?: string;
  disabled?: boolean;
};

export function setupScopeOptions(): PickerOption<"project" | "global" | "cancel">[] {
  return [
    { title: "Project config", value: "project", description: "Write .wingman/config.json in this project" },
    { title: "Global config", value: "global", description: "Write ~/.config/oc-wingman/config.json" },
    { title: "Cancel", value: "cancel", description: "Do not change Wingman config" },
  ];
}

export function reviewerSelectOptions(reviewers: ResolvedReviewer[]): PickerOption[] {
  return [
    { title: `All eligible reviewers (${reviewers.length})`, value: "all", description: "Run every eligible reviewer" },
    ...reviewers.map((reviewer) => ({ title: reviewer.label, value: reviewer.name, description: reviewer.key })),
    { title: "Cancel", value: "cancel", description: "Do not run Wingman" },
  ];
}

export function formatWingmanPrompt(focus: string, reviewerNames: string[]): string {
  const payload = JSON.stringify({ focus, reviewerNames }, null, 2);
  return `Use the wingman_review tool with this JSON payload, then synthesize what you accept, what you reject, and the concrete next action. Stop and wait for user confirmation before modifying files or continuing implementation.\n\n${payload}`;
}
