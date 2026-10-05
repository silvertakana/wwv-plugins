import type { PluginManifest } from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";

export const manifest: PluginManifest = {
    id: "osm-search",
    name: "OSM Search",
    version: pkg.version,
    description: "Configurable Overpass API search. Includes Bellingcat-style proximity search and Overpass Turbo raw QL.",
    type: "data-layer",
    format: "bundle",
    trust: "built-in",
    capabilities: ["network:fetch", "ui:sidebar"],
    category: "custom"
};
