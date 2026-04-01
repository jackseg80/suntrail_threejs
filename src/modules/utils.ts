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
    // Corse (41.0–43.1°N, 8.4–9.7°E) — territoire français jusqu'à ~9.56°E
    if (lat > 41.0 && lat < 43.1 && lon > 8.4 && lon < 9.7) return true;
    // France métropolitaine continentale.
    // ⚠️ Limite est : ~8.23°E (Lauterbourg, Alsace — frontière du Rhin).
    // L'ancienne valeur 9.6°E incluait l'Allemagne (Baden-Württemberg, Forêt Noire)
    // → ces tuiles passaient isTileFullyInRegion(FR) = TRUE → IGN appelé → 404.
    return lat > 41.3 && lat < 51.1 && lon > -5.1 && lon < 8.3;
}

// --- GESTIONNAIRE OVERPASS LIFO ---
let overpassQueue: { query: string, resolve: Function, retries: number }[] = [];
let isOverpassProcessing = false;
let _overpassBackoffUntil = 0;     // Backoff GLOBAL : aucune requête avant ce timestamp
const OVERPASS_DELAY = 1200;       // 1.2s entre requêtes (marge confortable)
const OVERPASS_429_BACKOFF = 15000; // 15s de pause globale après un 429
const OVERPASS_MAX_RETRIES = 1;    // Max 1 retry par requête après 429
const OVERPASS_MAX_QUEUE = 12;     // Queue courte — dropper les plus anciennes agressivement

export async function fetchOverpassData(query: string): Promise<any> {
    return new Promise((resolve) => {
        overpassQueue.push({ query, resolve, retries: 0 });
        // Dropper les plus anciennes si la queue déborde
        while (overpassQueue.length > OVERPASS_MAX_QUEUE) {
            const dropped = overpassQueue.shift()!;
            dropped.resolve(null);
        }
        if (!isOverpassProcessing) processNextOverpass();
    });
}

async function processNextOverpass() {
    if (overpassQueue.length === 0) {
        isOverpassProcessing = false;
        return;
    }

    // Backoff global : si on est en pause, attendre
    const now = Date.now();
    if (now < _overpassBackoffUntil) {
        const wait = _overpassBackoffUntil - now;
        setTimeout(processNextOverpass, wait);
        return;
    }

    isOverpassProcessing = true;
    const item = overpassQueue.pop()!;

    const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
    ];
    const server = servers[Math.floor(Math.random() * servers.length)];

    try {
        const response = await fetch(`${server}?data=${encodeURIComponent(item.query)}`);

        if (response.status === 429 || response.status === 504) {
            // Backoff GLOBAL : pause toute la queue, pas juste cette requête
            _overpassBackoffUntil = Date.now() + OVERPASS_429_BACKOFF;
            console.warn(`[Overpass] ${response.status} — backoff global ${OVERPASS_429_BACKOFF / 1000}s`);

            // Re-enqueue uniquement si pas déjà retried
            if (item.retries < OVERPASS_MAX_RETRIES) {
                item.retries++;
                overpassQueue.push(item);
            } else {
                item.resolve(null); // Abandon après max retries
            }

            isOverpassProcessing = false;
            setTimeout(processNextOverpass, OVERPASS_429_BACKOFF);
            return;
        }

        if (!response.ok) {
            item.resolve(null);
        } else {
            const data = await response.json();
            item.resolve(data);
        }
    } catch (e) {
        item.resolve(null);
    }

    setTimeout(processNextOverpass, OVERPASS_DELAY);
}

// --- GÉOCODAGE AVEC SECOURS (v5.4.7) ---
let _geocodingBackoffUntil = 0; // timestamp until which geocoding is paused (429 backoff)

export async function fetchGeocoding(params: { lat?: number, lon?: number, query?: string }): Promise<any> {
    // Backoff global après un 429 — ne pas retenter avant l'expiration
    if (Date.now() < _geocodingBackoffUntil) return null;

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
            } else if (r.status === 429) {
                console.warn("[MapTiler] Rate limit geocoding (429). Backoff 60s.");
                _geocodingBackoffUntil = Date.now() + 60_000;
                return null;
            } else if (r.ok) {
                const d = await r.json();
                return d.features || d;
            }
        } catch (e) {
            // Erreur réseau (CORS block sur 429, etc.) — backoff 30s
            console.error("[MapTiler] Erreur réseau geocoding — backoff 30s");
            _geocodingBackoffUntil = Date.now() + 30_000;
        }
    }

    // 2. Secours OSM (Gratuit et libre)
    try {
        const r = await fetch(osmUrl, { headers: { 'User-Agent': 'SunTrail-3D-App' }});
        if (r.ok) return await r.json();
        if (r.status === 429) {
            console.warn("[OSM] Rate limit Nominatim (429). Backoff 60s.");
            _geocodingBackoffUntil = Date.now() + 60_000;
            return null;
        }
    } catch (e) {
        // CORS block = probablement un 429 masqué — backoff 30s
        _geocodingBackoffUntil = Date.now() + 30_000;
    }

    return null;
}
