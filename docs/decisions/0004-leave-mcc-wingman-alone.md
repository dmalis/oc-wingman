# 0004: Leave MCC Wingman Alone - standalone Wingman is separate V1 scope

## Decision

V1 standalone OpenCode Wingman will not modify `projects/mcc` or replace MCC's embedded Wingman implementation.

The new plugin will be built as an independent OpenCode plugin that can be used from any project.

## Reason

The goal is to bring the working `pi-wingmen` functionality into OpenCode as a reusable standalone plugin. Changing MCC at the same time would mix two scopes: productizing standalone Wingman and migrating MCC's workflow-specific Wingman integration.

Leaving MCC alone keeps V1 focused and avoids regressions in MCC's broader workflow state, Obra integration, and work tracking.

## Consequences

- The standalone plugin must not depend on `.mcc` state or MCC commands.
- MCC code remains a reference for OpenCode plugin APIs and existing Wingman issues, not a target for V1 edits.
- A future follow-up can add an MCC bridge or migration after standalone Wingman is working.
