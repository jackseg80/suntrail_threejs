import { state, Peak } from './state';
import { haversineDistance } from './geo';

const CACHE_KEY = 'suntrail_peaks_cache';
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

// v5.34.3 : Backoff pour éviter de spammer une API qui nous rejette (CORS/406)
let isOverpassBanned = false;
let lastFailureTime = 0;
const BAN_DURATION = 5 * 60 * 1000; // 5 minutes

interface PeakCache {
    timestamp: number;
    lat: number;
    lon: number;
    peaks: Peak[];
}

export async function fetchLocalPeaks(lat: number, lon: number, radiusKm: number = 50): Promise<void> {
    // 0. Vérifier si l'API est en pause suite à un échec récent
    if (isOverpassBanned) {
        if (Date.now() - lastFailureTime < BAN_DURATION) return;
        isOverpassBanned = false;
    }

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
        const bbox = `${lat - (radiusKm / 111)},${lon - (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))},${lat + (radiusKm / 111)},${lon + (radiusKm / (111 * Math.cos(lat * Math.PI / 180)))}`;
        
        const query = `[out:json][timeout:25];node["natural"="peak"]["name"]["ele"](${bbox});out body;`;

        // v5.34.3 : Utilisation de GET au lieu de POST (plus robuste pour CORS sur certains miroirs)
        const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        
        const response = await fetch(url, { 
            method: 'GET',
            referrerPolicy: 'same-origin'
        });

        if (!response.ok) {
            if (response.status === 406 || response.status === 429) {
                isOverpassBanned = true;
                lastFailureTime = Date.now();
                console.warn(`[Peaks] Overpass API restricted (${response.status}). Pausing requests for 5min.`);
            }
            return;
        }

        const data = await response.json();
        
        const peaks: Peak[] = data.elements
            .map((el: any) => ({
                id: el.id,
                name: el.tags.name,
                lat: el.lat,
                lon: el.lon,
                ele: parseFloat(el.tags.ele) || 0
            }))
            .filter((p: Peak) => p.ele > 1000) 
            .sort((a: Peak, b: Peak) => b.ele - a.ele);

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
        isOverpassBanned = true;
        lastFailureTime = Date.now();
    }
}
