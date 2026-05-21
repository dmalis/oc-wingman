# 0008: Merge Reviewers By Alias - project config extends global defaults

## Decision

Standalone Wingman will merge global and project reviewer lists by reviewer `name` alias.

When both scopes define the same alias, the project reviewer replaces the global reviewer for that alias. Project reviewers with new aliases are appended to the effective reviewer list. Scalar settings such as `exclude`, `defaultReviewers`, `maxRounds`, `maxParallelReviewers`, and `logging` are overridden by project config when present.

## Reason

This preserves the convenience of global reviewer defaults while letting a project override a specific alias or add project-specific reviewers without copying the entire global list.

This was chosen over project config replacing all global reviewers, which is simpler but forces repetitive setup, and over keeping separate global/project lists in the UI, which adds unnecessary V1 complexity.

## Consequences

- Config normalization must validate aliases after merging.
- Preflight should show effective reviewers and config sources clearly enough to explain overrides.
- Tests must cover replacing one global alias and appending one project alias.
