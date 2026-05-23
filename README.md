# oc-wingman

Standalone OpenCode Wingman plugin for read-only second-opinion reviews.

## Install

1. Install dependencies in this repo:

```sh
npm install
```

2. Add the plugin to the OpenCode config for the workspace where you want Wingman available.

For a project-local setup, put `opencode.json` in that project root. If the config file is not in this repo, use an absolute path to `oc-wingman/src/index.ts`, for example `/Users/alice/dev/oc-wingman/src/index.ts`. Relative plugin paths are resolved from the directory containing `opencode.json`.

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "/absolute/path/to/oc-wingman/src/index.ts"
  ]
}
```

3. Restart the OpenCode CLI or start a fresh `opencode run` after changing plugin config. OpenCode loads plugin modules at startup, so an existing session will not see plugin code or config changes.

4. Verify the plugin loaded by checking that `/wingman` and `/wingman:setup` are available.

5. Configure at least one reviewer with `/wingman:setup`. This writes Wingman reviewer config, not OpenCode plugin config.

If `/wingman` is missing, check that `npm install` completed, the plugin path points to this repo's `src/index.ts`, and OpenCode was restarted after the config change.

## Commands

- `/wingman:setup`: choose reviewer models and write global or project config.
- `/wingman setup`: setup shortcut through the main Wingman command.
- `/wingman`: ask configured reviewers for one read-only second opinion.

## Natural Chat

You can also ask for a Wingman review in normal chat:

```text
audit with gemini
audit with wingman
ask wingman to review this
ask all wingmen
check this with codex
run this by claude
wingman this with all reviewers
```

Natural phrases route only to configured Wingman reviewers. Requests that name Wingman itself, such as `audit with wingman` or `ask all wingmen`, use all eligible configured reviewers. Requests that name another reviewer or model, such as `check this with gemini`, work when a configured reviewer matches `gemini` by reviewer name, provider/model text, or the built-in `gemini` alias over configured reviewers. Wingman never invents an unconfigured reviewer from global model availability.

Passive model mentions, setup/config/help discussions, and negated requests do not trigger reviews, so text like `Gemini has a large context window` or `do not ask wingman` remains normal chat.

## Config

Global config lives at `~/.config/oc-wingman/config.json`.
Project config lives at `.wingman/config.json` in the project root.
Project reviewers merge over global reviewers by `name` alias. In this `oc-wingman` repo, `.wingman/config.json` is gitignored so local development reviewer choices do not get committed accidentally; add the same ignore rule in other projects if you want project reviewer choices to stay local.

## Artifacts

Every run writes full reviewer output under `.wingman/runs/` before returning compact chat output. The main agent should synthesize what it accepts, what it rejects, and the concrete next action, then stop and wait for confirmation before changing files.
