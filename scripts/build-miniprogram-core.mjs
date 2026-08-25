import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

await build({
  configFile: resolve(workspaceRoot, "miniprogram/vite.core.config.mts"),
  mode: "production",
});
