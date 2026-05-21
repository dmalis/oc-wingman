import type { ReviewerExecutor } from "../core/run.ts";

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
      query: query(input),
      body: { title: `Wingman ${reviewer.name}` },
    });
    const sessionID = data(session).id;
    await input.client.session.prompt({
      path: { id: sessionID },
      query: query(input),
      body: {
        model: { providerID: reviewer.provider, modelID: reviewer.model },
        tools: readOnlyToolFlags(),
        system: "You are a read-only reviewer. Do not edit files, write files, commit, or run mutating commands.",
        parts: [{ type: "text", text: prompt }],
      },
    });
    if (input.client.session.wait) await input.client.session.wait({ path: { id: sessionID }, query: query(input) });
    const messages = await input.client.session.messages({ path: { id: sessionID }, query: { ...query(input), limit: 20 } });
    return { output: extractText(data(messages)) };
  };
}

function query(input: { directory: string; workspace?: string }): Record<string, string> {
  return input.workspace ? { directory: input.directory, workspace: input.workspace } : { directory: input.directory };
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
