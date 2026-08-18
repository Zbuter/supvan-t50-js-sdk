import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
  },
  build: {
    chunkSizeWarningLimit: 700,
    sourcemap: true,
  },
});
