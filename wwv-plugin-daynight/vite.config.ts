import { defineConfig } from "vite";
import { wwvPluginGlobals } from "@worldwideview/wwv-plugin-sdk";

export default defineConfig({
  plugins: [wwvPluginGlobals()],
  build: {
    lib: {
      entry: "src/index.ts",
      formats: ["es"],
      fileName: () => "frontend.mjs",
    },
    minify: true,
    sourcemap: false,
  },
});
