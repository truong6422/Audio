import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "web",
  publicDir: "../public",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist", emptyOutDir: true },
  resolve: { alias: { "@shared": new URL("./shared", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1") } },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:8787", "/media": "http://127.0.0.1:8787", "/sitemap.xml": "http://127.0.0.1:8787" } },
});
