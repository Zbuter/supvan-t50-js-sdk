import { resolve } from "node:path";
import { defineConfig } from "vite";

import { lzmaPureJsPlugin } from "./build/lzmaPureJsPlugin.js";

export default defineConfig({
  plugins: [lzmaPureJsPlugin()],
  build: {
    emptyOutDir: false,
    target: "es2018",
    lib: {
      entry: resolve(import.meta.dirname, "src/wechat.ts"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    outDir: resolve(import.meta.dirname, "miniprogram"),
    sourcemap: true,
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});
