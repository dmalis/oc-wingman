# Standalone OpenCode Wingman Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `oc-wingman` as a standalone OpenCode plugin with read-only reviewer sessions, native picker flows, run-boundary config reload, and durable reviewer artifacts.

**Architecture:** Implement focused TypeScript core modules first, then add thin OpenCode server and TUI adapters. Core modules own config, reviewer selection, target inference, artifacts, synthesis formatting, and runtime orchestration; adapters translate OpenCode APIs into those core interfaces.

**Tech Stack:** TypeScript ESM, `@opencode-ai/plugin`, OpenCode SDK client types, Node `fs/promises`, Node `node:test` through `tsx --test`, `tsc --noEmit`.

---

## Scope Check

The approved spec is one integrated V1 plugin rather than independent subsystems. The tasks below produce working software in layers: package scaffold, pure core, runtime, server adapter, TUI adapter, docs, and verification.

## File Structure

- Create `package.json`: package metadata, OpenCode plugin exports, scripts, dependencies.
- Create `tsconfig.json`: strict ESM TypeScript config.
- Create `.gitignore`: ignores dependencies, build output, and local Wingman run artifacts.
- Create `README.md`: install, config, command, artifact, and restart notes.
- Create `src/core/types.ts`: domain types shared by all modules.
- Create `src/core/errors.ts`: typed errors with path-aware messages.
- Create `src/core/config.ts`: config paths, normalization, merge-by-alias, read/write.
- Create `src/core/reviewers.ts`: model keys, eligibility, exclusion, hint matching, selection.
- Create `src/core/target.ts`: target and mode inference.
- Create `src/core/artifacts.ts`: run IDs, artifact paths, JSON/Markdown writes, audit logs.
- Create `src/core/synthesis.ts`: compact output formatting and synthesis prompt text.
- Create `src/core/run.ts`: parallel reviewer orchestration, cancellation, consensus rounds.
- Create `src/opencode/executor.ts`: OpenCode client adapter for read-only reviewer sessions.
- Create `src/server.ts`: OpenCode server plugin entrypoint and `wingman_review` tool.
- Create `src/tui/options.ts`: pure option builders for setup and run picker flows.
- Create `src/tui/flows.ts`: TUI dialog flows and prompt submission helpers.
- Create `src/tui/index.ts`: OpenCode TUI plugin entrypoint.
- Create `tests/smoke.test.ts`: verifies test runner and exports.
- Create `tests/types.test.ts`: error and type helper coverage.
- Create `tests/config.test.ts`: config normalization, merge, reload, and validation coverage.
- Create `tests/reviewers.test.ts`: reviewer eligibility and selection coverage.
- Create `tests/target.test.ts`: target and mode inference coverage.
- Create `tests/artifacts-synthesis.test.ts`: artifact persistence and compact output coverage.
- Create `tests/run.test.ts`: runtime orchestration coverage with fake reviewers.
- Create `tests/opencode-executor.test.ts`: read-only OpenCode adapter coverage with fake client.
- Create `tests/server.test.ts`: server tool and command registration coverage.
- Create `tests/tui-options.test.ts`: TUI option and prompt formatting coverage.

## Task 1: Scaffold The TypeScript Package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write the smoke test**

```ts
import test from "node:test";
import assert from "node:assert/strict";

test("test runner is active", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Add package metadata and scripts**

```json
{
  "name": "oc-wingman",
  "version": "0.1.0",
  "description": "Standalone OpenCode Wingman reviewer plugin",
  "type": "module",
  "main": "./src/server.ts",
  "types": "./src/server.ts",
  "exports": {
    ".": {
      "types": "./src/server.ts",
      "default": "./src/server.ts"
    },
    "./server": {
      "types": "./src/server.ts",
      "default": "./src/server.ts"
    },
    "./tui": {
      "types": "./src/tui/index.ts",
      "default": "./src/tui/index.ts"
    }
  },
  "files": [
    "src",
    "README.md"
  ],
  "keywords": [
    "opencode-plugin",
    "wingman",
    "review",
    "second-opinion"
  ],
  "license": "MIT",
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "*",
    "@types/node": "^25.8.0",
    "tsx": "^4.20.6",
    "typescript": "^5.9.3"
  },
  "scripts": {
    "test": "tsx --test tests/*.test.ts",
    "typecheck": "tsc --noEmit",
    "verify": "npm run typecheck && npm test"
  }
}
```

- [ ] **Step 3: Add TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Add ignored files**

```gitignore
node_modules/
dist/
coverage/
.wingman/runs/
.wingman/logs/
*.tsbuildinfo
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`

Expected: npm creates `package-lock.json` and installs dependencies without errors.

- [ ] **Step 6: Verify scaffold**

Run: `npm run verify`

Expected: `tsc --noEmit` exits 0 and `tsx --test tests/*.test.ts` reports the smoke test passing.

- [ ] **Step 7: Commit scaffold**

```bash
git add package.json package-lock.json tsconfig.json .gitignore tests/smoke.test.ts
git commit -m "chore: scaffold Wingman plugin package"
```

## Task 2: Add Core Domain Types And Errors

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/errors.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the failing error tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { WingmanError, configError, errorMessage } from "../src/core/errors.ts";

test("configError includes code, path, and field", () => {
  const error = configError("Invalid enum", "/tmp/config.json", "exclude");
  assert.equal(error.code, "config.invalid");
  assert.equal(error.path, "/tmp/config.json");
  assert.equal(error.field, "exclude");
  assert.equal(error.message, "Invalid enum at /tmp/config.json field exclude");
});

test("errorMessage preserves WingmanError messages", () => {
  const error = new WingmanError("reviewer.none", "No reviewers remain");
  assert.equal(errorMessage(error), "No reviewers remain");
  assert.equal(errorMessage("plain"), "plain");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/types.test.ts`

Expected: FAIL because `src/core/errors.ts` does not exist.

- [ ] **Step 3: Add shared domain types**

```ts
export type ExclusionPolicy = "same-provider" | "same-model";
export type DefaultReviewers = "all-eligible" | "ask";
export type WingmanMode = "audit" | "adversarial" | "consensus" | "rescue";
export type ReviewerStatus = "pending" | "running" | "ok" | "failed" | "cancelled";
export type TargetConfidence = "high" | "medium" | "low";

export type WingmanReviewerConfig = {
  name: string;
  provider: string;
  model: string;
  thinking?: string;
};

export type WingmanLoggingConfig = {
  enabled: boolean;
  raw: boolean;
};

export type WingmanConfig = {
  version: 1;
  exclude: ExclusionPolicy;
  defaultReviewers: DefaultReviewers;
  maxRounds: number;
  maxParallelReviewers: number;
  logging: WingmanLoggingConfig;
  reviewers: WingmanReviewerConfig[];
};

export type ConfigSource = "global" | "project" | "merged";

export type ModelRef = {
  providerID: string;
  modelID: string;
  name: string;
  reasoning?: boolean;
};

export type CurrentModel = {
  providerID: string;
  modelID: string;
};

export type ResolvedReviewer = WingmanReviewerConfig & {
  key: string;
  label: string;
  sameProvider: boolean;
  sameModel: boolean;
  modelRef: ModelRef;
  source: ConfigSource;
};

export type WingmanTarget =
  | { type: "question-consensus"; question: string; confidence: TargetConfidence }
  | { type: "current-plan"; text: string; confidence: TargetConfidence }
  | { type: "working-tree"; confidence: TargetConfidence }
  | { type: "branch-diff"; base: string; confidence: TargetConfidence }
  | { type: "commit"; sha: string; confidence: TargetConfidence }
  | { type: "files"; paths: string[]; confidence: TargetConfidence }
  | { type: "last-turn"; text: string; confidence: TargetConfidence }
  | { type: "freeform"; focus: string; confidence: TargetConfidence };

export type WingmanContextPack = {
  target: WingmanTarget;
  label: string;
  focus: string;
  mode: WingmanMode;
  cwd: string;
  content: string;
  reason: string;
};

export type ReviewerResult = {
  reviewer: ResolvedReviewer;
  status: Exclude<ReviewerStatus, "pending" | "running">;
  round: number;
  prompt: string;
  output?: string;
  summary?: string;
  error?: string;
  artifactMarkdownPath?: string;
  artifactJsonPath?: string;
};

export type WingmanRunResult = {
  runId: string;
  request: string;
  mode: WingmanMode;
  target: WingmanTarget;
  targetLabel: string;
  rounds: number;
  cancelled: boolean;
  results: ReviewerResult[];
  artifactDir: string;
  summaryPath: string;
  synthesisInputPath: string;
  text: string;
};
```

- [ ] **Step 4: Add typed errors**

```ts
export type WingmanErrorCode =
  | "config.invalid"
  | "config.missing"
  | "reviewer.none"
  | "reviewer.ambiguous"
  | "reviewer.unavailable"
  | "artifact.failed"
  | "opencode.failed";

export class WingmanError extends Error {
  readonly code: WingmanErrorCode;
  readonly path?: string;
  readonly field?: string;

  constructor(code: WingmanErrorCode, message: string, input: { path?: string; field?: string } = {}) {
    super(message);
    this.name = "WingmanError";
    this.code = code;
    if (input.path !== undefined) this.path = input.path;
    if (input.field !== undefined) this.field = input.field;
  }
}

export function configError(message: string, path: string, field?: string): WingmanError {
  return new WingmanError("config.invalid", `${message} at ${path}${field ? ` field ${field}` : ""}`, field === undefined ? { path } : { path, field });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx tsx --test tests/types.test.ts`

Expected: PASS for both tests.

- [ ] **Step 6: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 7: Commit domain types**

```bash
git add src/core/types.ts src/core/errors.ts tests/types.test.ts
git commit -m "feat: add Wingman core domain types"
```

## Task 3: Implement Config Paths, Normalization, Merge, And Reload

**Files:**
- Create: `src/core/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write failing config tests**

```ts
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
  assert.equal(config.maxRounds, 10);
  assert.equal(config.maxParallelReviewers, 1);
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
  await writeConfig(projectPath, normalizeConfig({ maxRounds: 2 }, projectPath));
  assert.equal((await loadEffectiveConfig(root, { home: root })).config.maxRounds, 2);

  await writeConfig(projectPath, normalizeConfig({ maxRounds: 4 }, projectPath));
  assert.equal((await loadEffectiveConfig(root, { home: root })).config.maxRounds, 4);
});

test("loadEffectiveConfig preserves global scalars when project omits them", async () => {
  const root = await tempProject();
  const globalPath = defaultGlobalConfigPath(root);
  await writeConfig(globalPath, normalizeConfig({ maxRounds: 7, reviewers: [{ name: "global", provider: "google", model: "gemini" }] }, globalPath));
  await mkdir(join(root, WINGMAN_DIR), { recursive: true });
  await writeFile(projectConfigPath(root), `${JSON.stringify({ reviewers: [{ name: "project", provider: "anthropic", model: "claude" }] }, null, 2)}\n`, "utf8");
  const loaded = await loadEffectiveConfig(root, { home: root });
  assert.equal(loaded.config.maxRounds, 7);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/config.test.ts`

Expected: FAIL because `src/core/config.ts` does not exist.

- [ ] **Step 3: Implement config module**

```ts
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { configError } from "./errors.ts";
import type { DefaultReviewers, ExclusionPolicy, WingmanConfig, WingmanReviewerConfig } from "./types.ts";

export const WINGMAN_DIR = ".wingman";
export const WINGMAN_CONFIG = "config.json";
export const GLOBAL_CONFIG_DIR = "oc-wingman";

export const defaultWingmanConfig: WingmanConfig = {
  version: 1,
  exclude: "same-provider",
  defaultReviewers: "all-eligible",
  maxRounds: 3,
  maxParallelReviewers: 4,
  logging: { enabled: false, raw: false },
  reviewers: [],
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

const aliasPattern = /^[a-z0-9._-]+$/;

function normalizeReviewer(value: unknown, index: number, source: string): WingmanReviewerConfig | undefined {
  const item = asObject(value);
  if (!item) return undefined;
  const provider = stringValue(item.provider);
  const model = stringValue(item.model);
  const name = stringValue(item.name);
  if (!provider || !model) return undefined;
  if (!name) throw configError(`Wingman reviewer at index ${index} is missing required name alias`, source, `reviewers.${index}.name`);
  if (!aliasPattern.test(name)) throw configError(`Wingman reviewer alias ${name} must match [a-z0-9._-]+`, source, `reviewers.${index}.name`);
  const thinking = stringValue(item.thinking);
  return thinking ? { name, provider, model, thinking } : { name, provider, model };
}

function validateUniqueAliases(reviewers: WingmanReviewerConfig[], source: string): void {
  const seen = new Set<string>();
  for (const reviewer of reviewers) {
    if (seen.has(reviewer.name)) throw configError(`Duplicate Wingman reviewer alias ${reviewer.name}`, source, "reviewers");
    seen.add(reviewer.name);
  }
}

export function normalizeConfig(raw: unknown, source: string): WingmanConfig {
  const obj = asObject(raw) ?? {};
  const logging = asObject(obj.logging) ?? {};
  const reviewers = Array.isArray(obj.reviewers)
    ? obj.reviewers.map((item, index) => normalizeReviewer(item, index, source)).filter((item): item is WingmanReviewerConfig => Boolean(item))
    : [];
  validateUniqueAliases(reviewers, source);
  const exclude: ExclusionPolicy = obj.exclude === "same-model" ? "same-model" : "same-provider";
  const defaultReviewers: DefaultReviewers = obj.defaultReviewers === "ask" ? "ask" : "all-eligible";
  return {
    version: 1,
    exclude,
    defaultReviewers,
    maxRounds: numberValue(obj.maxRounds, defaultWingmanConfig.maxRounds, 1, 10),
    maxParallelReviewers: numberValue(obj.maxParallelReviewers, defaultWingmanConfig.maxParallelReviewers, 1, 16),
    logging: { enabled: Boolean(logging.enabled), raw: Boolean(logging.raw) },
    reviewers,
  };
}

type ConfigField = keyof WingmanConfig;

function configFields(raw: unknown): Set<ConfigField> {
  const obj = asObject(raw) ?? {};
  return new Set(Object.keys(obj).filter((key): key is ConfigField => ["version", "exclude", "defaultReviewers", "maxRounds", "maxParallelReviewers", "logging", "reviewers"].includes(key)));
}

export function mergeConfigs(globalConfig: WingmanConfig, projectConfig: WingmanConfig, projectFields: Set<ConfigField> = new Set(["exclude", "defaultReviewers", "maxRounds", "maxParallelReviewers", "logging", "reviewers"] as ConfigField[])): WingmanConfig {
  const mergedReviewers = new Map<string, WingmanReviewerConfig>();
  for (const reviewer of globalConfig.reviewers) mergedReviewers.set(reviewer.name, reviewer);
  if (projectFields.has("reviewers")) for (const reviewer of projectConfig.reviewers) mergedReviewers.set(reviewer.name, reviewer);
  return {
    version: 1,
    exclude: projectFields.has("exclude") ? projectConfig.exclude : globalConfig.exclude,
    defaultReviewers: projectFields.has("defaultReviewers") ? projectConfig.defaultReviewers : globalConfig.defaultReviewers,
    maxRounds: projectFields.has("maxRounds") ? projectConfig.maxRounds : globalConfig.maxRounds,
    maxParallelReviewers: projectFields.has("maxParallelReviewers") ? projectConfig.maxParallelReviewers : globalConfig.maxParallelReviewers,
    logging: projectFields.has("logging") ? { ...globalConfig.logging, ...projectConfig.logging } : { ...globalConfig.logging },
    reviewers: Array.from(mergedReviewers.values()),
  };
}

export function projectRoot(cwd: string): string {
  let current = resolve(cwd);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}

export function projectConfigPath(cwd: string): string {
  return join(projectRoot(cwd), WINGMAN_DIR, WINGMAN_CONFIG);
}

export function defaultGlobalConfigPath(home = homedir()): string {
  return join(home, ".config", GLOBAL_CONFIG_DIR, WINGMAN_CONFIG);
}

async function readConfigFile(path: string): Promise<{ config: WingmanConfig; fields: Set<ConfigField> } | undefined> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    return { config: normalizeConfig(raw, path), fields: configFields(raw) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) throw configError(error.message, path);
    throw error;
  }
}

export async function loadEffectiveConfig(cwd: string, options: { home?: string; globalPath?: string; projectPath?: string } = {}) {
  const globalPath = options.globalPath ?? defaultGlobalConfigPath(options.home);
  const projectPath = options.projectPath ?? projectConfigPath(cwd);
  const loadedGlobal = await readConfigFile(globalPath);
  const loadedProject = await readConfigFile(projectPath);
  const globalConfig = loadedGlobal?.config ?? defaultWingmanConfig;
  const config = loadedProject
    ? mergeConfigs(globalConfig, loadedProject.config, loadedProject.fields)
    : { ...globalConfig, logging: { ...globalConfig.logging }, reviewers: [...globalConfig.reviewers] };
  return { config, globalPath, projectPath, sources: { global: Boolean(loadedGlobal), project: Boolean(loadedProject) } };
}

export async function writeConfig(path: string, config: WingmanConfig): Promise<void> {
  const normalized = normalizeConfig(config, path);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(temp, path);
}
```

- [ ] **Step 4: Verify config tests pass**

Run: `npx tsx --test tests/config.test.ts`

Expected: PASS for all config tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit config module**

```bash
git add src/core/config.ts tests/config.test.ts
git commit -m "feat: add Wingman config loading"
```

## Task 4: Implement Reviewer Resolution And Selection

**Files:**
- Create: `src/core/reviewers.ts`
- Create: `tests/reviewers.test.ts`

- [ ] **Step 1: Write failing reviewer tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../src/core/config.ts";
import { resolveConfiguredReviewers, reviewerMatchesHint, selectReviewers } from "../src/core/reviewers.ts";
import type { CurrentModel, ModelRef } from "../src/core/types.ts";

const models: ModelRef[] = [
  { providerID: "openai", modelID: "gpt-5.5", name: "GPT 5.5" },
  { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro" },
  { providerID: "google", modelID: "gemini-3.1-flash", name: "Gemini 3.1 Flash" },
  { providerID: "anthropic", modelID: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" }
];

function config(exclude: "same-provider" | "same-model") {
  return normalizeConfig({
    exclude,
    reviewers: [
      { name: "main", provider: "openai", model: "gpt-5.5" },
      { name: "gemini", provider: "google", model: "gemini-3.1-pro-preview" },
      { name: "flash", provider: "google", model: "gemini-3.1-flash" },
      { name: "claude", provider: "anthropic", model: "claude-sonnet-4-6" }
    ]
  }, "memory");
}

test("same-provider policy excludes current provider and exact model", () => {
  const current: CurrentModel = { providerID: "google", modelID: "gemini-3.1-pro-preview" };
  const reviewers = resolveConfiguredReviewers(config("same-provider"), models, current);
  assert.deepEqual(reviewers.map((reviewer) => reviewer.name), ["main", "claude"]);
});

test("same-model policy allows same provider but never exact same model", () => {
  const current: CurrentModel = { providerID: "google", modelID: "gemini-3.1-pro-preview" };
  const reviewers = resolveConfiguredReviewers(config("same-model"), models, current);
  assert.deepEqual(reviewers.map((reviewer) => reviewer.name), ["main", "flash", "claude"]);
});

test("selectReviewers handles aliases and ambiguous hints", () => {
  const reviewers = resolveConfiguredReviewers(config("same-model"), models, { providerID: "openai", modelID: "gpt-5.5" });
  assert.deepEqual(selectReviewers({ eligible: reviewers, names: ["claude"] }).map((reviewer) => reviewer.name), ["claude"]);
  assert.equal(reviewerMatchesHint(reviewers[0], "gemini"), true);
  assert.throws(() => selectReviewers({ eligible: reviewers, names: ["gemini"] }), /Multiple eligible Wingman reviewers match/);
});

test("missing configured model reports unavailable reviewer", () => {
  const bad = normalizeConfig({ reviewers: [{ name: "missing", provider: "nope", model: "none" }] }, "memory");
  assert.throws(() => resolveConfiguredReviewers(bad, models, undefined), /Configured Wingman reviewer nope\/none is not available/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/reviewers.test.ts`

Expected: FAIL because `src/core/reviewers.ts` does not exist.

- [ ] **Step 3: Implement reviewer module**

```ts
import { WingmanError } from "./errors.ts";
import type { CurrentModel, ModelRef, ResolvedReviewer, WingmanConfig, WingmanReviewerConfig } from "./types.ts";

export function modelKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function reviewerKey(reviewer: Pick<WingmanReviewerConfig, "provider" | "model">): string {
  return modelKey(reviewer.provider, reviewer.model);
}

function sameModel(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined): boolean {
  return Boolean(current && reviewer.provider === current.providerID && reviewer.model === current.modelID);
}

function sameProvider(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined): boolean {
  return Boolean(current && reviewer.provider === current.providerID);
}

function isExcluded(reviewer: WingmanReviewerConfig, current: CurrentModel | undefined, policy: WingmanConfig["exclude"]): boolean {
  if (!current) return false;
  if (sameModel(reviewer, current)) return true;
  if (policy === "same-provider") return sameProvider(reviewer, current);
  return false;
}

export function resolveConfiguredReviewers(config: WingmanConfig, models: ModelRef[], current: CurrentModel | undefined): ResolvedReviewer[] {
  if (config.reviewers.length === 0) throw new WingmanError("reviewer.none", "Wingman reviewers are not configured. Run /wingman:setup first.");
  const modelMap = new Map(models.map((model) => [modelKey(model.providerID, model.modelID), model]));
  const validated = config.reviewers.map((reviewer) => {
    const key = reviewerKey(reviewer);
    const modelRef = modelMap.get(key);
    if (!modelRef) throw new WingmanError("reviewer.unavailable", `Configured Wingman reviewer ${key} is not available to OpenCode. Run /wingman:setup to refresh config.`);
    return {
      ...reviewer,
      key,
      label: `${reviewer.name} (${key})`,
      sameProvider: sameProvider(reviewer, current),
      sameModel: sameModel(reviewer, current),
      modelRef,
      source: "merged" as const,
    };
  });
  const selected = validated.filter((reviewer) => !isExcluded(reviewer, current, config.exclude));
  if (selected.length === 0) {
    const currentLabel = current ? modelKey(current.providerID, current.modelID) : "the current model";
    throw new WingmanError("reviewer.none", `No eligible Wingman reviewers remain after excluding ${config.exclude === "same-provider" ? "current provider" : "current model"} (${currentLabel}).`);
  }
  return selected;
}

export function reviewerMatchesHint(reviewer: Pick<WingmanReviewerConfig, "name" | "provider" | "model">, hint: string): boolean {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return false;
  const haystack = `${reviewer.name} ${reviewer.provider} ${reviewer.model} ${reviewer.provider}/${reviewer.model}`.toLowerCase();
  return haystack.includes(normalized);
}

export function selectReviewers(input: { eligible: ResolvedReviewer[]; hint?: string; names?: string[] }): ResolvedReviewer[] {
  const names = input.names?.map((name) => name.trim()).filter(Boolean) ?? [];
  if (names.length > 0) return dedupeReviewers(names.flatMap((name) => selectOne(input.eligible, name)));
  const hint = input.hint?.trim();
  if (hint) return selectOne(input.eligible, hint);
  return input.eligible;
}

function selectOne(eligible: ResolvedReviewer[], name: string): ResolvedReviewer[] {
  const matches = eligible.filter((reviewer) => reviewer.name === name || reviewer.key === name || reviewerMatchesHint(reviewer, name));
  if (matches.length === 0) throw new WingmanError("reviewer.unavailable", `No eligible configured Wingman reviewer matches ${name}.`);
  if (matches.length > 1) throw new WingmanError("reviewer.ambiguous", `Multiple eligible Wingman reviewers match ${name}: ${matches.map((reviewer) => reviewer.key).join(", ")}.`);
  return matches;
}

export function dedupeReviewers(reviewers: ResolvedReviewer[]): ResolvedReviewer[] {
  const seen = new Set<string>();
  return reviewers.filter((reviewer) => {
    if (seen.has(reviewer.key)) return false;
    seen.add(reviewer.key);
    return true;
  });
}
```

- [ ] **Step 4: Verify reviewer tests pass**

Run: `npx tsx --test tests/reviewers.test.ts`

Expected: PASS for all reviewer tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit reviewer module**

```bash
git add src/core/reviewers.ts tests/reviewers.test.ts
git commit -m "feat: add reviewer selection"
```

## Task 5: Implement Target And Mode Inference

**Files:**
- Create: `src/core/target.ts`
- Create: `tests/target.test.ts`

- [ ] **Step 1: Write failing target inference tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { inferWingmanContext } from "../src/core/target.ts";

test("infers consensus for decision questions", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Which API shape should we choose for config merge" });
  assert.equal(context.mode, "consensus");
  assert.equal(context.target.type, "question-consensus");
  assert.equal(context.target.confidence, "high");
});

test("infers current plan review", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Review the plan in docs/superpowers/plans/build.md" });
  assert.equal(context.mode, "audit");
  assert.equal(context.target.type, "current-plan");
});

test("infers files target", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Review src/core/config.ts and tests/config.test.ts" });
  assert.equal(context.target.type, "files");
  assert.deepEqual(context.target.type === "files" ? context.target.paths : [], ["src/core/config.ts", "tests/config.test.ts"]);
});

test("skeptical language selects adversarial mode", () => {
  const context = inferWingmanContext({ cwd: "/repo", request: "Be skeptical and audit this branch" });
  assert.equal(context.mode, "adversarial");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/target.test.ts`

Expected: FAIL because `src/core/target.ts` does not exist.

- [ ] **Step 3: Implement inference module**

```ts
import type { WingmanContextPack, WingmanMode, WingmanTarget } from "./types.ts";

const pathPattern = /(?:^|\s)([\w./-]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs|css|html|yaml|yml))(?:\s|$|,)/g;

export function inferWingmanContext(input: { cwd: string; request: string; targetHint?: string; sessionText?: string }): WingmanContextPack {
  const request = input.request.trim();
  const mode = inferMode(request);
  const target = inferTarget(request, input.targetHint, input.sessionText);
  return {
    target,
    label: targetLabel(target),
    focus: request,
    mode,
    cwd: input.cwd,
    content: input.sessionText ?? "",
    reason: `Inferred ${target.type} from Wingman request`,
  };
}

function inferMode(request: string): WingmanMode {
  if (/\b(consensus|decide|which|choose|trade[-\s]?off)\b/i.test(request)) return "consensus";
  if (/\b(skeptical|adversarial|red[-\s]?team|do not rubber[-\s]?stamp)\b/i.test(request)) return "adversarial";
  if (/\b(rescue|stuck|debug)\b/i.test(request)) return "rescue";
  return "audit";
}

function inferTarget(request: string, targetHint: string | undefined, sessionText: string | undefined): WingmanTarget {
  const focus = targetHint?.trim() || request;
  if (/\b(which|choose|decide|should we)\b/i.test(focus)) return { type: "question-consensus", question: focus, confidence: "high" };
  if (/\b(plan|spec|adr|design)\b/i.test(focus)) return { type: "current-plan", text: focus, confidence: "high" };
  const files = extractPaths(focus);
  if (files.length > 0) return { type: "files", paths: files, confidence: "high" };
  const branch = /\bbranch\s+diff\s+(?:against\s+)?([\w./-]+)/i.exec(focus)?.[1];
  if (branch) return { type: "branch-diff", base: branch, confidence: "medium" };
  const commit = /\bcommit\s+([a-f0-9]{7,40})\b/i.exec(focus)?.[1];
  if (commit) return { type: "commit", sha: commit, confidence: "high" };
  if (/\bworking\s+tree|diff|changes\b/i.test(focus)) return { type: "working-tree", confidence: "medium" };
  if (sessionText?.trim()) return { type: "last-turn", text: sessionText, confidence: "medium" };
  return { type: "freeform", focus, confidence: "low" };
}

function extractPaths(value: string): string[] {
  const paths = new Set<string>();
  for (const match of value.matchAll(pathPattern)) {
    const file = match[1]?.replace(/[,.]$/, "");
    if (file) paths.add(file);
  }
  return Array.from(paths);
}

function targetLabel(target: WingmanTarget): string {
  if (target.type === "files") return `Files: ${target.paths.join(", ")}`;
  if (target.type === "branch-diff") return `Branch diff against ${target.base}`;
  if (target.type === "commit") return `Commit ${target.sha}`;
  if (target.type === "question-consensus") return "Question consensus";
  if (target.type === "current-plan") return "Plan/spec review";
  if (target.type === "working-tree") return "Working tree";
  if (target.type === "last-turn") return "Last turn";
  return "Freeform";
}
```

- [ ] **Step 4: Verify target tests pass**

Run: `npx tsx --test tests/target.test.ts`

Expected: PASS for all target tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit target inference**

```bash
git add src/core/target.ts tests/target.test.ts
git commit -m "feat: infer Wingman review targets"
```

## Task 6: Implement Artifacts And Compact Synthesis Output

**Files:**
- Create: `src/core/artifacts.ts`
- Create: `src/core/synthesis.ts`
- Create: `tests/artifacts-synthesis.test.ts`

- [ ] **Step 1: Write failing artifact and synthesis tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRunArtifacts, writeReviewerArtifact, writeRunSummary } from "../src/core/artifacts.ts";
import { formatCompactRunResult } from "../src/core/synthesis.ts";
import type { ReviewerResult, ResolvedReviewer, WingmanRunResult } from "../src/core/types.ts";

const reviewer: ResolvedReviewer = {
  name: "gemini",
  provider: "google",
  model: "gemini-3.1-pro-preview",
  key: "google/gemini-3.1-pro-preview",
  label: "gemini (google/gemini-3.1-pro-preview)",
  sameProvider: false,
  sameModel: false,
  source: "merged",
  modelRef: { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini" }
};

test("writes full reviewer output while compact result remains bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-artifacts-"));
  const artifacts = await createRunArtifacts(root, "run-abc");
  const longOutput = "Finding line\n".repeat(500);
  const result = await writeReviewerArtifact(artifacts, reviewer, { status: "ok", round: 1, prompt: "review", output: longOutput });
  await writeRunSummary(artifacts, { runId: "run-abc", request: "review", results: [result], cancelled: false, rounds: 1 });

  const markdown = await readFile(result.artifactMarkdownPath!, "utf8");
  assert.equal(markdown.includes(longOutput.slice(0, 200)), true);

  const compact = formatCompactRunResult({ ok: 1, failed: 0, cancelled: 0, artifactDir: artifacts.dir, results: [result], maxExcerptChars: 120 });
  assert.equal(compact.length < longOutput.length, true);
  assert.match(compact, /run-abc/);
  assert.match(compact, /reviewers\/gemini.md/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/artifacts-synthesis.test.ts`

Expected: FAIL because artifact and synthesis modules do not exist.

- [ ] **Step 3: Implement artifact writer**

```ts
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedReviewer, ReviewerResult, WingmanConfig } from "./types.ts";

export type RunArtifacts = {
  runId: string;
  dir: string;
  reviewersDir: string;
  summaryPath: string;
  synthesisInputPath: string;
};

export function createRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export async function createRunArtifacts(cwd: string, runId = createRunId()): Promise<RunArtifacts> {
  const dir = join(cwd, ".wingman", "runs", runId);
  const reviewersDir = join(dir, "reviewers");
  await mkdir(reviewersDir, { recursive: true });
  return { runId, dir, reviewersDir, summaryPath: join(dir, "summary.json"), synthesisInputPath: join(dir, "synthesis-input.md") };
}

function safeAlias(alias: string): string {
  return alias.replace(/[^a-z0-9._-]/g, "-");
}

export async function writeReviewerArtifact(artifacts: RunArtifacts, reviewer: ResolvedReviewer, input: Omit<ReviewerResult, "reviewer" | "artifactMarkdownPath" | "artifactJsonPath">): Promise<ReviewerResult> {
  const base = input.round > 1 ? `${safeAlias(reviewer.name)}-round-${input.round}` : safeAlias(reviewer.name);
  const artifactMarkdownPath = join(artifacts.reviewersDir, `${base}.md`);
  const artifactJsonPath = join(artifacts.reviewersDir, `${base}.json`);
  const result: ReviewerResult = { ...input, reviewer, artifactMarkdownPath, artifactJsonPath };
  await writeFile(artifactMarkdownPath, reviewerMarkdown(result), "utf8");
  await writeFile(artifactJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

function reviewerMarkdown(result: ReviewerResult): string {
  return [
    `# ${result.reviewer.label}`,
    "",
    `Status: ${result.status}`,
    `Round: ${result.round}`,
    result.error ? `Error: ${result.error}` : undefined,
    "",
    "## Prompt",
    "",
    result.prompt,
    "",
    "## Output",
    "",
    result.output ?? "",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export async function writeRunSummary(artifacts: RunArtifacts, summary: Record<string, unknown>): Promise<void> {
  await writeFile(artifacts.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}

export async function writeSynthesisInput(artifacts: RunArtifacts, text: string): Promise<void> {
  await writeFile(artifacts.synthesisInputPath, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

export async function appendAuditLog(cwd: string, config: WingmanConfig, entry: Record<string, unknown>, now = new Date()): Promise<void> {
  if (!config.logging.enabled) return;
  const dir = join(cwd, ".wingman", "logs");
  await mkdir(dir, { recursive: true });
  await appendFile(join(dir, `${now.toISOString().slice(0, 10)}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");
}
```

- [ ] **Step 4: Implement compact synthesis formatting**

```ts
import type { ReviewerResult } from "./types.ts";

export function boundedExcerpt(value: string | undefined, maxChars: number): string {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n[truncated: full output persisted in reviewer artifact]`;
}

export function formatCompactRunResult(input: { ok: number; failed: number; cancelled: number; artifactDir: string; results: ReviewerResult[]; maxExcerptChars?: number }): string {
  const maxExcerptChars = input.maxExcerptChars ?? 1200;
  const lines = [
    `Wingman status: ${input.ok} ok, ${input.failed} failed, ${input.cancelled} cancelled`,
    `Artifacts: ${input.artifactDir}`,
    "",
    "Reviewer status:",
    ...input.results.map((result) => `- [${result.status}] ${result.reviewer.key} (${result.reviewer.name})${result.artifactMarkdownPath ? ` -> ${result.artifactMarkdownPath}` : ""}`),
    "",
    "Reviewer excerpts:",
    ...input.results.flatMap((result) => [
      `## ${result.reviewer.name}`,
      boundedExcerpt(result.output ?? result.error, maxExcerptChars),
      "",
    ]),
    "Main agent: start your response with a compact Wingman status block, then synthesize reviewer opinions. State what to keep, what to dismiss, and concrete next actions. Do not dump raw reviewer output.",
  ];
  return lines.join("\n").trimEnd();
}

export function buildSynthesisInput(results: ReviewerResult[]): string {
  return results.map((result) => [`# ${result.reviewer.label}`, `Status: ${result.status}`, result.output ?? result.error ?? ""].join("\n\n")).join("\n\n---\n\n");
}
```

- [ ] **Step 5: Verify artifact tests pass**

Run: `npx tsx --test tests/artifacts-synthesis.test.ts`

Expected: PASS for the artifact regression.

- [ ] **Step 6: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 7: Commit artifacts and synthesis**

```bash
git add src/core/artifacts.ts src/core/synthesis.ts tests/artifacts-synthesis.test.ts
git commit -m "feat: persist Wingman run artifacts"
```

## Task 7: Implement Parallel Runtime Orchestration

**Files:**
- Create: `src/core/run.ts`
- Create: `tests/run.test.ts`

- [ ] **Step 1: Write failing runtime tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/run.test.ts`

Expected: FAIL because `src/core/run.ts` does not exist.

- [ ] **Step 3: Implement runtime module**

```ts
import { createRunArtifacts, writeReviewerArtifact, writeRunSummary, writeSynthesisInput } from "./artifacts.ts";
import { errorMessage } from "./errors.ts";
import { buildSynthesisInput, formatCompactRunResult } from "./synthesis.ts";
import type { ResolvedReviewer, ReviewerResult, WingmanMode, WingmanTarget, WingmanRunResult } from "./types.ts";

export type ReviewerExecutionInput = {
  reviewer: ResolvedReviewer;
  prompt: string;
  round: number;
  signal?: AbortSignal;
};

export type ReviewerExecutionOutput = {
  output: string;
  summary?: string;
};

export type ReviewerExecutor = (input: ReviewerExecutionInput) => Promise<ReviewerExecutionOutput>;

export type RunWingmanReviewInput = {
  cwd: string;
  request: string;
  mode: WingmanMode;
  target: WingmanTarget;
  targetLabel: string;
  reviewers: ResolvedReviewer[];
  maxParallelReviewers: number;
  maxRounds: number;
  executor: ReviewerExecutor;
  signal?: AbortSignal;
};

export async function runWingmanReview(input: RunWingmanReviewInput): Promise<WingmanRunResult> {
  const artifacts = await createRunArtifacts(input.cwd);
  const maxRounds = input.mode === "consensus" ? Math.max(1, input.maxRounds) : 1;
  const rawResults: ReviewerResult[] = [];
  let completedRounds = 0;
  for (let round = 1; round <= maxRounds; round += 1) {
    completedRounds = round;
    const prompt = buildReviewerPrompt(input.request, input.targetLabel, input.mode, round);
    const roundResults = await runWithLimit(input.reviewers, Math.max(1, input.maxParallelReviewers), async (reviewer) => {
      try {
        if (input.signal?.aborted) throw new DOMException("Run cancelled", "AbortError");
        const output = await input.executor({ reviewer, prompt, round, signal: input.signal });
        return await writeReviewerArtifact(artifacts, reviewer, { status: "ok", round, prompt, output: output.output, summary: output.summary });
      } catch (error) {
        return await writeReviewerArtifact(artifacts, reviewer, { status: input.signal?.aborted ? "cancelled" : "failed", round, prompt, error: errorMessage(error) });
      }
    });
    rawResults.push(...roundResults);
    if (input.mode !== "consensus" || consensusReached(roundResults)) break;
  }
  const ok = rawResults.filter((result) => result.status === "ok").length;
  const failed = rawResults.filter((result) => result.status === "failed").length;
  const cancelled = rawResults.filter((result) => result.status === "cancelled").length;
  const text = formatCompactRunResult({ ok, failed, cancelled, artifactDir: artifacts.dir, results: rawResults });
  await writeSynthesisInput(artifacts, buildSynthesisInput(rawResults));
  await writeRunSummary(artifacts, { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: completedRounds, cancelled: cancelled > 0, results: rawResults });
  return { runId: artifacts.runId, request: input.request, mode: input.mode, target: input.target, targetLabel: input.targetLabel, rounds: completedRounds, cancelled: cancelled > 0, results: rawResults, artifactDir: artifacts.dir, summaryPath: artifacts.summaryPath, synthesisInputPath: artifacts.synthesisInputPath, text };
}

function buildReviewerPrompt(request: string, targetLabel: string, mode: WingmanMode, round: number): string {
  return [
    "You are a read-only Wingman reviewer.",
    "Inspect the provided project context if tools are available, but do not write files, edit files, commit, or run mutating commands.",
    `Mode: ${mode}`,
    `Target: ${targetLabel}`,
    `Round: ${round}`,
    "Return findings ordered by severity with concrete recommendations.",
    "",
    request,
  ].join("\n");
}

function consensusReached(results: ReviewerResult[]): boolean {
  const successful = results.filter((result) => result.status === "ok");
  return successful.length > 0 && successful.every((result) => /CONSENSUS:\s*yes/i.test(result.output ?? ""));
}

async function runWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function next(): Promise<void> {
    for (;;) {
      const current = index;
      index += 1;
      const item = items[current];
      if (!item) return;
      results[current] = await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
  return results;
}
```

- [ ] **Step 4: Verify runtime tests pass**

Run: `npx tsx --test tests/run.test.ts`

Expected: PASS for runtime tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit runtime**

```bash
git add src/core/run.ts tests/run.test.ts
git commit -m "feat: orchestrate Wingman reviewer runs"
```

## Task 8: Implement Read-Only OpenCode Reviewer Executor

**Files:**
- Create: `src/opencode/executor.ts`
- Create: `tests/opencode-executor.test.ts`

- [ ] **Step 1: Write failing executor tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createOpenCodeReviewerExecutor, readOnlyPermissionRules, readOnlyToolFlags } from "../src/opencode/executor.ts";
import type { ResolvedReviewer } from "../src/core/types.ts";

const reviewer: ResolvedReviewer = {
  name: "gemini",
  provider: "google",
  model: "gemini-3.1-pro-preview",
  key: "google/gemini-3.1-pro-preview",
  label: "gemini (google/gemini-3.1-pro-preview)",
  sameProvider: false,
  sameModel: false,
  source: "merged",
  modelRef: { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini" }
};

test("read-only permissions deny edit and bash", () => {
  assert.deepEqual(readOnlyPermissionRules().filter((rule) => rule.action === "deny").map((rule) => rule.permission).sort(), ["bash", "edit", "write"]);
  assert.equal(readOnlyToolFlags().bash, false);
  assert.equal(readOnlyToolFlags().edit, false);
});

test("executor creates read-only session and extracts assistant text", async () => {
  const calls: string[] = [];
  const fakeClient = {
    session: {
      create: async (args: any) => { calls.push(`create:${args.model.providerID}/${args.model.id}`); return { data: { id: "session-1" } }; },
      prompt: async (args: any) => { calls.push(`prompt:${args.sessionID}:${args.tools.bash}`); return { data: {} }; },
      messages: async () => ({ data: [{ parts: [{ type: "text", text: "review output" }] }] })
    }
  };
  const executor = createOpenCodeReviewerExecutor({ client: fakeClient as any, directory: "/repo" });
  const output = await executor({ reviewer, prompt: "review", round: 1 });
  assert.equal(output.output, "review output");
  assert.deepEqual(calls, ["create:google/gemini-3.1-pro-preview", "prompt:session-1:false"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/opencode-executor.test.ts`

Expected: FAIL because `src/opencode/executor.ts` does not exist.

- [ ] **Step 3: Implement OpenCode executor adapter**

```ts
import type { ReviewerExecutor } from "../core/run.ts";
import type { ResolvedReviewer } from "../core/types.ts";

type PermissionRule = { permission: string; pattern: string; action: "allow" | "deny" | "ask" };

export function readOnlyPermissionRules(): PermissionRule[] {
  return [
    { permission: "edit", pattern: "*", action: "deny" },
    { permission: "write", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "*", action: "deny" },
  ];
}

export function readOnlyToolFlags(): Record<string, boolean> {
  return { edit: false, write: false, bash: false, patch: false };
}

export function createOpenCodeReviewerExecutor(input: { client: any; directory: string; workspace?: string }): ReviewerExecutor {
  return async ({ reviewer, prompt }) => {
    const session = await input.client.session.create({
      directory: input.directory,
      workspace: input.workspace,
      title: `Wingman ${reviewer.name}`,
      model: { providerID: reviewer.provider, id: reviewer.model },
      permission: readOnlyPermissionRules(),
    });
    const sessionID = data(session).id;
    await input.client.session.prompt({
      sessionID,
      directory: input.directory,
      workspace: input.workspace,
      model: { providerID: reviewer.provider, modelID: reviewer.model },
      tools: readOnlyToolFlags(),
      system: "You are a read-only reviewer. Do not edit files, write files, commit, or run mutating commands.",
      parts: [{ type: "text", text: prompt }],
    });
    if (input.client.session.wait) await input.client.session.wait({ sessionID, directory: input.directory, workspace: input.workspace });
    const messages = await input.client.session.messages({ sessionID, directory: input.directory, workspace: input.workspace, limit: 20 });
    return { output: extractText(data(messages)) };
  };
}

function data(value: any): any {
  return value?.data ?? value;
}

function extractText(messages: any): string {
  const list = Array.isArray(messages) ? messages : messages?.items ?? [];
  for (const message of [...list].reverse()) {
    const parts = Array.isArray(message.parts) ? message.parts : [];
    const text = parts.map((part: any) => part.text ?? part.content ?? "").filter(Boolean).join("\n").trim();
    if (text) return text;
  }
  return "";
}
```

- [ ] **Step 4: Verify executor tests pass**

Run: `npx tsx --test tests/opencode-executor.test.ts`

Expected: PASS for executor tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit executor adapter**

```bash
git add src/opencode/executor.ts tests/opencode-executor.test.ts
git commit -m "feat: add read-only OpenCode reviewer executor"
```

## Task 9: Implement Server Plugin Tool And Command Fallbacks

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Write failing server tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/server.ts";

test("server plugin registers wingman_review tool and commands", async () => {
  const hooks = await plugin({ directory: "/repo", worktree: "/repo", project: {} as any, client: {} as any, experimental_workspace: {} as any, serverUrl: new URL("http://localhost"), $: {} as any });
  assert.ok(hooks.tool?.wingman_review);
  const config: any = {};
  await hooks.config?.(config);
  assert.match(config.command.wingman.template, /wingman_review/);
  assert.match(config.command["wingman:setup"].template, /Wingman setup/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/server.test.ts`

Expected: FAIL because `src/server.ts` does not exist.

- [ ] **Step 3: Implement server plugin**

```ts
import { tool, type Plugin } from "@opencode-ai/plugin";
import { loadEffectiveConfig } from "./core/config.ts";
import { inferWingmanContext } from "./core/target.ts";
import { resolveConfiguredReviewers, selectReviewers } from "./core/reviewers.ts";
import { runWingmanReview } from "./core/run.ts";
import { createOpenCodeReviewerExecutor } from "./opencode/executor.ts";
import type { CurrentModel, ModelRef } from "./core/types.ts";

const plugin: Plugin = async ({ client, directory }) => {
  return {
    async config(cfg) {
      const target = cfg as { command?: Record<string, { description: string; template: string }> };
      target.command = {
        ...(target.command ?? {}),
        wingman: {
          description: "Ask standalone Wingman reviewers for a second opinion",
          template: "Use the wingman_review tool for this request, then synthesize the result for the user. Request: $ARGUMENTS",
        },
        "wingman:setup": {
          description: "Open Wingman setup in the TUI plugin",
          template: "Wingman setup is handled by the oc-wingman TUI plugin. If the picker does not open, ensure the ./tui plugin entrypoint is installed and restart OpenCode.",
        },
      };
    },
    tool: {
      wingman_review: tool({
        description: "Run standalone Wingman reviewers in read-only sessions and return compact synthesis input",
        args: {
          focus: tool.schema.string(),
          reviewerNames: tool.schema.array(tool.schema.string()).optional(),
          reviewerHint: tool.schema.string().optional(),
          targetHint: tool.schema.string().optional(),
          maxRounds: tool.schema.number().optional(),
          currentProviderID: tool.schema.string().optional(),
          currentModelID: tool.schema.string().optional(),
        },
        async execute(args, context) {
          const cwd = context.directory;
          const loaded = await loadEffectiveConfig(cwd);
          const models = await listModels(client, cwd);
          const current: CurrentModel | undefined = args.currentProviderID && args.currentModelID ? { providerID: args.currentProviderID, modelID: args.currentModelID } : undefined;
          const eligible = resolveConfiguredReviewers(loaded.config, models, current);
          const selected = selectReviewers({ eligible, names: args.reviewerNames, hint: args.reviewerHint });
          const wingmanContext = inferWingmanContext({ cwd, request: args.focus, targetHint: args.targetHint });
          const result = await runWingmanReview({
            cwd,
            request: args.focus,
            mode: wingmanContext.mode,
            target: wingmanContext.target,
            targetLabel: wingmanContext.label,
            reviewers: selected,
            maxParallelReviewers: loaded.config.maxParallelReviewers,
            maxRounds: args.maxRounds ?? loaded.config.maxRounds,
            executor: createOpenCodeReviewerExecutor({ client, directory: cwd }),
          });
          return result.text;
        },
      }),
    },
  };
};

async function listModels(client: any, directory: string): Promise<ModelRef[]> {
  const response = client.v2?.model?.list ? await client.v2.model.list({ instance: { directory } }) : await client.model?.list?.({ directory });
  const data = response?.data ?? response;
  const items = Array.isArray(data) ? data : data?.items ?? [];
  return items.map((item: any) => ({ providerID: item.providerID ?? item.provider, modelID: item.id ?? item.modelID, name: item.name ?? item.id ?? item.modelID, reasoning: Boolean(item.reasoning) })).filter((item: ModelRef) => item.providerID && item.modelID);
}

export default plugin;
```

- [ ] **Step 4: Verify server tests pass**

Run: `npx tsx --test tests/server.test.ts`

Expected: PASS for server registration tests.

- [ ] **Step 5: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 6: Commit server plugin**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: add Wingman server plugin"
```

## Task 10: Implement TUI Setup And Run Picker Flows

**Files:**
- Create: `src/tui/options.ts`
- Create: `src/tui/flows.ts`
- Create: `src/tui/index.ts`
- Create: `tests/tui-options.test.ts`

- [ ] **Step 1: Write failing TUI option tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { formatWingmanPrompt, reviewerSelectOptions, setupScopeOptions } from "../src/tui/options.ts";
import type { ResolvedReviewer } from "../src/core/types.ts";

const reviewer: ResolvedReviewer = {
  name: "gemini",
  provider: "google",
  model: "gemini-3.1-pro-preview",
  key: "google/gemini-3.1-pro-preview",
  label: "gemini (google/gemini-3.1-pro-preview)",
  sameProvider: false,
  sameModel: false,
  source: "merged",
  modelRef: { providerID: "google", modelID: "gemini-3.1-pro-preview", name: "Gemini" }
};

test("reviewer picker includes all, specific reviewer, and cancel", () => {
  assert.deepEqual(reviewerSelectOptions([reviewer]).map((option) => option.value), ["all", "gemini", "cancel"]);
});

test("setup scope options include global and project", () => {
  assert.deepEqual(setupScopeOptions().map((option) => option.value), ["project", "global", "cancel"]);
});

test("formatWingmanPrompt encodes selected reviewers", () => {
  const prompt = formatWingmanPrompt("review config", ["gemini"]);
  assert.match(prompt, /wingman_review/);
  assert.match(prompt, /reviewerNames/);
  assert.match(prompt, /gemini/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test tests/tui-options.test.ts`

Expected: FAIL because TUI option module does not exist.

- [ ] **Step 3: Implement pure TUI option helpers**

```ts
import type { ResolvedReviewer } from "../core/types.ts";

export type PickerOption<Value extends string = string> = {
  title: string;
  value: Value;
  description?: string;
  disabled?: boolean;
};

export function setupScopeOptions(): PickerOption<"project" | "global" | "cancel">[] {
  return [
    { title: "Project config", value: "project", description: "Write .wingman/config.json in this project" },
    { title: "Global config", value: "global", description: "Write ~/.config/oc-wingman/config.json" },
    { title: "Cancel", value: "cancel", description: "Do not change Wingman config" },
  ];
}

export function reviewerSelectOptions(reviewers: ResolvedReviewer[]): PickerOption[] {
  return [
    { title: `All eligible reviewers (${reviewers.length})`, value: "all", description: "Run every eligible reviewer" },
    ...reviewers.map((reviewer) => ({ title: reviewer.label, value: reviewer.name, description: reviewer.key })),
    { title: "Cancel", value: "cancel", description: "Do not run Wingman" },
  ];
}

export function formatWingmanPrompt(focus: string, reviewerNames: string[]): string {
  const payload = JSON.stringify({ focus, reviewerNames }, null, 2);
  return `Use the wingman_review tool with this JSON payload, then synthesize the tool result for the user:\n\n${payload}`;
}
```

- [ ] **Step 4: Implement TUI dialog flows**

```ts
import { defaultGlobalConfigPath, loadEffectiveConfig, projectConfigPath, writeConfig } from "../core/config.ts";
import { resolveConfiguredReviewers } from "../core/reviewers.ts";
import type { ModelRef } from "../core/types.ts";
import { formatWingmanPrompt, reviewerSelectOptions, setupScopeOptions } from "./options.ts";

type TuiApi = any;

export async function runWingmanPicker(api: TuiApi): Promise<void> {
  const focus = await prompt(api, "Wingman review focus", "What should Wingman review");
  if (!focus) return;
  const loaded = await loadEffectiveConfig(api.state.path.directory);
  const models = await listModels(api);
  const reviewers = resolveConfiguredReviewers(loaded.config, models, currentModel(api));
  const selected = await select(api, "Choose Wingman reviewers", reviewerSelectOptions(reviewers));
  if (!selected || selected.value === "cancel") return;
  const reviewerNames = selected.value === "all" ? reviewers.map((reviewer) => reviewer.name) : [selected.value];
  await api.client.tui.appendPrompt({ directory: api.state.path.directory, text: formatWingmanPrompt(focus, reviewerNames) });
  await api.client.tui.submitPrompt({ directory: api.state.path.directory });
}

export async function runSetupPicker(api: TuiApi): Promise<void> {
  const scope = await select(api, "Wingman setup scope", setupScopeOptions());
  if (!scope || scope.value === "cancel") return;
  const models = await listModels(api);
  const selected = await select(api, "Choose default reviewer model", models.map((model) => ({ title: `${model.name} (${model.providerID}/${model.modelID})`, value: `${model.providerID}/${model.modelID}` })));
  if (!selected) return;
  const [provider, model] = selected.value.split("/", 2);
  const loaded = await loadEffectiveConfig(api.state.path.directory);
  const config = { ...loaded.config, reviewers: [{ name: provider, provider, model }] };
  const path = scope.value === "global" ? defaultGlobalConfigPath() : projectConfigPath(api.state.path.directory);
  await writeConfig(path, config);
  api.ui.toast({ variant: "info", message: `Wingman config saved to ${path}. Restart OpenCode if this plugin entrypoint was newly added.` });
}

function prompt(api: TuiApi, title: string, placeholder: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(() => api.ui.DialogPrompt({ title, placeholder, onConfirm: (value: string) => { api.ui.dialog.clear(); resolve(value.trim() || undefined); }, onCancel: () => { api.ui.dialog.clear(); resolve(undefined); } }));
  });
}

function select<Value>(api: TuiApi, title: string, options: Array<{ title: string; value: Value; description?: string; disabled?: boolean }>): Promise<{ title: string; value: Value } | undefined> {
  return new Promise((resolve) => {
    api.ui.dialog.replace(() => api.ui.DialogSelect({ title, options, onSelect: (option: { title: string; value: Value }) => { api.ui.dialog.clear(); resolve(option); } }), () => resolve(undefined));
  });
}

async function listModels(api: TuiApi): Promise<ModelRef[]> {
  const response = await api.client.v2.model.list({ instance: { directory: api.state.path.directory } });
  const items = response.data?.items ?? response.data ?? [];
  return items.map((item: any) => ({ providerID: item.providerID ?? item.provider, modelID: item.id ?? item.modelID, name: item.name ?? item.id ?? item.modelID, reasoning: Boolean(item.reasoning) })).filter((item: ModelRef) => item.providerID && item.modelID);
}

function currentModel(api: TuiApi) {
  const model = api.state.config.model;
  if (typeof model !== "string" || !model.includes("/")) return undefined;
  const [providerID, modelID] = model.split("/", 2);
  return { providerID, modelID };
}
```

- [ ] **Step 5: Implement TUI plugin entrypoint**

```ts
import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { runSetupPicker, runWingmanPicker } from "./flows.ts";

export default {
  id: "oc-wingman-tui",
  tui: async (api) => {
    api.command.register(() => [
      {
        title: "Wingman Review",
        value: "wingman.review",
        description: "Ask configured Wingman reviewers for a read-only second opinion",
        category: "Wingman",
        slash: { name: "wingman" },
        onSelect: () => void runWingmanPicker(api),
      },
      {
        title: "Wingman Setup",
        value: "wingman.setup",
        description: "Configure Wingman reviewers",
        category: "Wingman",
        slash: { name: "wingman:setup" },
        onSelect: () => void runSetupPicker(api),
      },
    ]);
  },
} satisfies TuiPluginModule;
```

- [ ] **Step 6: Verify TUI tests pass**

Run: `npx tsx --test tests/tui-options.test.ts`

Expected: PASS for TUI option tests.

- [ ] **Step 7: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 8: Commit TUI plugin**

```bash
git add src/tui/options.ts src/tui/flows.ts src/tui/index.ts tests/tui-options.test.ts
git commit -m "feat: add Wingman TUI picker flows"
```

## Task 11: Add README And Audit Logging Coverage

**Files:**
- Modify: `README.md`
- Modify: `tests/artifacts-synthesis.test.ts`

- [ ] **Step 1: Add audit logging test**

In `tests/artifacts-synthesis.test.ts`, extend the existing artifact import so it includes `appendAuditLog`, then append this test after the existing tests:

```ts
test("appendAuditLog writes jsonl only when enabled", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-wingman-log-"));
  await appendAuditLog(root, { version: 1, exclude: "same-provider", defaultReviewers: "all-eligible", maxRounds: 3, maxParallelReviewers: 4, logging: { enabled: true, raw: false }, reviewers: [] }, { runId: "abc" }, new Date("2026-05-21T00:00:00Z"));
  const text = await readFile(join(root, ".wingman", "logs", "2026-05-21.jsonl"), "utf8");
  assert.match(text, /"runId":"abc"/);
});
```

- [ ] **Step 2: Run tests to verify audit logging passes**

Run: `npx tsx --test tests/artifacts-synthesis.test.ts`

Expected: PASS including the audit logging test.

- [ ] **Step 3: Add README**

```md
# oc-wingman

Standalone OpenCode Wingman plugin for read-only model reviews.

## Install

Add both plugin entrypoints to OpenCode config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "./src/server.ts",
    "./src/tui/index.ts"
  ]
}
```

Restart OpenCode after changing plugin config. OpenCode loads plugin config at startup.

## Commands

- `/wingman:setup`: choose reviewer models and write global or project config.
- `/wingman`: choose reviewers for one read-only review run.

## Config

Global config lives at `~/.config/oc-wingman/config.json`.
Project config lives at `.wingman/config.json` in the project root.
Project reviewers merge over global reviewers by `name` alias.

## Artifacts

Every run writes full reviewer output under `.wingman/runs/` before returning compact chat output.
Optional audit logs live in `.wingman/logs/YYYY-MM-DD.jsonl` when `logging.enabled` is true.
```

- [ ] **Step 4: Run all verification**

Run: `npm run verify`

Expected: typecheck and all tests pass.

- [ ] **Step 5: Commit docs and logging coverage**

```bash
git add README.md tests/artifacts-synthesis.test.ts
git commit -m "docs: document Wingman plugin usage"
```

## Task 12: Final Integration Verification

**Files:**
- Modify only if verification reveals a concrete defect in files created by earlier tasks.

- [ ] **Step 1: Run full verification**

Run: `npm run verify`

Expected: `tsc --noEmit` exits 0 and all Node tests pass.

- [ ] **Step 2: Inspect git status**

Run: `git status --short`

Expected: no output.

- [ ] **Step 3: Inspect recent commits**

Run: `git log --oneline -12`

Expected: one commit per implementation task, with the newest commit documenting README/logging or any verified fix.

- [ ] **Step 4: Manual OpenCode smoke test**

Add local plugin entries to a temporary OpenCode config for this repository, restart OpenCode, then run `/wingman:setup` and `/wingman` with a tiny review focus such as `Review README.md for clarity`.

Expected:

```text
Wingman status: 1 ok, 0 failed, 0 cancelled
Artifacts: absolute path containing .wingman/runs/
```

- [ ] **Step 5: Record smoke-test notes**

If manual smoke testing creates run artifacts, inspect the generated `summary.json` and one reviewer Markdown file under `.wingman/runs/`, then remove that generated run directory before the final commit unless the artifact is intentionally kept for a fixture.

## Plan Self-Review

- Spec coverage: package scaffold, hybrid server/TUI entrypoints, config scopes, run-boundary reload, merge-by-alias, reviewer eligibility, read-only sessions, artifacts, bounded output, errors, logging, and tests are covered by Tasks 1 through 12.
- Placeholder scan: no deferred implementation markers are intentionally present.
- Type consistency: domain types are introduced in Task 2 and reused by later tasks under the same names.
