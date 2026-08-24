import { Newspaper } from "lucide-react";
import {
    dtProp,
    urlProp,
    type WorldPlugin,
    type GeoEntity,
    type TimeRange,
    type PluginContext,
    type LayerConfig,
    type CesiumEntityOptions,
    type FilterDefinition,
    type ServerPluginConfig,
} from "@worldwideview/wwv-plugin-sdk";
import pkg from "../package.json";

/** Raw shape of one item from the global news (GDELT) data engine. */
interface NewsItem {
    id: string;
    url: string | null;
    title: string | null;
    domain: string | null;
    language: string | null;
    lat: number | null;
    lon: number | null;
    tone: number | null;
    mentions: number | null;
    mentionedThemes: string | null;
    publishedAt: string | null;
    sourceCountry: string | null;
}

function toneValue(tone: number | null): number | null {
    return typeof tone === "number" && Number.isFinite(tone) ? tone : null;
}

/** Negative tone is red, positive green, neutral/absent gray. */
function toneColor(tone: number | null): string {
    const t = toneValue(tone);
    if (t === null || t === 0) return "#6b7280";
    return t < 0 ? "#ef4444" : "#22c55e";
}

function toneBand(tone: number | null): string {
    const t = toneValue(tone);
    if (t === null || t === 0) return "neutral";
    return t < 0 ? "negative" : "positive";
}

/** Section size by sentiment magnitude (mentions may be null in the payload, so tone drives size). */
function toneSize(tone: number | null): number {
    const t = toneValue(tone);
    return 3 + Math.min(9, Math.abs(t ?? 0) * 0.45);
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * GDELT publishedAt arrives as non-ISO "MM/dd/yyyy HH:mm:ss" (sometimes with am/pm)
 * and carries no timezone. Interpret the wall-clock as UTC (deterministic, machine
 * independent) and normalize to ISO; returns null for unparseable input.
 */
function toIsoUtc(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw.trim());
    if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        // Disambiguate MM/dd vs dd/MM: a value > 12 cannot be a month.
        const month = a > 12 ? b : a;
        const day = a > 12 ? a : b;
        const year = parseInt(m[3], 10);
        let hour = parseInt(m[4], 10);
        const min = parseInt(m[5], 10);
        const sec = m[6] ? parseInt(m[6], 10) : 0;
        const meridian = m[7] ? m[7].toLowerCase() : null;
        if (meridian === "pm" && hour < 12) hour += 12;
        if (meridian === "am" && hour === 12) hour = 0;
        if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990 || hour > 23 || min > 59 || sec > 59) return null;
        const d = new Date(Date.UTC(year, month - 1, day, hour, min, sec));
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    if (!Number.isNaN(Date.parse(raw))) return new Date(raw).toISOString();
    return null;
}

export class GlobalNewsGdeltPlugin implements WorldPlugin {
    id = "global-news-gdelt";
    name = "Global News (GDELT)";
    description = "Global news article locations from GDELT via the data engine, tone-colored by sentiment";
    icon = Newspaper;
    category = "intelligence" as const;
    version = pkg.version;

    private context: PluginContext | null = null;

    async initialize(ctx: PluginContext): Promise<void> { this.context = ctx; }
    destroy(): void { this.context = null; }

    async fetch(_timeRange: TimeRange): Promise<GeoEntity[]> {
        try {
            const engineBase = this.context?.getEngineUrl() || "https://dataenginev2.worldwideview.dev";
            const res = await globalThis.fetch(`${engineBase}/api/global-news-gdelt`);
            if (!res.ok) throw new Error(`Global news GDELT API returned ${res.status}`);
            const data = await res.json();
            if (!data.items || !Array.isArray(data.items)) return [];

            return data.items
                .map((item: NewsItem): GeoEntity | null => {
                    const lat = Number(item.lat);
                    const lon = Number(item.lon);
                    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                    const tone = toneValue(item.tone);
                    const publishedIso = toIsoUtc(item.publishedAt);
                    return {
                        id: item.id,
                        pluginId: this.id,
                        latitude: lat,
                        longitude: lon,
                        timestamp: publishedIso ? new Date(publishedIso) : new Date(),
                        label: truncate(item.title || item.domain || "News", 60),
                        properties: {
                            title: item.title,
                            domain: item.domain,
                            language: item.language,
                            tone,
                            mentions: item.mentions,
                            mentionedThemes: item.mentionedThemes,
                            sourceCountry: item.sourceCountry,
                            tone_band: toneBand(tone),
                            publishedAt: dtProp(publishedIso),
                            url: urlProp(item.url || item.id),
                        },
                    };
                })
                .filter((entity: GeoEntity | null): entity is GeoEntity => entity !== null);
        } catch (err) {
            console.error("[GlobalNewsGdeltPlugin] Fetch error:", err);
            return [];
        }
    }

    getPollingInterval(): number { return 0; }

    getServerConfig(): ServerPluginConfig {
        return {
            streamUrl: "wss://dataenginev2.worldwideview.dev/stream",
            apiBasePath: "/api/global-news-gdelt",
            pollingIntervalMs: 0,
            historyEnabled: true,
        };
    }

    getLayerConfig(): LayerConfig {
        return {
            color: "#22c55e",
            clusterEnabled: true,
            clusterDistance: 30,
            maxEntities: 10000,
        };
    }

    renderEntity(entity: GeoEntity): CesiumEntityOptions {
        const tone = toneValue(entity.properties.tone as number | null);
        return {
            type: "point",
            color: toneColor(tone),
            size: toneSize(tone),
            outlineColor: "#1e293b",
            outlineWidth: 1,
            labelText: entity.label,
        };
    }

    getFilterDefinitions(): FilterDefinition[] {
        return [
            {
                id: "tone", label: "Tone", type: "range",
                propertyKey: "tone", range: { min: -20, max: 8, step: 1 },
            },
            {
                id: "tone_band", label: "Sentiment", type: "select", propertyKey: "tone_band",
                options: [
                    { value: "negative", label: "Negative (tone < 0)" },
                    { value: "neutral", label: "Neutral (tone = 0)" },
                    { value: "positive", label: "Positive (tone > 0)" },
                ],
            },
        ];
    }

    getLegend(): { label: string; color: string; filterId?: string; filterValue?: string }[] {
        return [
            { label: "Negative tone", color: "#ef4444", filterId: "tone_band", filterValue: "negative" },
            { label: "Neutral tone", color: "#6b7280", filterId: "tone_band", filterValue: "neutral" },
            { label: "Positive tone", color: "#22c55e", filterId: "tone_band", filterValue: "positive" },
        ];
    }
}