# Natural-Language Wingman Routing Design

## Goal

Make standalone `oc-wingman` feel natural in normal OpenCode chat. A user should be able to type phrases like `audit with gemini`, `check this with codex`, or `run this by claude`, and the plugin should route that request to the existing `wingman_review` tool.

The router must only use reviewers configured in Wingman config. It must not invent reviewers from global model availability just because a provider or model name appears in chat.

## Non-Goals

- Do not directly run Wingman from a hook without the main model seeing an explicit instruction.
- Do not add a separate free-floating `hints` config object.
- Do not make passive model mentions trigger reviews.
- Do not change the existing `/wingman` command or TUI picker flow except where they share parser utilities.

## Current Behavior

The plugin currently exposes:

- `/wingman`, a command template that tells the main model to call `wingman_review`.
- `wingman_review`, a tool with `focus`, `reviewerNames`, `reviewerHint`, `targetHint`, and current-model arguments.
- TUI picker flows that append a prompt instructing the main model to call `wingman_review`.

There is no `chat.message` hook. Natural phrases only work when the main model independently decides to call `wingman_review`, which is unreliable.

## Proposed Behavior

Add a `chat.message` hook to `src/server.ts` that scans user text parts before the main model receives them. When the hook detects a clear Wingman review request, it rewrites that text part into a routing instruction.

The instruction tells the main model to call `wingman_review` with:

- `focus`: the user’s review target or request.
- `reviewerHint`: the parsed reviewer hint, when present.
- `reviewerNames`: exact configured reviewer names only when the user explicitly names exact configured reviewers. For all-reviewer phrasing, omit `reviewerNames` and `reviewerHint` so `wingman_review` runs all eligible configured reviewers.
- `currentProviderID` and `currentModelID`: copied from `input.model` when OpenCode provides it.

The instruction also tells the main model to synthesize the result and not dump raw reviewer output.

## Intent Parser

Create `src/core/intent.ts` with pure parsing functions and tests.

The parser returns:

```ts
export type WingmanChatIntent = {
  focus: string;
  reviewerHint?: string;
  reviewerNames?: string[];
  allReviewers?: boolean;
};
```

Supported trigger families:

- Explicit Wingman requests: `ask wingman ...`, `wingman ...`, `use wingman ...`.
- Review verbs with reviewer hints: `audit with gemini`, `check this with codex`, `review this with claude`.
- Conversational phrasing: `run this by deepseek`, `get gemini to look at this`, `ask claude for a second opinion on this`.
- All-reviewer phrasing: `wingman this with all reviewers`, `ask all reviewers to audit this`.

Non-triggers:

- Passive mentions: `Gemini has a large context window`, `Codex docs say...`.
- Configuration talk: `configure gemini as a reviewer`, unless phrased as an actual review request.
- Ambiguous questions without a review verb: `what do you think about gemini?`.

## Reviewer Hint Resolution

Reviewer hint resolution remains grounded in configured reviewers.

Each configured reviewer already has:

```ts
{
  name: string;
  provider: string;
  model: string;
}
```

Resolution order:

1. Exact configured reviewer `name` match.
2. Existing `reviewerMatchesHint()` matching against configured `name`, `provider`, and `model` text.
3. Built-in alias expansion applied only over configured reviewers.

Built-in aliases are helpers, not config entries:

- `gemini` matches configured reviewers whose provider/model text includes `google` or `gemini`.
- `claude`, `sonnet`, and `opus` match configured Anthropic/Claude reviewers.
- `codex`, `openai`, and `gpt` match configured OpenAI/Codex/GPT reviewers.
- `deepseek` matches configured DeepSeek reviewers.
- `grok` and `xai` match configured Grok/xAI reviewers.

If no configured reviewer matches the hint, `wingman_review` should report the existing no-match error rather than selecting an unconfigured model.

## Routing Instruction

Add `buildWingmanRoutingInstruction(intent, currentModel?)` in `src/core/intent.ts`.

The generated text should be compact and explicit:

```text
Wingman detected a review request.
Call wingman_review with:
- focus: <focus>
- reviewerHint: <hint>
- currentProviderID: <provider>
- currentModelID: <model>

Only resolve reviewerHint against configured Wingman reviewers. Do not guess unconfigured models. If no configured reviewer matches, ask the user to configure or choose reviewers.
After the tool returns, synthesize what to keep, what to dismiss, and concrete next actions. Do not dump raw reviewer output.
```

When there is no reviewer hint and the user did not ask for all reviewers, the instruction should tell the main model to ask which configured reviewers to use before calling the tool.

When the user asks for all reviewers, the instruction should call `wingman_review` with the focus and current-model IDs only. It should not include a made-up reviewer list.

## Config Impact

No schema change is required.

Natural-language routing reuses existing reviewer config:

```json
{
  "reviewers": [
    { "name": "gemini", "provider": "google", "model": "gemini-3.1-pro-preview" },
    { "name": "codex", "provider": "openai", "model": "gpt-5.5" }
  ]
}
```

This keeps setup simple and avoids implying that unconfigured reviewers are available.

## Error Handling

- If parser finds no intent, the hook leaves the message unchanged.
- If the message has multiple text parts, the hook rewrites only the first detected Wingman intent and returns.
- If the intent has an unknown reviewer hint, the tool handles it through existing reviewer selection errors.
- If no reviewers are configured, the tool reports the existing setup guidance.

## Testing

Add tests for:

- Parser positives: `audit with gemini`, `check this with codex`, `run this by claude`, `ask wingman deepseek: review the plan`, `wingman this with all reviewers`.
- Parser negatives: passive model mentions and config discussions.
- Routing instruction includes `reviewerHint` and current model IDs when available.
- Server `chat.message` rewrites a matching text part.
- Server `chat.message` leaves non-matching text unchanged.
- Reviewer selection matches configured reviewers through default aliases and fails when no configured reviewer matches.

## Documentation

Update `README.md` with natural-language examples and a note that phrases only route to configured reviewers.

Examples:

```text
audit with gemini
check this with codex
run this by claude
wingman this with all reviewers
```

Also remind users to restart OpenCode after changing plugin config.
