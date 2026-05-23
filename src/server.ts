import { tool, type Plugin } from "@opencode-ai/plugin";
import { defaultGlobalConfigPath, loadEffectiveConfig, projectConfigPath, readConfig, writeConfig } from "./core/config.ts";
import { buildWingmanRoutingInstruction, parseWingmanChatIntent } from "./core/intent.ts";
import { inferWingmanContext } from "./core/target.ts";
import { resolveConfiguredReviewers, selectReviewers } from "./core/reviewers.ts";
import { runWingmanReview } from "./core/run.ts";
import { createOpenCodeReviewerExecutor } from "./opencode/executor.ts";
import type { CurrentModel, ModelRef } from "./core/types.ts";

const plugin: Plugin = async ({ client, directory }) => {
  const sessionsAwaitingConfirmation = new Set<string>();
  return {
    async config(cfg) {
      const target = cfg as { command?: Record<string, { description: string; template: string }> };
      target.command = {
        ...(target.command ?? {}),
        wingman: {
          description: "Ask standalone Wingman reviewers for a second opinion",
          template: "Use Wingman for this request. Request: $ARGUMENTS\n\nIf the request starts with setup, configure, config, or install, call wingman_setup instead of wingman_review. Otherwise call wingman_review, then synthesize what you accept, what you reject, and the concrete next action. Stop and wait for user confirmation before modifying files or continuing implementation.",
        },
        "wingman:setup": {
          description: "Configure Wingman reviewers",
          template: "Use the wingman_setup tool to configure Wingman reviewers. Request: $ARGUMENTS\n\nIf the request is blank, call wingman_setup with no arguments and show the available reviewer models plus the next /wingman:setup command to run. If the request is four words like 'project gemini google gemini-3.1-pro-preview', pass them as scope, name, provider, and model.",
        },
      };
    },
    async "chat.message"(input, output) {
      sessionsAwaitingConfirmation.delete(input.sessionID);
      for (const part of output.parts as Array<{ type?: string; text?: string }>) {
        if (part.type !== "text" || typeof part.text !== "string") continue;
        const intent = parseWingmanChatIntent(part.text);
        if (!intent) continue;
        part.text = buildWingmanRoutingInstruction(intent, input.model);
        return;
      }
    },
    async "tool.execute.before"(input) {
      if (!sessionsAwaitingConfirmation.has(input.sessionID)) return;
      throw new Error("Wingman returned a second opinion. Synthesize it for the user, then stop and wait for confirmation before using more tools.");
    },
    async "tool.execute.after"(input) {
      if (input.tool === "wingman_review") sessionsAwaitingConfirmation.add(input.sessionID);
    },
    tool: {
      wingman_review: tool({
        description: "Run standalone Wingman reviewers in read-only sessions and return compact synthesis input",
        args: {
          focus: tool.schema.string(),
          reviewerNames: tool.schema.array(tool.schema.string()).optional(),
          reviewerHint: tool.schema.string().optional(),
          targetHint: tool.schema.string().optional(),
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
            executor: createOpenCodeReviewerExecutor({ client, directory: cwd }),
          });
          return result.text;
        },
      }),
      wingman_setup: tool({
        description: "List available reviewer models or write Wingman reviewer configuration",
        args: {
          scope: tool.schema.string().optional(),
          name: tool.schema.string().optional(),
          provider: tool.schema.string().optional(),
          model: tool.schema.string().optional(),
        },
        async execute(args, context) {
          const cwd = context.directory;
          if (!args.provider || !args.model) {
            const models = await listModels(client, cwd);
            const lines = models.map((model) => `- ${model.providerID}/${model.modelID}${model.name && model.name !== model.modelID ? ` (${model.name})` : ""}`);
            return [
              "Available Wingman reviewer models:",
              lines.length ? lines.join("\n") : "No models were returned by OpenCode.",
              "",
              `Run: /wingman:setup project ${suggestedName(models[0])} ${models[0]?.providerID ?? "provider"} ${models[0]?.modelID ?? "model"}`,
            ].join("\n");
          }
          const scope = args.scope === "global" ? "global" : "project";
          const path = scope === "global" ? defaultGlobalConfigPath() : projectConfigPath(cwd);
          const name = args.name?.trim() || args.model.split(/[/:]/).pop()?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "reviewer";
          const existing = await readConfig(path);
          const reviewer = { name, provider: args.provider, model: args.model };
          const config = { ...existing, reviewers: [...existing.reviewers.filter((item) => item.name !== name), reviewer] };
          await writeConfig(path, config);
          return `Wingman ${scope} config saved to ${path} with reviewer ${name} (${args.provider}/${args.model}).`;
        },
      }),
    },
  };
};

async function listModels(client: any, directory: string): Promise<ModelRef[]> {
  if (client.v2?.model?.list) {
    const response = await client.v2.model.list({ location: { directory } });
    const data = response?.data ?? response;
    const items = Array.isArray(data) ? data : data?.items ?? [];
    return items.map((item: any) => ({ providerID: item.providerID ?? item.provider, modelID: item.id ?? item.modelID ?? item.apiID, name: item.name ?? item.id ?? item.modelID ?? item.apiID, reasoning: Boolean(item.reasoning) })).filter((item: ModelRef) => item.providerID && item.modelID);
  }
  const response = await client.provider?.list?.({ query: { directory } });
  const data = response?.data ?? response;
  const providers = Array.isArray(data) ? data : data?.all ?? [];
  return providers.flatMap((provider: any) => Object.entries(provider.models ?? {}).map(([key, value]) => {
    const model = value as Record<string, unknown>;
    const modelID = typeof model.id === "string" ? model.id : key;
    return { providerID: provider.id, modelID, name: typeof model.name === "string" ? model.name : modelID, reasoning: Boolean(model.reasoning) };
  })).filter((item: ModelRef) => item.providerID && item.modelID);
}

function suggestedName(model: ModelRef | undefined): string {
  const raw = model?.name ?? model?.modelID ?? "reviewer";
  return raw.split(/[/:]/).pop()?.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "reviewer";
}

export default plugin;
