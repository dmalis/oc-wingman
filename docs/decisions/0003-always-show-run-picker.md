# 0003: Always Show Run Picker - interactive reviews require reviewer confirmation

## Decision

Interactive `/wingman` runs will show a reviewer picker every time before starting reviewer execution.

The picker must support selecting all eligible reviewers, selecting none/cancel, and selecting specific reviewers.

## Reason

The desired UX is the Pi-style flow where the tool asks which model or models to use before running. This makes reviewer choice explicit and avoids hidden defaults surprising the user.

This was chosen over only showing the picker for ambiguous requests, which is faster but less transparent, and over purely config-driven defaults, which do not match the preferred interaction style.

## Consequences

- The TUI plugin must provide a native run preflight picker for `/wingman`.
- Non-interactive tool calls still need deterministic behavior, likely using explicit reviewers or configured defaults.
- The server tool result should report selected reviewers and require main-agent synthesis after completion.
- The UI should make ineligible reviewers visible or explain why they were excluded.
