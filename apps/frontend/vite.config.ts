import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/uploads": {
        target:'http://localhost:5000/uploads',
        rewrite: (path) => path.replace(/^\/uploads/, ""),
      },
      // WebSocket: usar regex para matchear TANTO `/ws` (existente,
      // broadcasts reactivos de checklist/etc) COMO `/ws/chat` (nuevo,
      // chat interno). Con path-to-regexp, un string es match EXACTO
      // — `/ws` solo matchea `/ws`, no `/ws/chat`. Con regex prefijo
      // matcheamos todo lo que empiece con `/ws`.
      "^/ws(/.*)?$": {
        target: "http://localhost:5000",
        ws: true,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
    },
  },
});