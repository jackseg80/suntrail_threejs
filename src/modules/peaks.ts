import { state, Peak } from './state';
import { haversineDistance } from './geo';

const CACHE_KEY = 'suntrail_peaks_cache';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

interface PeakCache {
    timestamp: number;
    lat: number;
    lon: number;
    peaks: Peak[];
}

export async function fetchLocalPeaks(lat: number, lon: number, radiusKm: number = 50): Promise<void> {
    try {
        // 1. Check Cache
        const cachedStr = localStorage.getItem(CACHE_KEY);
        if (cachedStr) {
            const cache: PeakCache = JSON.parse(cachedStr);
            const dist = haversineDistance(lat, lon, cache.lat, cache.lon);
            if (Date.now() - cache.timestamp < CACHE_EXPIRY && dist < (radiusKm / 2)) {
                state.localPeaks = cache.peaks;
                return;
            }
        }

        // 2. Fetch from Overpass API
        const bbox = `
            ${lat - (radiusKm / 111)},
            ${lon - (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))},
            ${lat + (radiusKm / 111)},
            ${lon + (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))}
        `;
        
        // We look for peaks with a name and an elevation > 1000m to avoid noise
        const query = `
            [out:json][timeout:25];
            node["natural"="peak"]["name"]["ele"](${bbox});
            out body;
        `;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query)
        });

        if (!response.ok) throw new Error('Overpass API error');

        const data = await response.json();
        
        const peaks: Peak[] = data.elements
            .map((el: any) => ({
                id: el.id,
                name: el.tags.name,
                lat: el.lat,
                lon: el.lon,
                ele: parseFloat(el.tags.ele) || 0
            }))
            .filter((p: Peak) => p.ele > 1000) // Filter out low peaks/hills
            .sort((a: Peak, b: Peak) => b.ele - a.ele); // Sort by elevation descending

        state.localPeaks = peaks;

        // 3. Update Cache
        const newCache: PeakCache = {
            timestamp: Date.now(),
            lat,
            lon,
            peaks
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));

    } catch (error) {
        console.error("Failed to fetch local peaks:", error);
    }
}
