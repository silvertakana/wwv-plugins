/**
 * Capability detection: what a plugin declares, and what it is observed doing.
 *
 * A capability is a claim about what a plugin does to the host and its
 * surroundings. The manifest declares the claim (worldwideview.capabilities,
 * schema/plugin-manifest.schema.json); this file derives the observed set from
 * the plugin's own runtime source, and the CI check fails on either direction
 * of mismatch:
 *
 *   - declares a capability with no evidence  -> the claim is not true
 *   - uses a capability with no declaration   -> the claim is incomplete
 *
 * Detection is deliberately lexical and conservative. A capability is observed
 * only when the plugin's own runtime source contains the signal below; nothing
 * is inferred from the manifest's format or type fields, because that inference
 * is exactly the habit this check exists to remove. The trade-off is that
 * detection can miss use (a plugin that fetches through a helper library),
 * never invent it. When a capability is added to the schema it needs a
 * detector here - validate.mjs asserts the two lists are identical.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SOURCE_EXTENSIONS = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/u;

/** Directories that hold no plugin runtime source. */
const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.cache', '.git']);

/**
 * "Runtime source" means the files that end up in the published bundle: the
 * plugin's own src/ tree. Everything else is excluded, because a capability is a
 * claim about what runs inside a user's globe:
 *
 *   - build-time data scripts (scripts/fetch-data.mjs, download.mjs) run in the
 *     data-refresh workflow, never at runtime;
 *   - vite/vitest configs and *.d.ts shims are build machinery;
 *   - tests and fixtures prove nothing about the shipped plugin.
 */
const RUNTIME_ROOT = 'src';
const SKIP_PATH_PATTERN = /(?:^|\/)(?:scripts|test|tests|__tests__)\//u;
const SKIP_FILENAME_PATTERN = /\.(?:test|spec)\.[a-z]+$|(?:\.config\.[a-z]+$)|(?:\.d\.[a-z]+$)/u;

const QUOTE_START = '[\\x22\\x27\\x60]';

/**
 * capability id -> { what, manifest?, signals? }
 *
 * A `manifest` function inspects the parsed package.json and the package file
 * list; `signals` are regexes matched against the concatenated runtime source.
 */
export const DETECTORS = {
  'data:own': {
    what: 'ships its own dataset inside the package instead of only fetching at runtime',
    manifest: (manifest, files) => {
      const dataFile = manifest.worldwideview?.dataFile;
      if (typeof dataFile === 'string' && dataFile.length > 0) {
        return 'worldwideview.dataFile = ' + dataFile;
      }
      const shipped = files.find((file) => /(?:^|\/)data\/[^/]+\.json$/u.test(file));
      return shipped ? 'ships ' + shipped : null;
    },
  },
  'layer': {
    what: 'registers a toggleable data layer with the globe',
    signals: [{ re: /\bgetLayerConfig\s*\(/u, why: 'defines getLayerConfig()' }],
  },
  'globe:overlay': {
    what: 'draws entities on the globe itself',
    signals: [{ re: /\brenderEntity\s*\(/u, why: 'defines renderEntity()' }],
  },
  'globe:camera': {
    what: 'moves the globe camera',
    signals: [
      { re: /\.flyTo\s*\(/u, why: 'calls camera flyTo()' },
      { re: /camera\.setView\s*\(/u, why: 'calls camera.setView()' },
    ],
  },
  'network:fetch': {
    what: 'makes outbound network requests at runtime',
    signals: [
      { re: /\b(?:globalThis|window|self)\.fetch\s*\(/u, why: 'calls fetch() on the global object' },
      { re: /\bawait\s+fetch\s*\(/u, why: 'awaits a bare fetch() call' },
      { re: new RegExp('(?<![\\w.$])fetch\\s*\\(\\s*' + QUOTE_START, 'u'), why: 'calls fetch() with a literal URL' },
      { re: /new\s+WebSocket\s*\(/u, why: 'opens a WebSocket' },
      { re: /new\s+XMLHttpRequest\s*\(/u, why: 'opens an XMLHttpRequest' },
      { re: /\bsendBeacon\s*\(/u, why: 'calls navigator.sendBeacon()' },
    ],
  },
  'storage:read': {
    what: 'reads from browser storage',
    signals: [
      { re: /localStorage\.getItem\s*\(/u, why: 'reads localStorage' },
      { re: /sessionStorage\.getItem\s*\(/u, why: 'reads sessionStorage' },
    ],
  },
  'storage:write': {
    what: 'writes to browser storage',
    signals: [
      { re: /localStorage\.(?:setItem|removeItem|clear)\s*\(/u, why: 'writes localStorage' },
      { re: /sessionStorage\.(?:setItem|removeItem|clear)\s*\(/u, why: 'writes sessionStorage' },
    ],
  },
  'ui:detail-panel': {
    what: 'contributes a detail panel',
    signals: [{ re: /(?:renderDetail\s*\(|\bDetailPanel\b)/u, why: 'defines a detail panel' }],
  },
  'ui:settings': {
    what: 'contributes a settings surface',
    signals: [{ re: /(?:getSettings\s*\(|\bsettingsSchema\b|\bSettingsPanel\b)/u, why: 'defines a settings surface' }],
  },
  'ui:sidebar': {
    what: 'contributes a sidebar surface',
    signals: [{ re: /(?:getSidebar\s*\(|\bSidebarPanel\b|\bSidebarTab\b)/u, why: 'defines a sidebar surface' }],
  },
  'ui:toolbar': {
    what: 'contributes a toolbar control',
    signals: [{ re: /(?:getToolbar\s*\(|\bToolbarButton\b|\bToolbarControl\b)/u, why: 'defines a toolbar control' }],
  },
};

/** Every file in the plugin directory, relative and slash-separated. */
export function listFiles(pluginDir) {
  const files = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        visit(join(dir, entry.name));
      } else {
        files.push(relative(pluginDir, join(dir, entry.name)).split(sep).join('/'));
      }
    }
  };
  visit(pluginDir);
  return files.sort();
}

/** Runtime source files, relative to the plugin directory. */
export function listSourceFiles(pluginDir, files = listFiles(pluginDir)) {
  const hasSrc = files.some((rel) => rel.startsWith(RUNTIME_ROOT + '/'));
  return files.filter((rel) => {
    if (!SOURCE_EXTENSIONS.test(rel)) return false;
    if (hasSrc && !rel.startsWith(RUNTIME_ROOT + '/')) return false;
    if (SKIP_PATH_PATTERN.test(rel)) return false;
    if (SKIP_FILENAME_PATTERN.test(rel)) return false;
    return true;
  });
}

/**
 * @param {string} pluginDir absolute path to a plugin directory
 * @param {object} manifest its parsed package.json
 * @returns {{ declared: string[], observed: string[], evidence: Record<string, string> }}
 */
export function detect(pluginDir, manifest) {
  const files = listFiles(pluginDir);
  const sourceFiles = listSourceFiles(pluginDir, files);
  const sources = sourceFiles.map((rel) => ({ rel, text: readFileSync(join(pluginDir, rel), 'utf8') }));
  const declared = Array.isArray(manifest.worldwideview?.capabilities)
    ? manifest.worldwideview.capabilities.map(String)
    : [];

  const observed = [];
  const evidence = {};

  for (const capability of Object.keys(DETECTORS).sort()) {
    const detector = DETECTORS[capability];

    if (typeof detector.manifest === 'function') {
      const found = detector.manifest(manifest, files);
      if (found) {
        observed.push(capability);
        evidence[capability] = found;
        continue;
      }
    }

    let hit = null;
    for (const signal of detector.signals ?? []) {
      for (const source of sources) {
        if (!signal.re.test(source.text)) continue;
        const line = source.text.slice(0, source.text.search(signal.re)).split('\n').length;
        hit = signal.why + ' at ' + source.rel + ':' + line;
        break;
      }
      if (hit) break;
    }

    if (hit) {
      observed.push(capability);
      evidence[capability] = hit;
    }
  }

  return { declared, observed, evidence, sourceFiles };
}

/** Both directions of the claim. */
export function diff(declared, observed) {
  const declaredSet = new Set(declared);
  const observedSet = new Set(observed);
  return {
    overDeclared: [...declaredSet].filter((capability) => !observedSet.has(capability)).sort(),
    undeclared: [...observedSet].filter((capability) => !declaredSet.has(capability)).sort(),
  };
}

export function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((value, index) => value === sortedB[index]);
}
