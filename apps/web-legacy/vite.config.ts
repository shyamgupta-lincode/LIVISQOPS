import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.LIVIS_API || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.LIVIS_WEB_PORT || 5173),
    proxy: {
      "/api": api,
      "/ws": { target: api.replace(/^http/, "ws"), ws: true },
    },
  },
});
