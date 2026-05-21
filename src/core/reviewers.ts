import { WingmanError } from "./errors.ts";
import type { CurrentModel, ModelRef, ResolvedReviewer, WingmanConfig, WingmanReviewerConfig } from "./types.ts";

const builtInReviewerAliases: Record<string, string[]> = {
  claude: ["anthropic", "claude"],
  codex: ["openai", "codex", "gpt"],
  deepseek: ["deepseek"],
  gemini: ["google", "gemini"],
  gpt: ["openai", "gpt"],
  grok: ["xai", "grok"],
  openai: ["openai", "gpt", "codex"],
  opus: ["anthropic", "claude", "opus"],
  sonnet: ["anthropic", "claude", "sonnet"],
  xai: ["xai", "grok"],
};

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function reviewerKey(reviewer: Pick<WingmanReviewerConfig, "provider" | "model">): string {
  return modelKey(reviewer.provider, reviewer.model);
}

function sameModel(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined): boolean {
  return Boolean(current && reviewer.provider === current.providerID && reviewer.model === current.modelID);
}

function sameProvider(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined): boolean {
  return Boolean(current && reviewer.provider === current.providerID);
}

function isExcluded(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined, policy: WingmanConfig["exclude"]): boolean {
  if (!current) return false;
  if (sameModel(reviewer, current)) return true;
  if (policy === "same-provider") return sameProvider(reviewer, current);
  return false;
}

export function resolveConfiguredReviewers(config: WingmanConfig, models: ModelRef[], current: CurrentModel | undefined): ResolvedReviewer[] {
  if (config.reviewers.length === 0) throw new WingmanError("reviewer.none", "Wingman reviewers are not configured. Run /wingman:setup first.");
  const modelMap = new Map(models.map((model) => [modelKey(model.providerID, model.modelID), model]));
  const validated = config.reviewers.map((reviewer) => {
    const key = reviewerKey(reviewer);
    const modelRef = modelMap.get(key);
    if (!modelRef) throw new WingmanError("reviewer.unavailable", `Configured Wingman reviewer ${key} is not available to OpenCode. Run /wingman:setup to refresh config.`);
    return {
      ...reviewer,
      key,
      label: `${reviewer.name} (${key})`,
      sameProvider: sameProvider(reviewer, current),
      sameModel: sameModel(reviewer, current),
      modelRef,
      source: "merged" as const,
    };
  });
  const selected = validated.filter((reviewer) => !isExcluded(reviewer, current, config.exclude));
  if (selected.length === 0) {
    const currentLabel = current ? modelKey(current.providerID, current.modelID) : "the current model";
    throw new WingmanError("reviewer.none", `No eligible Wingman reviewers remain after excluding ${config.exclude === "same-provider" ? "current provider" : "current model"} (${currentLabel}).`);
  }
  return selected;
}

export function reviewerMatchesHint(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, hint: string): boolean {
  const normalized = normalizeHint(hint);
  if (!normalized) return false;
  return reviewerMatchesConfiguredText(reviewer, normalized) || reviewerMatchesBuiltInAlias(reviewer, normalized);
}

export function selectReviewers(input: { eligible: ResolvedReviewer[]; hint?: string; names?: string[] }): ResolvedReviewer[] {
  const names = input.names?.map((name) => name.trim()).filter(Boolean) ?? [];
  if (names.length > 0) return dedupeReviewers(names.flatMap((name) => selectOne(input.eligible, name)));
  const hint = input.hint?.trim();
  if (hint) return selectOne(input.eligible, hint);
  return input.eligible;
}

function selectOne(eligible: ResolvedReviewer[], name: string): ResolvedReviewer[] {
  const normalized = normalizeHint(name);
  const exactMatches = eligible.filter((reviewer) => reviewer.name.toLowerCase() === normalized || reviewer.key.toLowerCase() === normalized);
  if (exactMatches.length > 0) return requireSingleReviewer(exactMatches, name);

  const configuredTextMatches = eligible.filter((reviewer) => reviewerMatchesConfiguredText(reviewer, normalized));
  if (configuredTextMatches.length > 0) return requireSingleReviewer(configuredTextMatches, name);

  const aliasMatches = eligible.filter((reviewer) => reviewerMatchesBuiltInAlias(reviewer, normalized));
  if (aliasMatches.length > 0) return requireSingleReviewer(aliasMatches, name);

  throw new WingmanError("reviewer.unavailable", `No eligible configured Wingman reviewer matches ${name}.`);
}

function requireSingleReviewer(matches: ResolvedReviewer[], name: string): ResolvedReviewer[] {
  if (matches.length === 1) return matches;
  throw new WingmanError("reviewer.ambiguous", `Multiple eligible Wingman reviewers match ${name}: ${matches.map((reviewer) => reviewer.key).join(", ")}.`);
}

function reviewerMatchesConfiguredText(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, normalizedHint: string): boolean {
  if (!normalizedHint) return false;
  return reviewerSearchText(reviewer).includes(normalizedHint);
}

function reviewerMatchesBuiltInAlias(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, normalizedHint: string): boolean {
  const aliases = builtInReviewerAliases[normalizedHint] ?? [];
  if (aliases.length === 0) return false;
  const haystack = reviewerSearchText(reviewer);
  return aliases.some((alias) => haystack.includes(alias));
}

function reviewerSearchText(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">): string {
  return `${reviewer.name} ${reviewer.provider} ${reviewer.model} ${reviewer.provider}/${reviewer.model}`.toLowerCase();
}

function normalizeHint(hint: string): string {
  return hint.trim().toLowerCase();
}

export function dedupeReviewers(reviewers: ResolvedReviewer[]): ResolvedReviewer[] {
  const seen = new Set<string>();
  return reviewers.filter((reviewer) => {
    if (seen.has(reviewer.key)) return false;
    seen.add(reviewer.key);
    return true;
  });
}
