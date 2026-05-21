# 0005: Hybrid Server/TUI Plugin - separate orchestration from interaction

## Decision

Standalone OpenCode Wingman will be implemented as one package with separate OpenCode entrypoints:

- Server entrypoint for config loading, reviewer selection, read-only reviewer execution, artifact writing, and tool/command results.
- TUI entrypoint for setup picker, per-run reviewer picker, preflight, progress, and cancellation UX.

Core behavior should live outside both adapters so it can be tested without OpenCode UI/runtime dependencies.

## Reason

OpenCode plugin modules are target-exclusive, so a single module should not try to export both server and TUI behavior. A server-only plugin would be simpler but would lose the Pi-style picker and progress UX. A TUI-heavy plugin would make non-interactive usage and reviewer orchestration brittle.

The hybrid package keeps the UX native while preserving a deterministic server-side execution path.

## Consequences

- Package exports must include separate server and TUI entrypoints.
- Shared modules must avoid depending on TUI-specific APIs.
- The spec and implementation plan must include adapter tests or fakes for both entrypoints.
