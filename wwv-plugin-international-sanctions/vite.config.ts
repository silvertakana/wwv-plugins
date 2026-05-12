import { defineConfig } from "vite";
import { wwvPluginGlobals } from "@worldwideview/wwv-plugin-sdk";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react(), wwvPluginGlobals()],
  build: {
    minify: "esbuild",
    lib: {
      entry: "src/index.tsx",
      name: "Plugin",
      formats: ["es"],
      fileName: () => "frontend.mjs",
    },
    outDir: "dist",
    }
});
