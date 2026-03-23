import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    port: 5183,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:4700",
        changeOrigin: true,
      },
    },
  },
});
