import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { lzmaPureJsPlugin } from "../sdk/build/lzmaPureJsPlugin.js";

export default defineConfig({
  // Relative assets work both at localhost and under the repository Pages path.
  base: "./",
  // The browser entry resolves the workspace SDK source through tsconfig paths.
  // Keep lzma-purejs' AMD wrapper out of the browser bundle as well.
  plugins: [lzmaPureJsPlugin(), vue()],
  resolve: {
    alias: [
      { find: "shuofang-t50-sdk/browser", replacement: resolve(import.meta.dirname, "../sdk/src/browser.ts") },
      { find: "shuofang-t50-sdk", replacement: resolve(import.meta.dirname, "../sdk/src/index.ts") },
    ],
  },
  // lzma-purejs ships as AMD. Let the custom transform handle it instead of
  // Vite's dependency optimizer wrapping it with amdefine at runtime.
  optimizeDeps: {
    exclude: ["lzma-purejs"],
  },
  server: {
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 700,
    // Pages' bundle guard scans generated files; source maps would include
    // the dependency's original AMD wrapper text and trigger a false alarm.
    sourcemap: false,
  },
});
