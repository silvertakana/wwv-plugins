import type { GeoEntity } from "@worldwideview/wwv-plugin-sdk";

export interface LookedUpNumber {
    input: string;
    countryCode: string;
    countryName: string;
    numberType: string;
    internationalFormat: string;
    nationalFormat: string;
    e164Format: string;
    latitude: number;
    longitude: number;
}

// Session-only, in-memory -- lookups don't persist across reloads.
let numbers: LookedUpNumber[] = [];
let notifyDataUpdate: ((entities: GeoEntity[]) => void) | null = null;

export function setDataUpdateCallback(cb: (entities: GeoEntity[]) => void): void {
    notifyDataUpdate = cb;
}

function toEntities(): GeoEntity[] {
    const now = new Date();
    return numbers.map((n, i) => ({
        id: `phone-lookup-${i}-${n.input}`,
        pluginId: "phone-lookup",
        latitude: n.latitude,
        longitude: n.longitude,
        timestamp: now,
        label: n.internationalFormat,
        properties: {
            number: n.internationalFormat,
            national_format: n.nationalFormat,
            e164_format: n.e164Format,
            country: n.countryName,
            number_type: n.numberType,
            accuracy_note: "Based on the number's dialing-code format only -- this shows the registered country/region, not a real-time device location. No carrier-name data is available for free without a paid lookup service.",
        },
    }));
}

export function addLookedUpNumber(n: LookedUpNumber): void {
    numbers = [...numbers, n];
    notifyDataUpdate?.(toEntities());
}

export function getCurrentEntities(): GeoEntity[] {
    return toEntities();
}
