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
  maxParallelReviewers: 4,
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
    maxParallelReviewers: numberValue(obj.maxParallelReviewers, defaultWingmanConfig.maxParallelReviewers, 1, 16),
    reviewers,
  };
}

type ConfigField = keyof WingmanConfig;

function configFields(raw: unknown): Set<ConfigField> {
  const obj = asObject(raw) ?? {};
  return new Set(Object.keys(obj).filter((key): key is ConfigField => ["version", "exclude", "defaultReviewers", "maxParallelReviewers", "reviewers"].includes(key)));
}

export function mergeConfigs(globalConfig: WingmanConfig, projectConfig: WingmanConfig, projectFields: Set<ConfigField> = new Set(["exclude", "defaultReviewers", "maxParallelReviewers", "reviewers"] as ConfigField[])): WingmanConfig {
  const mergedReviewers = new Map<string, WingmanReviewerConfig>();
  for (const reviewer of globalConfig.reviewers) mergedReviewers.set(reviewer.name, reviewer);
  if (projectFields.has("reviewers")) for (const reviewer of projectConfig.reviewers) mergedReviewers.set(reviewer.name, reviewer);
  return {
    version: 1,
    exclude: projectFields.has("exclude") ? projectConfig.exclude : globalConfig.exclude,
    defaultReviewers: projectFields.has("defaultReviewers") ? projectConfig.defaultReviewers : globalConfig.defaultReviewers,
    maxParallelReviewers: projectFields.has("maxParallelReviewers") ? projectConfig.maxParallelReviewers : globalConfig.maxParallelReviewers,
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

export async function readConfig(path: string): Promise<WingmanConfig> {
  const loaded = await readConfigFile(path);
  return loaded?.config ?? { ...defaultWingmanConfig, reviewers: [] };
}

export async function loadEffectiveConfig(cwd: string, options: { home?: string; globalPath?: string; projectPath?: string } = {}) {
  const globalPath = options.globalPath ?? defaultGlobalConfigPath(options.home);
  const projectPath = options.projectPath ?? projectConfigPath(cwd);
  const loadedGlobal = await readConfigFile(globalPath);
  const loadedProject = await readConfigFile(projectPath);
  const globalConfig = loadedGlobal?.config ?? defaultWingmanConfig;
  const config = loadedProject
    ? mergeConfigs(globalConfig, loadedProject.config, loadedProject.fields)
    : { ...globalConfig, reviewers: [...globalConfig.reviewers] };
  return { config, globalPath, projectPath, sources: { global: Boolean(loadedGlobal), project: Boolean(loadedProject) } };
}

export async function writeConfig(path: string, config: WingmanConfig): Promise<void> {
  const normalized = normalizeConfig(config, path);
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  await rename(temp, path);
}
