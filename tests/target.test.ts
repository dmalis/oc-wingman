import test from "node:test";
import assert from "node:assert/strict";
import { inferWingmanContext } from "../src/core/target.ts";

test("infers question targets as second opinions", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Which API shape should we choose for config merge" });
  assert.equal(context.mode, "second-opinion");
  assert.equal(context.target.type, "question-consensus");
  assert.equal(context.target.confidence, "high");
});

test("infers current plan review", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Review the plan in docs/superpowers/plans/build.md" });
  assert.equal(context.mode, "second-opinion");
  assert.equal(context.target.type, "current-plan");
});

test("infers files target", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Review src/core/config.ts and tests/config.test.ts" });
  assert.equal(context.target.type, "files");
  assert.deepEqual(context.target.type === "files" ? context.target.paths : [], ["src/core/config.ts", "tests/config.test.ts"]);
});

test("skeptical language remains a second opinion", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Be skeptical and audit this branch" });
  assert.equal(context.mode, "second-opinion");
});
