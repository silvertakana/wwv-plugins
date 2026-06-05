# Contributing to wwv-plugins

## Getting Started

```bash
pnpm install
pnpm --filter @worldwideview/wwv-plugin-<name> build
```

## Plugin Structure

Each plugin lives in its own directory under `local-plugins/` and is a standalone npm package. The entry point is `src/index.ts` (or `src/index.tsx` for plugins with custom components).

## Property Conventions

Use SDK tag helpers to enable rich rendering in the WorldWideView Intel panel.

| Helper | Use for | Panel output |
|---|---|---|
| `dtProp(iso)` | ISO 8601 date/time strings | Expandable datetime row (local + UTC + relative) |
| `urlProp(href)` | External links | Clickable link with icon |
| `imageProp(src)` | Image URLs | Inline thumbnail |
| `videoProp(href)` | Video or stream URLs | "Watch" link with play icon |

```ts
import { dtProp, urlProp, imageProp, videoProp } from "@worldwideview/wwv-plugin-sdk";

// In your entity mapper:
properties: {
    updated_at:  dtProp(item.timestamp ?? null),
    source_url:  urlProp(item.url ?? null),
    preview:     imageProp(item.image_url ?? null),
    stream:      videoProp(item.stream_url ?? null),
    name:        item.name,   // plain values need no wrapper
}
```

All helpers return `null` for empty input — the panel skips null properties cleanly.

## Rendering Rules

- Entity type `"point"`: use `color`, `size`, `outlineColor`, `outlineWidth`
- Entity type `"billboard"`: use `iconUrl`, `iconScale`, `color` — never mix in point properties

Use `createSvgIconUrl(Icon, { color })` from the SDK for billboard icons.

## Versioning

- `feat:` changes bump the minor version
- `fix:` and `refactor:` bump the patch version

Bump the version in the plugin's `package.json` before opening a PR.
