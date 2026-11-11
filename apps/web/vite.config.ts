import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: Number(process.env.WEB_PORT??5173),
    strictPort: true,
    proxy: { "/api": { target: process.env.API_PROXY??"http://127.0.0.1:4000", ws: true } },
  },
  build: { chunkSizeWarningLimit: 650 },
});
