import { writeFileSync } from 'fs';

async function run() {
    const query = '[out:json][timeout:300];(node["military"="base"];way["military"="base"];relation["military"="base"];);out center;';
    const url = `https://lz4.overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    try {
        console.log("Fetching from overpass...");
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        
        const features = (data.elements || []).map(el => {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (lat == null || lon == null) return null;
            return {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [lon, lat] },
                properties: { name: el.tags?.name || el.tags?.['name:en'] || 'Unknown Base' },
                id: el.id
            };
        }).filter(Boolean);
        
        writeFileSync('data/data.json', JSON.stringify({ type: 'FeatureCollection', features }));
        console.log('Saved ' + features.length + ' military bases');
    } catch (e) {
        console.error(e);
    }
}
run();
