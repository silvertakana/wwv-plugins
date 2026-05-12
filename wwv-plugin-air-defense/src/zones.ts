export interface AdizZone {
    id: string;
    name: string;
    country: string;
    type: "ADIZ" | "Restricted";
    status: string;
    centerLat: number;
    centerLon: number;
    polygon: [number, number][]; // [lon, lat] points
}

export const ADIZ_ZONES: AdizZone[] = [
    {
        id: "taiwan-adiz",
        name: "Taiwan ADIZ",
        country: "Taiwan",
        type: "ADIZ",
        status: "Active monitoring",
        centerLat: 23.5,
        centerLon: 121,
        polygon: [
            [117.5, 21],
            [117.5, 29],
            [123, 29],
            [124.5, 24.5],
            [124.5, 21],
            [117.5, 21],
        ],
    },
    {
        id: "china-adiz",
        name: "East China Sea ADIZ",
        country: "China",
        type: "ADIZ",
        status: "Claimed active",
        centerLat: 29.5,
        centerLon: 125,
        polygon: [
            [121, 33],
            [125, 33],
            [128, 30],
            [125, 25],
            [121, 26],
            [121, 33],
        ],
    },
    {
        id: "kadiz",
        name: "KADIZ (South Korea)",
        country: "South Korea",
        type: "ADIZ",
        status: "Active monitoring",
        centerLat: 36,
        centerLon: 128,
        polygon: [
            [123, 33],
            [123, 37],
            [125, 39],
            [131, 39],
            [132, 36],
            [128, 32],
            [123, 33],
        ],
    },
    {
        id: "jadiz",
        name: "JADIZ (Japan)",
        country: "Japan",
        type: "ADIZ",
        status: "Active monitoring",
        centerLat: 35,
        centerLon: 138,
        polygon: [
            [122, 23],
            [122, 30],
            [131, 39],
            [138, 46],
            [146, 46],
            [146, 25],
            [134, 25],
            [122, 23],
        ],
    },
    {
        id: "us-adiz-alaska",
        name: "US ADIZ (Alaska)",
        country: "USA",
        type: "ADIZ",
        status: "Active monitoring",
        centerLat: 64,
        centerLon: -150,
        polygon: [
            [-130, 54],
            [-145, 54],
            [-165, 50],
            [-175, 55],
            [-170, 70],
            [-140, 70],
            [-130, 54],
        ],
    },
];
