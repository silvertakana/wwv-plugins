import { describe, it, expect, vi, afterEach } from "vitest";
import { OVERPASS_MIRRORS, queryOverpass } from "../src/lib/overpass";

function jsonResponse(body: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    } as unknown as Response;
}

function textResponse(body: string, status = 200) {
    return { ok: status >= 200 && status < 300, status, text: async () => body } as unknown as Response;
}

const fetchImpl = (mock: ReturnType<typeof vi.fn>) => mock as unknown as typeof fetch;

afterEach(() => {
    vi.restoreAllMocks();
});

describe("queryOverpass", () => {
    it("returns elements from the first mirror that answers usefully", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ elements: [{ id: 1 }] }));
        const elements = await queryOverpass("nwr[amenity=cafe](1,2,3,4);out center;", fetchImpl(mock));
        expect(elements).toEqual([{ id: 1 }]);
        expect(mock).toHaveBeenCalledTimes(1);
        expect(mock.mock.calls[0][0]).toBe(OVERPASS_MIRRORS[0]);
    });

    it("sends a CORS-simple form-urlencoded body carrying the query", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
        await queryOverpass("out center;", fetchImpl(mock));
        const [, init] = mock.mock.calls[0];
        expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(init.body).toBe("data=" + encodeURIComponent("out center;"));
    });

    it("falls through when a mirror answers HTTP 200 with a non-JSON error page", async () => {
        const mock = vi.fn()
            .mockResolvedValueOnce(textResponse("<html>rate limited</html>"))
            .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 7 }] }));
        const elements = await queryOverpass("out center;", fetchImpl(mock));
        expect(elements).toEqual([{ id: 7 }]);
        expect(mock).toHaveBeenCalledTimes(2);
    });

    it("falls through on a non-2xx status and on a body with no elements array", async () => {
        const mock = vi.fn()
            .mockResolvedValueOnce(textResponse("nope", 504))
            .mockResolvedValueOnce(jsonResponse({ remark: "runtime error: query timed out" }))
            .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 3 }] }));
        const elements = await queryOverpass("out center;", fetchImpl(mock));
        expect(elements).toEqual([{ id: 3 }]);
        expect(mock).toHaveBeenCalledTimes(3);
    });

    it("treats a 200 soft error as a failure and tries the next mirror", async () => {
        // Overpass reports a timed-out or failed query as HTTP 200 with an empty
        // elements array AND a remark. Returning that as a successful empty search
        // would hide the failure and skip the mirrors that could have answered.
        const mock = vi.fn()
            .mockResolvedValueOnce(jsonResponse({ elements: [], remark: "runtime error: Query timed out" }))
            .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 42 }] }));

        const elements = await queryOverpass("out center;", fetchImpl(mock));

        expect(elements).toEqual([{ id: 42 }]);
        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock.mock.calls[1][0]).toBe(OVERPASS_MIRRORS[1]);
    });

    it("keeps a genuine empty result as a success and does not try further mirrors", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));

        const elements = await queryOverpass("out center;", fetchImpl(mock));

        expect(elements).toEqual([]);
        expect(mock).toHaveBeenCalledTimes(1);
    });

    it("reports the soft error in the thrown message when every mirror has one", async () => {
        const mock = vi.fn().mockResolvedValue(jsonResponse({ elements: [], remark: "runtime error: Query timed out" }));

        await expect(queryOverpass("out center;", fetchImpl(mock)))
            .rejects.toThrow(/runtime error: Query timed out/);
        expect(mock).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length);
    });

    it("reports every mirror failure when none succeed", async () => {
        const mock = vi.fn().mockResolvedValue(textResponse("down", 500));
        await expect(queryOverpass("out center;", fetchImpl(mock)))
            .rejects.toThrow(/All Overpass mirrors failed/);
        await expect(queryOverpass("out center;", fetchImpl(mock)))
            .rejects.toThrow(/HTTP 500/);
        expect(mock).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length * 2);
    });

    it("stops trying mirrors once the shared budget is spent", async () => {
        // Two 25s attempts consume the 30s budget, so the third mirror must not
        // be attempted at all. Date.now() is driven directly, because nothing in
        // the mocked fetch actually waits.
        let clock = 0;
        vi.spyOn(Date, "now").mockImplementation(() => clock);

        const mock = vi.fn().mockImplementation(async (url: string) => {
            clock += 25_000;
            throw Object.assign(new Error("aborted"), { name: "AbortError", url });
        });

        await expect(queryOverpass("out center;", fetchImpl(mock)))
            .rejects.toThrow(/no time left in the shared budget/);

        expect(mock).toHaveBeenCalledTimes(2);
        expect(mock.mock.calls.map((call) => call[0])).toEqual([OVERPASS_MIRRORS[0], OVERPASS_MIRRORS[1]]);
    });
});
