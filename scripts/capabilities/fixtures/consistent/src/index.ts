export default class Fixture {
    id = "fixture-consistent";

    async fetch() {
        const response = await globalThis.fetch("/api/fixture");
        return response.json();
    }

    getLayerConfig() {
        return { color: "#ffffff" };
    }

    renderEntity(entity: { latitude: number }) {
        return { type: "point", size: 4 };
    }
}
