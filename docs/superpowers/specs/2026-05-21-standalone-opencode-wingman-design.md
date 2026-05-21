# Standalone OpenCode Wingman Design

## Purpose

Build `oc-wingman` as a standalone OpenCode plugin that brings the stronger `pi-wingmen` review workflow into OpenCode without depending on MCC work state.

The plugin gives the main agent one or more independent read-only reviewer model opinions, then returns compact structured results and durable artifacts so the main agent can synthesize the final response.

## Decisions

This spec incorporates these ADRs:

- `docs/decisions/0001-wingman-config-scopes.md`: support global defaults and project-local overrides.
- `docs/decisions/0002-read-only-reviewer-sessions.md`: reviewers always run in read-only sessions.
- `docs/decisions/0003-always-show-run-picker.md`: interactive `/wingman` always shows reviewer selection.
- `docs/decisions/0004-leave-mcc-wingman-alone.md`: V1 does not modify MCC.
- `docs/decisions/0005-hybrid-server-tui-plugin.md`: use one package with separate server and TUI entrypoints.
- `docs/decisions/0006-run-boundary-config-snapshots.md`: reload config at each run boundary and freeze a run snapshot.
- `docs/decisions/0007-persist-run-artifacts.md`: persist reviewer artifacts independently of optional logging.

## Scope

### In Scope

- Standalone OpenCode plugin package.
- Server entrypoint for config, orchestration, read-only reviewer execution, artifacts, and tool/command output.
- TUI entrypoint for setup, picker, preflight, progress, and cancellation UX.
- Config loading from global defaults plus project-local overrides.
- Per-run config reload and resolved run snapshots.
- Reviewer aliases, model selection, eligibility checks, exclusion policy, and parallel execution.
- Pi-style interactive setup and reviewer picker UX.
- Durable per-run artifacts for full reviewer output.
- Optional `.wingman/logs/*.jsonl` audit logging.
- Tests for core behavior, runtime behavior, and adapter-mapping boundaries. Native dialog rendering may be covered by smoke tests if it cannot be automated.

### Out of Scope

- Changing `projects/mcc` or replacing MCC's embedded Wingman.
- Visual/browser companion UI.
- Write-capable reviewer rescue mode.
- Dynamic plugin framework for reviewer policies.
- Cross-machine artifact synchronization.

## Recommended Approach

Use a hybrid OpenCode plugin:

- Server side owns config loading, reviewer selection, read-only execution, artifact writing, and compact results.
- TUI side owns setup picker, run picker, preflight, progress, and cancellation.
- Shared core modules own behavior that can be tested without OpenCode adapters.

This was chosen over a server-only plugin because the desired UX needs native picker/progress interactions, and over a TUI-heavy plugin because orchestration and non-interactive usage need deterministic server-side behavior.

## Architecture

The package should expose separate OpenCode entrypoints because OpenCode modules are target-exclusive.

Core modules:

- `core/config`: loads, merges, validates, and normalizes global and project config.
- `core/reviewers`: resolves aliases, reviewer hints, eligibility, exclusion policy, and selected reviewers.
- `core/target`: infers review target and mode from request, session, diff, files, branch, commit, or freeform context.
- `core/run`: executes reviewer sessions in parallel with cancellation and consensus rounds.
- `core/artifacts`: creates run IDs, writes summaries, reviewer outputs, and synthesis input files.
- `core/synthesis`: formats compact status blocks and bounded synthesis input for the main agent.

Adapters:

- `server`: registers OpenCode commands/tools and calls core modules.
- `tui`: registers setup and run UI surfaces.

Each core module must have a clear dependency boundary. Core modules should not import TUI APIs.

## Commands And UX

### `/wingman:setup`

Interactive setup opens a native OpenCode picker over available authenticated models. It supports:

- Selecting reviewer models.
- Selecting all or none.
- Editing reviewer aliases.
- Setting exclusion policy.
- Setting default reviewers for non-interactive usage.
- Setting consensus `maxRounds`.
- Setting `maxParallelReviewers`.
- Toggling optional summary/raw logging.
- Choosing whether to write global config or project-local config.

If no authenticated OpenCode models are available, setup returns a clear error and writes nothing.

### `/wingman`

Interactive `/wingman` always opens a per-run reviewer picker before execution. The picker shows:

- Inferred target and mode.
- Config source and resolved snapshot summary.
- Eligible reviewers selected by default.
- Ineligible reviewers and reasons when reviewers are excluded or unavailable.
- All, none/cancel, and specific reviewer selection.
- Exclusion policy and current-main-model impact.

Selecting no reviewers cancels cleanly without launching a run.

### Non-Interactive Usage

Non-interactive server/tool calls should accept explicit reviewers or reviewer names. If no explicit reviewer selection is provided, they use the configured `defaultReviewers` fallback. They must not require TUI access.

## Configuration

Wingman uses a small config surface based on `pi-wingmen`:

```json
{
  "version": 1,
  "exclude": "same-provider",
  "defaultReviewers": "all-eligible",
  "maxRounds": 3,
  "maxParallelReviewers": 4,
  "logging": { "enabled": false, "raw": false },
  "reviewers": [
    { "name": "gemini", "provider": "google", "model": "gemini-3.1-pro-preview", "thinking": "high" }
  ]
}
```

Fields:

- `version`: fixed at `1`.
- `reviewers`: reviewer aliases with `name`, `provider`, `model`, and optional `thinking`.
- `exclude`: `same-provider` or `same-model`; the exact same provider/model as the main agent is always excluded.
- `defaultReviewers`: `all-eligible` or `ask`; applies mainly to non-interactive usage because interactive `/wingman` always shows the picker.
- `maxRounds`: consensus round cap, clamped to `1..10`.
- `maxParallelReviewers`: parallel reviewer cap, clamped to `1..16`.
- `logging.enabled`: enables optional `.wingman/logs/*.jsonl` audit logging.
- `logging.raw`: includes raw reviewer output in optional logs when enabled.

Config loading behavior:

- Reload global and project config from disk at every run boundary.
- Merge project config over global defaults.
- Validate before showing preflight or launching reviewers.
- Freeze the resolved snapshot for the active run.
- Mid-run config edits affect only later runs.
- `/wingman:setup` writes config; the next `/wingman` sees it without restarting OpenCode.

Invalid config must fail before reviewer launch with the exact path and validation issue.

## Reviewer Selection

Reviewer aliases must be unique and match `[a-z0-9._-]+`.

Eligibility rules:

- Configured reviewer model must exist in the current OpenCode model registry.
- Exact same provider/model as the main agent is always excluded.
- If `exclude` is `same-provider`, reviewers from the same provider as the main agent are excluded.
- If `exclude` is `same-model`, same-provider different-model reviewers are allowed.
- If no eligible reviewers remain, preflight must explain which rule removed them.

Selection rules:

- Interactive runs show all eligible reviewers selected by default.
- User can choose all, none/cancel, or specific reviewers.
- Non-interactive explicit reviewer names may match alias, provider/model key, or unambiguous hint.
- Ambiguous hints fail with a clear list of matches.

## Target And Mode Inference

Wingman should infer target and mode similarly to `pi-wingmen`, with confidence attached to the inference:

- Question consensus.
- Current plan/spec review.
- Working-tree review.
- Branch diff review.
- Commit review.
- File list review.
- Last-turn review.
- Freeform focus.

Modes:

- `audit`: default code/spec review mode.
- `adversarial`: skeptical review mode when requested.
- `consensus`: multi-round consensus mode for decision questions.
- `rescue`: advisory read-only rescue only; no write-capable rescue in V1.

Low-confidence target inference must be visible in preflight. V1 may let the user cancel and rerun with a clearer request instead of editing the request inline.

## Run Data Flow

Each `/wingman` run proceeds as follows:

1. Reload global and project config from disk.
2. Validate config and available OpenCode models.
3. Infer target and mode from the request/session/repo state.
4. Resolve eligible reviewers by applying aliases, exclusions, and current-main-model checks.
5. Show the run picker with all eligible reviewers selected by default for interactive runs.
6. Freeze the run snapshot: config, target, mode, selected reviewers, prompt/request, and execution settings.
7. Create run artifact directories before reviewer launch.
8. Launch selected reviewers in parallel read-only sessions, capped by `maxParallelReviewers`.
9. For consensus mode, allow up to `maxRounds`; otherwise run one round.
10. Persist reviewer outputs and per-reviewer metadata.
11. Collect reviewer successes, failures, cancellations, and summary data.
12. Return compact structured results to the main agent for final synthesis.

## Read-Only Reviewer Execution

Reviewer sessions must be read-only. They may inspect files, diffs, git state, and relevant context, but must not write files, edit files, commit, or run mutating shell commands.

The implementation must validate or enforce the read-only tool surface before reviewer prompts run. Reviewer prompts must also instruct reviewers to return findings only, not patches.

## Output And Artifacts

Every run gets a `runId`. Run artifacts are required even when optional audit logging is disabled.

Artifacts:

- `.wingman/runs/<runId>/summary.json`
- `.wingman/runs/<runId>/reviewers/<alias>.md`
- `.wingman/runs/<runId>/reviewers/<alias>.json`
- `.wingman/runs/<runId>/synthesis-input.md`

The compact visible result should include:

- Total ok/failed/cancelled reviewer counts.
- One status line per reviewer.
- Artifact paths.
- Bounded excerpts or short summaries.
- Instructions for the main agent to synthesize findings, state what to keep or dismiss, and propose concrete next actions.

Full reviewer output must be written to artifacts before returning compact chat output. This directly avoids the MCC failure mode where long reviewer output is truncated and no review files exist.

Optional `.wingman/logs/YYYY-MM-DD.jsonl` remains audit logging, not the primary retrieval mechanism for current run output.

## Error Handling

- Missing config in interactive mode opens `/wingman:setup`; missing config in non-interactive mode returns a clear error.
- Invalid JSON, schema errors, duplicate aliases, and invalid enum values identify the exact config file and field.
- Missing or unauthenticated models mark reviewers ineligible before the run picker.
- If exclusions remove all reviewers, preflight explains whether the current provider/model caused it.
- Selecting no reviewers cancels without error.
- One reviewer failure does not stop other reviewers.
- If all reviewers fail, the run returns failed status plus diagnostics and any artifacts.
- Long output is persisted fully and displayed only as a bounded excerpt.
- If artifact initialization fails before launch, abort the run.
- If artifact writing fails after reviewer output, surface a warning and include whatever was persisted.
- Cancelling a run stops pending reviewer work, preserves completed outputs, and writes a cancelled summary.

## Testing Requirements

Core unit tests:

- Config merge, reload, normalization, and validation.
- Duplicate alias and alias pattern validation.
- Reviewer eligibility, exclusion, hint matching, and ambiguous hint errors.
- Target inference confidence and mode mapping.
- Bounded output formatting.
- Artifact path and run ID generation.

Runtime tests with fake reviewer executors:

- Parallelism cap.
- Partial reviewer failures.
- Cancellation behavior.
- Consensus round cap.
- Artifact persistence for successful, failed, and cancelled reviewers.
- Regression for long reviewer output: compact chat result is bounded while full output is persisted.

Adapter tests:

- `/wingman:setup` writes valid config.
- `/wingman` reloads config each run within the same chat/session.
- Picker selection maps to selected reviewers.
- Invalid config blocks execution before reviewer launch.
- Non-interactive mode uses explicit reviewers or configured defaults.

## Success Criteria

- The plugin can be installed and used in any OpenCode project without MCC.
- Interactive `/wingman` feels like Pi Wingman: native model/reviewer picker, visible preflight, progress, and cancellation.
- Config changes are picked up on the next run without restarting OpenCode.
- Reviewers are always read-only.
- Long reviewer output is never lost to chat truncation because full output is persisted as artifacts.
- Failures are per-reviewer and actionable, not opaque command-level failures.
- The main agent receives compact structured results suitable for synthesis rather than raw dumps.
