import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WINGMAN_CONFIG,
  WINGMAN_DIR,
  defaultGlobalConfigPath,
  defaultWingmanConfig,
  loadEffectiveConfig,
  mergeConfigs,
  normalizeConfig,
  projectConfigPath,
  writeConfig,
} from "../src/core/config.ts";

async function tempProject() {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-config-"));
  await mkdir(join(root, ".git"));
  return root;
}

test("normalizeConfig fills defaults and clamps numeric settings", () => {
  const config = normalizeConfig({ maxRounds: 99, maxParallelReviewers: 0 }, "memory");
  assert.equal(config.version, 1);
  assert.equal(config.exclude, "same-provider");
  assert.equal(config.maxParallelReviewers, 1);
  assert.equal("maxRounds" in config, false);
  assert.equal("logging" in config, false);
  assert.deepEqual(config.reviewers, []);
});

test("mergeConfigs replaces reviewer aliases and appends project aliases", () => {
  const globalConfig = normalizeConfig({
    reviewers: [
      { name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" },
      { name: "claude", provider: "anthropic", model: "claude-sonnet-4-6" }
    ]
  }, "global");
  const projectConfig = normalizeConfig({
    exclude: "same-model",
    reviewers: [
      { name: "gemini", provider: "google", model: "gemini-3.1-flash" },
      { name: "grok", provider: "xai", model: "grok-4" }
    ]
  }, "project");

  const merged = mergeConfigs(globalConfig, projectConfig, new Set(["exclude", "reviewers"]));
  assert.equal(merged.exclude, "same-model");
  assert.deepEqual(merged.reviewers.map((reviewer) => `${reviewer.name}:${reviewer.provider}/${reviewer.model}`), [
    "gemini:google/gemini-3.1-flash",
    "claude:anthropic/claude-sonnet-4-6",
    "grok:xai/grok-4"
  ]);
});

test("loadEffectiveConfig reloads changed project config on each call", async () => {
  const root = await tempProject();
  const projectPath = projectConfigPath(root);
  await writeConfig(projectPath, normalizeConfig({ maxParallelReviewers: 2 }, projectPath));
  assert.equal((await loadEffectiveConfig(root, { home: root })).config.maxParallelReviewers, 2);

  await writeConfig(projectPath, normalizeConfig({ maxParallelReviewers: 4 }, projectPath));
  assert.equal((await loadEffectiveConfig(root, { home: root })).config.maxParallelReviewers, 4);
});

test("loadEffectiveConfig preserves global scalars when project omits them", async () => {
  const root = await tempProject();
  const globalPath = defaultGlobalConfigPath(root);
  await writeConfig(globalPath, normalizeConfig({ maxParallelReviewers: 7, reviewers: [{ name: "global", provider: "google", model: "gemini" }] }, globalPath));
  await mkdir(join(root, WINGMAN_DIR), { recursive: true });
  await writeFile(projectConfigPath(root), `${JSON.stringify({ reviewers: [{ name: "project", provider: "anthropic", model: "claude" }] }, null, 2)}\n`, "utf8");
  const loaded = await loadEffectiveConfig(root, { home: root });
  assert.equal(loaded.config.maxParallelReviewers, 7);
  assert.deepEqual(loaded.config.reviewers.map((reviewer) => reviewer.name), ["global", "project"]);
});

test("writeConfig writes formatted JSON", async () => {
  const root = await tempProject();
  const path = join(root, WINGMAN_DIR, WINGMAN_CONFIG);
  await writeConfig(path, defaultWingmanConfig);
  const text = await readFile(path, "utf8");
  assert.match(text, /"version": 1/);
  assert.equal(text.endsWith("\n"), true);
});

test("defaultGlobalConfigPath uses the supplied home directory", () => {
  assert.equal(defaultGlobalConfigPath("/home/user"), "/home/user/.config/oc-wingman/config.json");
});
