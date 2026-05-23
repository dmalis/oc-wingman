import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSetupPicker } from "../src/tui/flows.ts";

test("setup picker preserves project config and model IDs containing slashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-tui-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".wingman"));
  await writeFile(join(root, ".wingman", "config.json"), `${JSON.stringify({
    version: 1,
    exclude: "same-model",
    defaultReviewers: "ask",
    maxParallelReviewers: 2,
    reviewers: [{ name: "existing", provider: "openai", model: "gpt-5" }]
  }, null, 2)}\n`, "utf8");
  const api = fakeSetupApi(root, [{ providerID: "openrouter", id: "z-ai/glm-4.5-air:free", name: "GLM Air" }]);

  await runSetupPicker(api);

  const saved = JSON.parse(await readFile(join(root, ".wingman", "config.json"), "utf8"));
  assert.equal(saved.exclude, "same-model");
  assert.equal(saved.defaultReviewers, "ask");
  assert.equal(saved.maxParallelReviewers, 2);
  assert.deepEqual(saved.reviewers, [
    { name: "existing", provider: "openai", model: "gpt-5" },
    { name: "openrouter", provider: "openrouter", model: "z-ai/glm-4.5-air:free" }
  ]);
});

function fakeSetupApi(root: string, models: unknown[]) {
  return {
    state: { path: { directory: root }, config: { model: "google/gemini-3.1-pro-preview" } },
    client: { v2: { model: { list: async () => ({ data: models }) } } },
    ui: {
      dialog: {
        replace: (render: () => unknown) => render(),
        clear: () => {}
      },
      DialogSelect: ({ title, options, onSelect }: any) => {
        onSelect(title.includes("scope") ? options.find((option: any) => option.value === "project") : options[0]);
        return {};
      },
      toast: () => {}
    }
  };
}
