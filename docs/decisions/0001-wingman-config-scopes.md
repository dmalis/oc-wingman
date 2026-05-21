# 0001: Wingman Config Scopes - support global defaults plus project overrides

## Decision

Standalone OpenCode Wingman will support both global and project-local reviewer configuration.

Global configuration provides default reviewers and behavior across all projects. Project-local configuration can override or extend those defaults for a specific repo.

## Reason

The plugin is intended to be reusable across many projects, so configuring reviewers once globally avoids repeated setup. Some projects still need different reviewer aliases, exclusion policy, logging, or default reviewer behavior, so project-local overrides remain useful.

This was chosen over global-only configuration, which is convenient but too rigid, and project-only configuration, which matches `pi-wingmen` but creates repeated setup work for a personal OpenCode plugin.

## Consequences

- Define a deterministic merge model for global and project `.wingman` config.
- Provide TUI setup flows that can edit either global defaults or project overrides.
- Show the effective merged reviewer set before each run.
- Document where global and project configs live and which fields override versus merge.
