# 0007: Persist Run Artifacts - reviewer output must survive chat truncation

## Decision

Standalone Wingman will persist per-run artifacts for every reviewer run independently of optional audit logging.

Each run gets a `runId` and writes artifacts such as:

- `.wingman/runs/<runId>/summary.json`
- `.wingman/runs/<runId>/reviewers/<alias>.md`
- `.wingman/runs/<runId>/reviewers/<alias>.json`
- `.wingman/runs/<runId>/synthesis-input.md`

The visible tool/chat result should stay compact and include status, reviewer outcomes, artifact paths, bounded excerpts, and synthesis instructions.

## Reason

Existing MCC Wingman often returns reviewer output that is truncated in chat, forcing a rerun to recover findings. In observed output, only the first high-priority finding was visible and no review files were recorded.

Persisted artifacts make reviewer output reliable even when chat output collapses, truncates, or is summarized. Optional `.wingman/logs/*.jsonl` is useful for audit history, but it is not sufficient as the primary retrieval path for current run output.

## Consequences

- Artifact writing is part of the run contract, not optional debug logging.
- Long reviewer output must be written in full before returning compact chat output.
- Partial failures and cancellations still write summaries for completed reviewer work.
- Tests must include a long-output regression where chat output is bounded and full reviewer output is persisted.
