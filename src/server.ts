import { tool, type Plugin } from "@opencode-ai/plugin";
import { loadEffectiveConfig } from "./core/config.ts";
import { buildWingmanRoutingInstruction, parseWingmanChatIntent } from "./core/intent.ts";
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
          template: "Wingman setup is handled by the oc-wingman TUI command. Open the command palette and choose Wingman Setup, or restart OpenCode if the command is not visible after installing oc-wingman.",
        },
      };
    },
    async "chat.message"(input, output) {
      for (const part of output.parts as Array<{ type?: string; text?: string }>) {
        if (part.type !== "text" || typeof part.text !== "string") continue;
        const intent = parseWingmanChatIntent(part.text);
        if (!intent) continue;
        part.text = buildWingmanRoutingInstruction(intent, input.model);
        return;
      }
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

export default plugin;
