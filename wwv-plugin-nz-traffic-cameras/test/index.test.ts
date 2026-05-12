import { describe, it, expect } from "vitest";
import NzTrafficCamerasPlugin from "../src/index";

describe("NzTrafficCamerasPlugin", () => {
    it("should initialize with correct metadata", () => {
        const plugin = new NzTrafficCamerasPlugin();
        expect(plugin.id).toBe("nz-traffic-cameras");
        expect(plugin.name).toBe("NZ Traffic Cameras");
    });
});
