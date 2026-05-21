import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import { runSetupPicker, runWingmanPicker } from "./flows.ts";

export default {
  id: "oc-wingman-tui",
  tui: async (api) => {
    api.command?.register(() => [
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
