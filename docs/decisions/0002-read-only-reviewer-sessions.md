# 0002: Read-Only Reviewer Sessions - reviewers can inspect the repo safely

## Decision

Standalone OpenCode Wingman will run reviewer models in read-only OpenCode reviewer sessions for code, diff, file, branch, and ambiguous repo reviews.

Reviewers may inspect project files and repository state through read-only tools, but must not write, edit, commit, run mutating shell commands, or change project state.

## Reason

The desired UX is closer to `pi-wingmen`'s capable reviewer behavior than MCC's narrow prompt-only review. Allowing read-only inspection gives reviewers enough context to catch issues in real code without depending entirely on a preassembled context pack.

This was chosen over context-pack-only review, which is simpler but weaker for large or ambiguous repo audits, and over write-capable rescue modes, which are out of scope for advisory Wingman behavior.

## Consequences

- Reviewer execution must create isolated OpenCode sessions with write/edit/mutation tools disabled.
- Reviewer prompts must explicitly require read-only behavior and no patches.
- The plugin must validate that tool restrictions are applied before reviewer prompts run.
- Small plan/question reviews may still include prepared context, but the reviewer session remains read-only-capable.
