import { resolve } from "node:path";
import { defineConfig } from "vite";

import { lzmaPureJsPlugin } from "../sdk/build/lzmaPureJsPlugin.ts";

export default defineConfig({
  plugins: [lzmaPureJsPlugin()],
  build: {
    target: "es2018",
    minify: true,
    sourcemap: false,
    emptyOutDir: true,
    lib: {
      entry: resolve(import.meta.dirname, "build/t50-core-entry.ts"),
      formats: ["cjs"],
      fileName: () => "t50-core.js",
    },
    outDir: resolve(import.meta.dirname, "vendor"),
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
});
