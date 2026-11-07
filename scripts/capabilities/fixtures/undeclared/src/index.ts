export default class Fixture {
    id = "fixture-undeclared";

    async fetch() {
        const response = await globalThis.fetch("/api/fixture");
        return response.json();
    }

    getLayerConfig() {
        return { color: "#ffffff" };
    }
}
