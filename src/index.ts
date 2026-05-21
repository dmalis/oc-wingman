import serverPlugin from "./server.ts";
import tuiPlugin from "./tui/index.ts";

const plugin = Object.assign(serverPlugin, {
  id: tuiPlugin.id,
  tui: tuiPlugin.tui,
});

export default plugin;
export { default as server } from "./server.ts";
export { default as tui } from "./tui/index.ts";
