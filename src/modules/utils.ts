import { state } from './state';

export function throttle(func: Function, limit: number) {
    let lastFunc: any;
    let lastRan: any;
    return function(this: any, ...args: any[]) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    }
}

export function showToast(message: string, duration: number = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.bottom = '100px';
        container.style.left = '50%';
        container.style.transform = 'translateX(-50%)';
        container.style.zIndex = '10000';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.alignItems = 'center';
        container.style.gap = '10px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.background = 'rgba(0,0,0,0.85)';
    toast.style.color = 'white';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '25px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    toast.style.border = '1px solid rgba(255,255,255,0.1)';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    toast.style.transform = 'translateY(20px)';
    toast.textContent = message;

    container.appendChild(toast);
    toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

export function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
}

export function isPositionInSwitzerland(lat: number, lon: number): boolean {
    return lat > 45.8 && lat < 47.8 && lon > 5.9 && lon < 10.5;
}

export function isPositionInFrance(lat: number, lon: number): boolean {
    return lat > 41.3 && lat < 51.1 && lon > -5.1 && lon < 9.6;
}

// --- GESTIONNAIRE OVERPASS LIFO ---
let overpassQueue: { query: string, resolve: Function }[] = [];
let isOverpassProcessing = false;
const OVERPASS_DELAY = 800;

export async function fetchOverpassData(query: string): Promise<any> {
    return new Promise((resolve) => {
        overpassQueue.push({ query, resolve });
        if (overpassQueue.length > 20) overpassQueue.shift();
        if (!isOverpassProcessing) processNextOverpass();
    });
}

async function processNextOverpass() {
    if (overpassQueue.length === 0) {
        isOverpassProcessing = false;
        return;
    }

    isOverpassProcessing = true;
    const { query, resolve } = overpassQueue.pop()!;

    const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
    ];
    const server = servers[Math.floor(Math.random() * servers.length)];

    try {
        const response = await fetch(`${server}?data=${encodeURIComponent(query)}`);
        
        if (response.status === 429) {
            setTimeout(() => {
                overpassQueue.push({ query, resolve });
                processNextOverpass();
            }, 4000);
            return;
        }
        
        if (!response.ok) {
            resolve(null);
        } else {
            const data = await response.json();
            resolve(data);
        }
    } catch (e) {
        resolve(null);
    }

    setTimeout(processNextOverpass, OVERPASS_DELAY);
}

// --- GÉOCODAGE AVEC SECOURS (v5.4.7) ---
export async function fetchGeocoding(params: { lat?: number, lon?: number, query?: string }): Promise<any> {
    if (state.isMapTilerDisabled && !params.lat) {
        // Si MapTiler est mort et qu'on fait une recherche par texte, Nominatim est risqué (CORS/429)
        // On tente quand même mais avec prudence
    }

    const key = state.MK;
    let maptilerUrl = "";
    let osmUrl = "";

    if (params.lat && params.lon) {
        maptilerUrl = `https://api.maptiler.com/geocoding/${params.lon},${params.lat}.json?key=${key}`;
        osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${params.lat}&lon=${params.lon}`;
    } else if (params.query) {
        maptilerUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(params.query)}.json?key=${key}`;
        osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(params.query)}&limit=10`;
    }

    // 1. Tenter MapTiler (si pas déjà banni)
    if (!state.isMapTilerDisabled && key) {
        try {
            const r = await fetch(maptilerUrl);
            if (r.status === 403) {
                console.warn("[MapTiler] Clé invalide détectée (403). Passage en mode Fallback OSM.");
                state.isMapTilerDisabled = true;
            } else if (r.ok) {
                const d = await r.json();
                return d.features || d;
            }
        } catch (e) {
            console.error("[MapTiler] Erreur réseau geocoding");
        }
    }

    // 2. Secours OSM (Gratuit et libre)
    try {
        const r = await fetch(osmUrl, { headers: { 'User-Agent': 'SunTrail-3D-App' }});
        if (r.ok) return await r.json();
        if (r.status === 429) console.warn("[OSM] Rate limit Nominatim atteint (429).");
    } catch (e) {
        console.warn("[OSM] Erreur CORS/Réseau Nominatim. La recherche peut être indisponible.");
    }

    return null;
}
