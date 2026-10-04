import { describe, it, expect, vi } from "vitest";
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

describe("queryOverpass", () => {
    it("returns elements from the first mirror that answers usefully", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ elements: [{ id: 1 }] }));
        const elements = await queryOverpass("nwr[amenity=cafe](1,2,3,4);out center;", fetchImpl as unknown as typeof fetch);
        expect(elements).toEqual([{ id: 1 }]);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0][0]).toBe(OVERPASS_MIRRORS[0]);
    });

    it("sends a CORS-simple form-urlencoded body carrying the query", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
        await queryOverpass("out center;", fetchImpl as unknown as typeof fetch);
        const [, init] = fetchImpl.mock.calls[0];
        expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(init.body).toBe("data=" + encodeURIComponent("out center;"));
    });

    it("falls through when a mirror answers HTTP 200 with a non-JSON error page", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(textResponse("<html>rate limited</html>"))
            .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 7 }] }));
        const elements = await queryOverpass("out center;", fetchImpl as unknown as typeof fetch);
        expect(elements).toEqual([{ id: 7 }]);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("falls through on a non-2xx status and on an empty body", async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(textResponse("nope", 504))
            .mockResolvedValueOnce(jsonResponse({ remark: "runtime error: query timed out" }))
            .mockResolvedValueOnce(jsonResponse({ elements: [{ id: 3 }] }));
        const elements = await queryOverpass("out center;", fetchImpl as unknown as typeof fetch);
        expect(elements).toEqual([{ id: 3 }]);
        expect(fetchImpl).toHaveBeenCalledTimes(3);
    });

    it("reports every mirror failure when none succeed", async () => {
        const fetchImpl = vi.fn().mockResolvedValue(textResponse("down", 500));
        await expect(queryOverpass("out center;", fetchImpl as unknown as typeof fetch))
            .rejects.toThrow(/All Overpass mirrors failed/);
        await expect(queryOverpass("out center;", fetchImpl as unknown as typeof fetch))
            .rejects.toThrow(/HTTP 500/);
        expect(fetchImpl).toHaveBeenCalledTimes(OVERPASS_MIRRORS.length * 2);
    });
});
