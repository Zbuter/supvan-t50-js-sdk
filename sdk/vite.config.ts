import { resolve } from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

import { lzmaPureJsPlugin } from "./build/lzmaPureJsPlugin.js";

export default defineConfig({
  plugins: [
    lzmaPureJsPlugin(),
    dts({
      root: import.meta.dirname,
      tsconfigPath: resolve(import.meta.dirname, "tsconfig.json"),
      outDir: resolve(import.meta.dirname, "dist"),
      entryRoot: resolve(import.meta.dirname, "src"),
      include: [resolve(import.meta.dirname, "src")],
      exclude: ["tests", "build", "vite.config.ts"],
      compilerOptions: { rootDir: resolve(import.meta.dirname, "src") },
      rollupTypes: false,
    }),
  ],
  build: {
    emptyOutDir: true,
    target: "es2018",
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        browser: resolve(import.meta.dirname, "src/browser.ts"),
        wechat: resolve(import.meta.dirname, "src/wechat.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
    },
    outDir: "dist",
    sourcemap: true,
  },
});
