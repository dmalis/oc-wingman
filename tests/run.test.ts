import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runWingmanReview } from "../src/core/run.ts";
import type { ResolvedReviewer } from "../src/core/types.ts";

function reviewer(name: string): ResolvedReviewer {
  return {
    name,
    provider: name,
    model: "model",
    key: `${name}/model`,
    label: `${name} (${name}/model)`,
    sameProvider: false,
    sameModel: false,
    source: "merged",
    modelRef: { providerID: name, modelID: "model", name }
  };
}

test("runtime honors maxParallelReviewers", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "oc-wingman-run-"));
  let active = 0;
  let maxActive = 0;
  const result = await runWingmanReview({
    cwd,
    request: "review",
    mode: "audit",
    target: { type: "freeform", focus: "review", confidence: "low" },
    targetLabel: "Freeform",
    reviewers: [reviewer("a"), reviewer("b"), reviewer("c")],
    maxParallelReviewers: 2,
    maxRounds: 1,
    executor: async ({ reviewer }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return { output: `ok ${reviewer.name}` };
    }
  });
  assert.equal(maxActive, 2);
  assert.equal(result.results.filter((item) => item.status === "ok").length, 3);
});

test("runtime records partial reviewer failures", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "oc-wingman-run-"));
  const result = await runWingmanReview({
    cwd,
    request: "review",
    mode: "audit",
    target: { type: "freeform", focus: "review", confidence: "low" },
    targetLabel: "Freeform",
    reviewers: [reviewer("ok"), reviewer("bad")],
    maxParallelReviewers: 2,
    maxRounds: 1,
    executor: async ({ reviewer }) => {
      if (reviewer.name === "bad") throw new Error("model failed");
      return { output: "looks fine" };
    }
  });
  assert.deepEqual(result.results.map((item) => item.status).sort(), ["failed", "ok"]);
  assert.match(result.text, /1 ok, 1 failed/);
});

test("consensus mode runs until maxRounds when consensus is not reached", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "oc-wingman-run-"));
  const rounds: number[] = [];
  const result = await runWingmanReview({
    cwd,
    request: "choose an API",
    mode: "consensus",
    target: { type: "question-consensus", question: "choose an API", confidence: "high" },
    targetLabel: "Question consensus",
    reviewers: [reviewer("a")],
    maxParallelReviewers: 1,
    maxRounds: 3,
    executor: async ({ round }) => {
      rounds.push(round);
      return { output: `round ${round}: no agreement yet` };
    }
  });
  assert.deepEqual(rounds, [1, 2, 3]);
  assert.equal(result.rounds, 3);
});
