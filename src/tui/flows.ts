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
