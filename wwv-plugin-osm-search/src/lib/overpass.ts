/**
 * @file overpass.ts
 * @description Direct browser access to the Overpass API for the OSM Search plugin.
 *
 * The plugin previously POSTed to the globe app's `/api/plugins/osm-search` route. That route
 * made the globe host a plugin-specific data endpoint, which contradicts the agnostic-frontend
 * rule: a plugin that needs a third-party API should fetch it itself and declare `network:fetch`.
 * Overpass replies with permissive CORS headers, so the browser can call it directly.
 *
 * The body is sent as `application/x-www-form-urlencoded`, which makes the request CORS-simple:
 * no preflight is issued at all. `application/json` would also work (Overpass answers a JSON body
 * with a server-side 400, so the preflight itself passes), but a simple request removes one
 * round trip and one failure mode.
 */

export const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

/** Interactive searches are small; a mirror that has not answered in 25s is not going to. */
const REQUEST_TIMEOUT_MS = 25_000;

export interface OverpassElement {
    type?: string;
    id?: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
}

/**
 * Run one Overpass QL query, trying each mirror until one returns usable elements.
 *
 * A 2xx status alone does not mean success: an overloaded or rate-limiting mirror answers HTTP
 * 200 with an XML/HTML error document. The body must therefore parse as JSON and carry an
 * `elements` array; `remark` is Overpass's field for a soft error such as a query timeout.
 *
 * @param query Overpass QL source, already interpolated with a bbox and `[out:json]`.
 * @param fetchImpl Injectable fetch, so the mirror fallback can be tested without the network.
 * @returns The `elements` array from the first mirror that answered with a real result.
 * @throws When every mirror fails, with the per-mirror reason preserved in the message.
 */
export async function queryOverpass(
    query: string,
    fetchImpl: typeof fetch = fetch,
): Promise<OverpassElement[]> {
    const failures: string[] = [];

    for (const mirror of OVERPASS_MIRRORS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const res = await fetchImpl(mirror, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: "data=" + encodeURIComponent(query),
                signal: controller.signal,
            });
            const text = await res.text();

            if (!res.ok) {
                failures.push(mirror + ": HTTP " + res.status);
                continue;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(text);
            } catch {
                failures.push(mirror + ": non-JSON response");
                continue;
            }

            const elements = (parsed as { elements?: unknown }).elements;
            if (!Array.isArray(elements)) {
                const remark = (parsed as { remark?: string }).remark;
                failures.push(mirror + ": " + (remark ?? "no elements in response"));
                continue;
            }

            return elements as OverpassElement[];
        } catch (err) {
            const name = (err as Error).name;
            failures.push(mirror + ": " + (name === "AbortError" ? "timed out" : (err as Error).message));
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error("All Overpass mirrors failed or timed out - " + failures.join("; "));
}
