# 0006: Run-Boundary Config Snapshots - reload before each Wingman run

## Decision

Wingman will reload global and project config from disk at every run boundary before showing the reviewer picker or launching reviewers.

Each run freezes a resolved snapshot containing merged config, selected reviewers, target, mode, request, and execution settings. Config changes during an active run do not affect that run and are picked up by the next invocation.

## Reason

Loading config only at OpenCode startup would make mid-chat setup changes surprising and require restarts. Watching config continuously would add complexity and nondeterminism to in-flight runs.

Reloading at run start gives predictable behavior while making `/wingman:setup` and manual config edits effective immediately for the next run.

## Consequences

- `/wingman` must validate freshly loaded config before preflight.
- `/wingman:setup` writes config but does not need to push live state into active runs.
- Preflight should show enough config-source/snapshot information to make the active settings clear.
- Tests must cover config reload between two runs in the same chat/session.
