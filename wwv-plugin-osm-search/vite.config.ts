import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { wwvPluginGlobals } from "@worldwideview/wwv-plugin-sdk";

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
    outDir: "dist"
  }
});
