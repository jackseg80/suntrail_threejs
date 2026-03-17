import { state } from './state';

/**
 * Throttle function to limit execution frequency
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
    let lastFunc: any;
    let lastRan: number;
    return ((...args: any[]) => {
        if (!lastRan) {
            func(...args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if ((Date.now() - lastRan) >= limit) {
                    func(...args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }) as T;
}

/**
 * Affiche un toast temporaire
 */
export function showToast(message: string): void {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 500); }, 3000);
}

/**
 * Détection de plateforme
 */
export function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Vérifie si une coordonnée est en Suisse (Bounding Box resserrée v4.8.7)
 * Chamonix est à 6.86 -> On coupe à 6.95 à l'Ouest.
 */
export function isPositionInSwitzerland(lat: number, lon: number): boolean {
    // Si Latitude < 46.1 (Chamonix), on exige une Longitude > 7.0 pour être en Suisse (Valais)
    if (lat < 46.1) return (lon > 7.0 && lon < 10.49);
    return (lat > 45.81 && lat < 47.81 && lon > 6.1 && lon < 10.49);
}

/**
 * Vérifie si une coordonnée est en France (Bounding Box Hexagone)
 */
export function isPositionInFrance(lat: number, lon: number): boolean {
    return (lat > 41.3 && lat < 51.1 && lon > -5.2 && lon < 9.6);
}

// --- GEOCoding GLOBAL ORCHESTRATOR (v4.5.34) ---
export async function fetchGeocoding(query: string | {lat: number, lon: number}): Promise<any> {
    const key = state.MK || localStorage.getItem('maptiler_key_3d');
    if (!key) return null;

    let url = "";
    if (typeof query === 'string') {
        url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${key}&limit=5&language=fr`;
    } else {
        // MapTiler Reverse Geocoding attend lon,lat
        url = `https://api.maptiler.com/geocoding/${query.lon},${query.lat}.json?key=${key}&limit=1&language=fr`;
    }

    try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const data = await r.json();
        
        if (!data || !data.features || data.features.length === 0) return null;

        if (typeof query === 'string') {
            return data.features.map((f: any) => ({
                display_name: f.place_name_fr || f.place_name || f.text_fr || f.text,
                lat: f.center[1],
                lon: f.center[0]
            }));
        } else {
            // Pour le reverse, on renvoie la feature complète
            return data.features[0];
        }
    } catch (e) {
        console.error("Geocoding fetch error:", e);
        return null;
    }
}

// --- OVERPASS GLOBAL QUEUE (v4.8.8) ---
let overpassQueue: { query: string, resolve: (data: any) => void, reject: (e: any) => void }[] = [];
let isProcessingOverpass = false;
let lastOverpassTime = 0;
const MIN_DELAY_OVERPASS = 2500; 
const serverQuarantine: Record<string, number> = {};

export async function fetchOverpassData(query: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // Si trop de requêtes en attente (> 10), on rejette immédiatement pour éviter de ramer
        if (overpassQueue.length > 10) {
            return reject(new Error("Queue full"));
        }
        overpassQueue.push({ query, resolve, reject });
        processOverpassQueue();
    });
}

async function processOverpassQueue() {
    if (isProcessingOverpass || overpassQueue.length === 0) return;
    
    const now = Date.now();
    const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter'
    ];

    // Filtrer les serveurs fonctionnels
    const availableServers = servers.filter(s => !serverQuarantine[s] || now > serverQuarantine[s]);
    
    if (availableServers.length === 0) {
        // Tous les serveurs sont KO : on vide la file pour libérer le navigateur
        console.error("OSM Servers Down (Quarantine). Cleaning queue.");
        const item = overpassQueue.shift();
        if (item) item.reject(new Error("All servers down"));
        setTimeout(processOverpassQueue, 5000); // On attend 5s avant de retenter quoi que ce soit
        return;
    }

    const timeSinceLast = now - lastOverpassTime;
    if (timeSinceLast < MIN_DELAY_OVERPASS) {
        setTimeout(processOverpassQueue, MIN_DELAY_OVERPASS - timeSinceLast);
        return;
    }

    isProcessingOverpass = true;
    const { query, resolve, reject } = overpassQueue.shift()!;
    const server = availableServers[Math.floor(Math.random() * availableServers.length)];

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s max

        const response = await fetch(server, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.status === 429 || response.status >= 500) {
            console.warn(`Server ${server} failed (${response.status}). Quarantining for 2min.`);
            serverQuarantine[server] = now + 120000; // 2 minutes de ban
            reject(new Error(response.status.toString()));
        } else if (!response.ok) {
            reject(new Error('OSM Error'));
        } else {
            const data = await response.json();
            lastOverpassTime = Date.now();
            resolve(data);
        }
    } catch (e) {
        reject(e);
    } finally {
        isProcessingOverpass = false;
        setTimeout(processOverpassQueue, 200);
    }
}
