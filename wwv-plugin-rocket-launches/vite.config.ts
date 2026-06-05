import { defineConfig } from 'vite';
import path from 'path';
import externalGlobals from 'rollup-plugin-external-globals';

const EXTERNAL_GLOBALS = {
    "react": "globalThis.__WWV_HOST__.React",
    "react-dom": "globalThis.__WWV_HOST__.ReactDOM",
    "react/jsx-runtime": "globalThis.__WWV_HOST__.jsxRuntime",
    "@worldwideview/wwv-plugin-sdk": "globalThis.__WWV_HOST__.WWVPluginSDK",
    "cesium": "globalThis.__WWV_HOST__.Cesium",
    "resium": "globalThis.__WWV_HOST__.Resium",
};

export default defineConfig({
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/index.ts'),
            formats: ['es'],
            fileName: () => 'frontend.mjs',
        },
        rollupOptions: {
            external: Object.keys(EXTERNAL_GLOBALS),
            output: {
                globals: EXTERNAL_GLOBALS,
                inlineDynamicImports: true,
                banner: '"use client";',
            },
            plugins: [
                {
                    name: 'replace-process-env',
                    transform(code: string) {
                        if (!code.includes('process.env.NODE_ENV')) return null;
                        return {
                            code: code.replace(/process\.env\.NODE_ENV/g, '"production"'),
                            map: null,
                        };
                    },
                },
                externalGlobals(EXTERNAL_GLOBALS),
            ],
        },
    },
});
