import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

import { lzmaPureJsPlugin } from "../sdk/build/lzmaPureJsPlugin.js";

export default defineConfig({
  // Relative assets work both at localhost and under the repository Pages path.
  base: "./",
  // The browser entry resolves the workspace SDK source through tsconfig paths.
  // Keep lzma-purejs' AMD wrapper out of the browser bundle as well.
  plugins: [lzmaPureJsPlugin(), vue()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 700,
    sourcemap: true,
  },
});
