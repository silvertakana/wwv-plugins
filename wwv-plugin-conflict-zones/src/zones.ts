export interface ConflictZone {
    id: string;
    name: string;
    lat: number;
    lon: number;
    subtext?: string;
    description: string;
    escalationScore: number;
    escalationTrend: "escalating" | "stable" | "de-escalating";
    status: string;
    whyItMatters: string;
    radiusKm: number;
}

export const CONFLICT_ZONES: ConflictZone[] = [
    {
        id: "ukraine-russia",
        name: "Eastern Ukraine / Russian Border",
        lat: 48.0196,
        lon: 37.8028,
        subtext: "High-intensity conventional warfare",
        description: "Active frontline spanning eastern and southern Ukraine, including drone and missile exchanges.",
        escalationScore: 5,
        escalationTrend: "escalating",
        status: "Active Full-Scale Conflict",
        whyItMatters: "Global geopolitical stability, NATO involvement, grain and energy market impacts.",
        radiusKm: 600
    },
    {
        id: "gaza-israel",
        name: "Gaza Strip & Israel",
        lat: 31.5,
        lon: 34.466667,
        subtext: "Urban warfare and regional tension",
        description: "Intense urban warfare in Gaza with frequent missile exchanges and multi-front regional escalations.",
        escalationScore: 5,
        escalationTrend: "stable",
        status: "Active Conflict",
        whyItMatters: "Humanitarian crisis, Red Sea shipping impacts, broader Middle East regional war risks.",
        radiusKm: 150
    },
    {
        id: "red-sea-houthi",
        name: "Red Sea & Bab al-Mandab",
        lat: 13.5135,
        lon: 43.1491,
        subtext: "Maritime security threat",
        description: "Houthi drone and missile attacks on commercial shipping in the Red Sea and Gulf of Aden.",
        escalationScore: 4,
        escalationTrend: "stable",
        status: "Targeted Strikes",
        whyItMatters: "Disruption of ~12% of global trade relying on the Suez Canal.",
        radiusKm: 400
    },
    {
        id: "taiwan-strait",
        name: "Taiwan Strait",
        lat: 24.5126,
        lon: 119.9304,
        subtext: "Geopolitical flashpoint",
        description: "High Chinese military drills, ADIZ incursions, and naval presence surrounding Taiwan.",
        escalationScore: 3,
        escalationTrend: "escalating",
        status: "Tension / Gray Zone",
        whyItMatters: "Semiconductor supply chain, US-China relations, Indo-Pacific security.",
        radiusKm: 300
    },
    {
        id: "sudan-civil-war",
        name: "Sudan",
        lat: 15.5007,
        lon: 32.5599,
        subtext: "Civil War",
        description: "Widespread fighting between the SAF and RSF causing massive displacement.",
        escalationScore: 5,
        escalationTrend: "escalating",
        status: "Active Conflict",
        whyItMatters: "Severe humanitarian crisis and destabilization of the Horn of Africa.",
        radiusKm: 700
    },
    {
        id: "myanmar-civil-war",
        name: "Myanmar",
        lat: 21.9162,
        lon: 95.9560,
        subtext: "Civil War",
        description: "Intensified civil war between the military junta and various ethnic armed organizations.",
        escalationScore: 4,
        escalationTrend: "stable",
        status: "Active Conflict",
        whyItMatters: "Regional stability in Southeast Asia, refugee crisis.",
        radiusKm: 500
    },
    {
        id: "korean-dmz",
        name: "Korean DMZ",
        lat: 38.3308,
        lon: 127.2406,
        subtext: "Militarized boundary",
        description: "Heightened tension with North Korean artillery drills, drone incursions, and rhetoric.",
        escalationScore: 3,
        escalationTrend: "escalating",
        status: "High Tension",
        whyItMatters: "Nuclear risk, East Asia security, US alliance.",
        radiusKm: 150
    }
];
