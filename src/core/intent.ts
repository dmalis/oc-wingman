import type { CurrentModel } from "./types.ts";

export type WingmanChatIntent = {
  focus: string;
  reviewerHint?: string;
  reviewerNames?: string[];
  allReviewers?: boolean;
};

const knownReviewerHints = new Set([
  "claude",
  "codex",
  "deepseek",
  "gemini",
  "gpt",
  "grok",
  "haiku",
  "openai",
  "opus",
  "sonnet",
  "xai",
]);

const reviewerToken = "([a-z0-9][a-z0-9._:/-]*)";
const reviewVerbPattern = "(?:audit|check|review|inspect|critique|sanity[-\\s]+check|look\\s+at|take\\s+a\\s+look)";
const reviewStartPattern = new RegExp(`^${reviewVerbPattern}\\b`, "i");
const configDiscussionPattern = /\b(?:config|configuration|configure|setup|set\s+up|install|help|plugin)\b/i;

export function parseWingmanChatIntent(text: string): WingmanChatIntent | undefined {
  const input = cleanFocus(text);
  if (!input) return undefined;
  if (hasNegatedWingmanRequest(input)) return undefined;

  return parseAllReviewerIntent(input) ?? parseExplicitWingmanIntent(input) ?? parseReviewerHintIntent(input);
}

export function buildWingmanRoutingInstruction(intent: WingmanChatIntent, currentModel?: CurrentModel): string {
  const hasReviewerSelection = intent.allReviewers || Boolean(intent.reviewerHint) || Boolean(intent.reviewerNames?.length);
  const lines = ["Wingman detected a review request."];

  if (!hasReviewerSelection) {
    lines.push(`Review focus: ${intent.focus}`);
    if (currentModel) lines.push(`Current model: ${currentModel.providerID}/${currentModel.modelID}`);
    lines.push("No reviewer hint was provided. Ask the user which configured eligible reviewers to use before calling wingman_review.");
    lines.push("Do not call wingman_review until the user chooses reviewers.");
    lines.push("Only resolve reviewer hints against configured Wingman reviewers. Do not guess unconfigured models. If no configured reviewer matches, ask the user to configure or choose reviewers.");
    lines.push("After the tool returns, synthesize what you accept, what you reject, and the concrete next action. Do not dump raw reviewer output. Then stop and wait for user confirmation before modifying files or continuing implementation.");
    return lines.join("\n");
  }

  lines.push("Call wingman_review with:", `- focus: ${intent.focus}`);

  if (currentModel) {
    lines.push(`- currentProviderID: ${currentModel.providerID}`, `- currentModelID: ${currentModel.modelID}`);
  }

  if (intent.reviewerNames?.length) {
    lines.push(`- reviewerNames: ${JSON.stringify(intent.reviewerNames)}`);
  } else if (intent.reviewerHint) {
    lines.push(`- reviewerHint: ${intent.reviewerHint}`);
  }

  if (intent.allReviewers) {
    lines.push("The user asked for all eligible configured reviewers. Do not pass reviewerHint or reviewerNames.");
  } else if (!intent.reviewerHint && !intent.reviewerNames?.length) {
    lines.push("No reviewer hint was provided. Ask the user which configured eligible reviewers to use before calling wingman_review.");
  }

  lines.push("Only resolve reviewer hints against configured Wingman reviewers. Do not guess unconfigured models. If no configured reviewer matches, ask the user to configure or choose reviewers.");
  lines.push("After the tool returns, synthesize what you accept, what you reject, and the concrete next action. Do not dump raw reviewer output. Then stop and wait for user confirmation before modifying files or continuing implementation.");
  return lines.join("\n");
}

function parseAllReviewerIntent(input: string): WingmanChatIntent | undefined {
  if (/^ask\s+all(?:\s+eligible)?\s+(?:wingmen|reviewers?)$/i.test(input)) return { focus: "auto", allReviewers: true };
  if (/^(?:run|use)\s+all(?:\s+eligible)?\s+(?:wingmen|reviewers?)$/i.test(input)) return { focus: "auto", allReviewers: true };

  const runAll = input.match(/^(?:run|use)\s+all(?:\s+eligible)?\s+(?:wingmen|reviewers?)(?:\s+(?:on|for|to))?\s+(.+)$/i);
  if (runAll?.[1]) {
    const focus = cleanFocus(runAll[1]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const withWingman = input.match(new RegExp(`^(${reviewVerbPattern})\\b(?:\\s+(.+?))?\\s+(?:with|using|via)\\s+wingman\\.?$`, "i"));
  if (withWingman?.[1]) {
    const target = withWingman[2] ? ` ${cleanFocus(withWingman[2])}` : "";
    const focus = cleanFocus(`${withWingman[1].toLowerCase()}${target}`);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const wingmanAll = input.match(/^(?:(?:ask|use)\s+wingman(?:\s+to)?|wingman)\s+(.+?)\s+(?:with|using|via)\s+all(?:\s+eligible)?\s+(?:wingmen|reviewers?)\.?$/i);
  if (wingmanAll?.[1]) {
    const focus = cleanFocus(wingmanAll[1]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const askAll = input.match(/^ask\s+all(?:\s+eligible)?\s+(?:wingmen|reviewers?)\s+to\s+(.+?)\.?$/i);
  if (askAll?.[1]) {
    const focus = cleanFocus(askAll[1]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  const reviewAll = input.match(new RegExp(`^(${reviewVerbPattern})\\b(?:\\s+(.+?))?\\s+(?:with|using|via)\\s+all(?:\\s+eligible)?\\s+(?:wingmen|reviewers?)\\.?$`, "i"));
  if (reviewAll?.[1]) {
    const target = reviewAll[2] ? ` ${cleanFocus(reviewAll[2])}` : "";
    const focus = cleanFocus(`${reviewAll[1].toLowerCase()}${target}`);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, allReviewers: true };
  }

  return undefined;
}

function parseExplicitWingmanIntent(input: string): WingmanChatIntent | undefined {
  const match = input.match(/^(?:(?:ask|use)\s+wingman(?:\s+to)?|wingman)\b\s*:?\s*-?\s*(.+?)\.?$/i);
  let rawFocus = match?.[1] ? cleanFocus(match[1]) : "";
  if (!rawFocus) return undefined;
  rawFocus = cleanFocus(rawFocus.replace(/^to\s+/i, ""));

  const colonHint = rawFocus.match(new RegExp(`^${reviewerToken}\\s*:\\s*(.+)$`, "i"));
  if (colonHint?.[1] && colonHint[2]) {
    const focus = cleanFocus(colonHint[2]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, reviewerHint: cleanHint(colonHint[1]) };
  }

  const spaceHint = rawFocus.match(new RegExp(`^${reviewerToken}\\s+(.+)$`, "i"));
  if (spaceHint?.[1] && spaceHint[2] && knownReviewerHints.has(cleanHint(spaceHint[1]))) {
    const focus = cleanFocus(spaceHint[2]);
    if (isConfigDiscussion(focus)) return undefined;
    return { focus, reviewerHint: cleanHint(spaceHint[1]) };
  }

  if (isConfigDiscussion(rawFocus)) return undefined;
  return { focus: rawFocus, allReviewers: true };
}

function parseReviewerHintIntent(input: string): WingmanChatIntent | undefined {
  const withReviewer = input.match(new RegExp(`^(${reviewVerbPattern})\\b(?:\\s+(.+?))?\\s+(?:with|using|via)\\s+${reviewerToken}\\.?$`, "i"));
  if (withReviewer?.[1] && withReviewer[3]) {
    const target = withReviewer[2] ? ` ${cleanFocus(withReviewer[2])}` : "";
    return { focus: cleanFocus(`${withReviewer[1].toLowerCase()}${target}`), reviewerHint: cleanHint(withReviewer[3]) };
  }

  const runBy = input.match(new RegExp(`^run\\s+(.+?)\\s+(?:by|past)\\s+${reviewerToken}\\.?$`, "i"));
  if (runBy?.[1] && runBy[2]) return { focus: cleanFocus(runBy[1]), reviewerHint: cleanHint(runBy[2]) };

  const getTo = input.match(new RegExp(`^get\\s+${reviewerToken}\\s+to\\s+(.+?)\\.?$`, "i"));
  if (getTo?.[1] && getTo[2] && reviewStartPattern.test(getTo[2])) return { focus: cleanFocus(getTo[2]), reviewerHint: cleanHint(getTo[1]) };

  const secondOpinion = input.match(new RegExp(`^ask\\s+${reviewerToken}\\s+for\\s+(?:a\\s+)?second\\s+opinion(?:\\s+on\\s+(.+?))?\\.?$`, "i"));
  if (secondOpinion?.[1]) return { focus: cleanFocus(secondOpinion[2] ?? "second opinion"), reviewerHint: cleanHint(secondOpinion[1]) };

  const secondOpinionFrom = input.match(new RegExp(`^get\\s+(?:a\\s+)?second\\s+opinion\\s+from\\s+${reviewerToken}(?:\\s+on\\s+(.+?))?\\.?$`, "i"));
  if (secondOpinionFrom?.[1]) return { focus: cleanFocus(secondOpinionFrom[2] ?? "second opinion"), reviewerHint: cleanHint(secondOpinionFrom[1]) };

  const askTo = input.match(new RegExp(`^ask\\s+${reviewerToken}\\s+to\\s+(.+?)\\.?$`, "i"));
  if (askTo?.[1] && askTo[2] && reviewStartPattern.test(askTo[2])) return { focus: cleanFocus(askTo[2]), reviewerHint: cleanHint(askTo[1]) };

  return undefined;
}

function cleanFocus(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/[.?!]+$/g, "").trim();
}

function isConfigDiscussion(value: string): boolean {
  return configDiscussionPattern.test(value) && !reviewStartPattern.test(value);
}

function hasNegatedWingmanRequest(value: string): boolean {
  return /\b(?:do\s+not|don't|dont|never)\s+(?:ask|use|run|call)\b.{0,80}\b(?:wingman|reviewers?|codex|gemini|claude)\b/i.test(value)
    || /\b(?:review|audit|check|inspect|critique)\b.{0,40}\bwithout\s+wingman\b/i.test(value)
    || /\bwithout\s+wingman\b.{0,40}\b(?:review|audit|check|inspect|critique)\b/i.test(value);
}

function cleanHint(value: string): string {
  return value.trim().replace(/^[^a-z0-9]+|[^a-z0-9._:/-]+$/gi, "").toLowerCase();
}
