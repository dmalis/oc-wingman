# oc-wingman

Standalone OpenCode Wingman plugin for read-only model reviews.

## Install

Add both plugin entrypoints to OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./src/server.ts",
    "./src/tui/index.ts"
  ]
}
```

Restart OpenCode after changing plugin config. OpenCode loads plugin config at startup.

## Commands

- `/wingman:setup`: choose reviewer models and write global or project config.
- `/wingman`: choose reviewers for one read-only review run.

## Natural Chat

You can also ask for a Wingman review in normal chat:

```text
audit with gemini
check this with codex
run this by claude
wingman this with all reviewers
```

Natural phrases route only to configured Wingman reviewers. A phrase like `check this with gemini` works when a configured reviewer matches `gemini` by reviewer name, provider/model text, or the built-in `gemini` alias over configured reviewers. Wingman never invents an unconfigured reviewer from global model availability.

Passive model mentions do not trigger reviews, so text like `Gemini has a large context window` remains normal chat.

## Config

Global config lives at `~/.config/oc-wingman/config.json`.
Project config lives at `.wingman/config.json` in the project root.
Project reviewers merge over global reviewers by `name` alias.

## Artifacts

Every run writes full reviewer output under `.wingman/runs/` before returning compact chat output.
Optional audit logs live in `.wingman/logs/YYYY-MM-DD.jsonl` when `logging.enabled` is true.
