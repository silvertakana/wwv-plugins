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

/**
 * Tried in this order. The order is a measured preference, not a guarantee: the
 * mirrors are independent public instances with different load, so a mirror that
 * answers first today may be the slow one tomorrow. Every mirror stays in the
 * list, and the total budget below bounds the wait when the early ones are slow.
 */
export const OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
];

/** Interactive searches are small; a mirror that has not answered in 25s is not going to. */
const REQUEST_TIMEOUT_MS = 25_000;

/**
 * Ceiling on the whole call across every mirror. Without it, three mirrors at
 * 25s each leave a user staring at a "scanning" state for up to 75s. A mirror
 * only gets an attempt while the remaining budget still covers a real try.
 */
const TOTAL_BUDGET_MS = 30_000;

/** A mirror gets no attempt when less than this remains, because an abort at that point is noise. */
const MIN_ATTEMPT_MS = 1_000;

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
 * A 2xx status alone does not mean success. An overloaded or rate-limiting mirror answers HTTP
 * 200 with an XML/HTML error document, and Overpass reports a soft error (a query timeout, a
 * runtime error) as a 200 whose body carries an empty `elements` array together with a `remark`
 * string. So the body must parse as JSON, carry an `elements` array, and carry no `remark`;
 * a `remark` is a failure and the next mirror is tried.
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
    const deadline = Date.now() + TOTAL_BUDGET_MS;

    for (const mirror of OVERPASS_MIRRORS) {
        // Per-attempt timeout, clamped to what is left of the shared budget, so
        // one hanging mirror cannot spend the whole call on its own.
        const remainingMs = deadline - Date.now();
        if (remainingMs < MIN_ATTEMPT_MS) {
            failures.push(mirror + ": skipped, no time left in the shared budget");
            continue;
        }
        const attemptTimeoutMs = Math.min(REQUEST_TIMEOUT_MS, remainingMs);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
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

            const remark = (parsed as { remark?: string }).remark;
            const elements = (parsed as { elements?: unknown }).elements;
            // A remark marks a soft error whether or not the body also carries an
            // empty elements array, which is how a timed-out query arrives.
            if (remark) {
                failures.push(mirror + ": " + remark);
                continue;
            }
            if (!Array.isArray(elements)) {
                failures.push(mirror + ": no elements in response");
                continue;
            }

            return elements as OverpassElement[];
        } catch (err) {
            const error = err as Error;
            failures.push(mirror + ": " + (error.name === "AbortError" ? "timed out" : error.message));
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error("All Overpass mirrors failed or timed out - " + failures.join("; "));
}
