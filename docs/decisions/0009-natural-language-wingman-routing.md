# 0009: Natural-Language Wingman Routing — chat phrases route to configured Wingman reviewers

## Decision

Standalone `oc-wingman` will support natural-language chat routing with a `chat.message` hook.

The hook will detect explicit-but-natural review requests such as `audit with gemini`, `check with codex`, `run this by claude`, and `get a second opinion from deepseek`. When matched, it will rewrite the user text into an instruction for the main model to call `wingman_review` with the parsed focus and reviewer hint.

Reviewer hint matching will be derived from configured Wingman reviewers. The existing reviewer fields `name`, `provider`, and `model` are the source of truth. A natural phrase such as `ask gemini to review this` only makes sense if a configured reviewer has a matching alias, provider, or model string. Built-in alias rules such as `gemini -> google/gemini`, `codex -> openai/codex`, and `claude -> anthropic/claude` may help match configured reviewers, but they must never invent or select unconfigured reviewers.

## Reason

The MCC plugin proved that a `chat.message` router is a good fit for natural interaction: it keeps the main model in control while avoiding a direct hidden auto-run from the plugin. The standalone plugin currently only exposes `/wingman` and `wingman_review`, which makes normal chat phrases unreliable because they depend on the main model deciding to call the tool on its own.

Direct auto-run hooks were rejected because they are harder to explain, cancel, and debug. Command-template-only routing was rejected because it keeps the workflow command-centric and does not support conversational usage. A separate free-floating hint registry was rejected because it could imply that `ask XXX` works even when no `XXX` reviewer is configured.

## Consequences

- Add an intent parser for natural Wingman phrases.
- Add `chat.message` routing in `src/server.ts`.
- Reuse configured reviewer `name`, `provider`, and `model` fields for hint resolution.
- Add built-in alias matching only as a helper over configured reviewers, never as a source of new reviewers.
- Add tests for positive routing, non-trigger phrases, configured aliases, and default aliases.
- Update README with natural-language examples and restart notes.
