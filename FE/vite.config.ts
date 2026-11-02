import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: process.env.DEV_API_PROXY_TARGET
      ? {
          "/api/": { target: process.env.DEV_API_PROXY_TARGET },
          "/socket.io/": { target: process.env.DEV_API_PROXY_TARGET, ws: true },
        }
      : undefined,
  },
});
