import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative assets work both at localhost and under the repository Pages path.
  base: "./",
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 700,
    sourcemap: true,
  },
});
