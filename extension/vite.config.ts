import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync } from "fs";

/**
 * Vite config for the Chrome Extension.
 * Multi-entry build (side panel + background + content script) + static copy
 * of manifest.json and icons.
 */
function copyStaticPlugin() {
  return {
    name: "copy-static-assets",
    closeBundle() {
      const src = resolve(__dirname, "public");
      const dst = resolve(__dirname, "dist");
      const walk = (from: string, to: string) => {
        if (!existsSync(from)) return;
        mkdirSync(to, { recursive: true });
        for (const entry of readdirSync(from)) {
          const s = resolve(from, entry);
          const d = resolve(to, entry);
          if (statSync(s).isDirectory()) walk(s, d);
          else copyFileSync(s, d);
        }
      };
      walk(src, dst);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticPlugin()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        background: resolve(__dirname, "src/background/service-worker.ts"),
        content: resolve(__dirname, "src/content/content-script.ts"),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "content") return "content.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
    target: "es2022",
    minify: "esbuild",
  },
});
