import { state } from './state';

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
    let lastFunc: ReturnType<typeof setTimeout> | null = null;
    let lastRan: number | null = null;
    return function(this: any, ...args: any[]) {
        const context = this;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            if (lastFunc) clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - (lastRan || 0)) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - (lastRan || 0)));
        }
    } as T;
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

// --- GESTIONNAIRE OVERPASS FIFO AVEC PRIORITÉ ---
let overpassQueue: { query: string, resolve: Function, priority: boolean }[] = [];
let isOverpassProcessing = false;
let _overpassBackoffUntil = 0;     
let _overpassConsecutiveFails = 0;  
let _lowPriorityDisabledUntil = 0; // Disjoncteur pour hydrologie/bâtiments
const OVERPASS_DELAY = 2000;       // Augmenté à 2s pour éviter les 429 massifs
const OVERPASS_BASE_BACKOFF = 30000;  
const OVERPASS_MAX_QUEUE = 15;      

export function isOverpassInBackoff(): boolean {
    return Date.now() < _overpassBackoffUntil;
}

export async function fetchOverpassData(query: string, highPriority: boolean = false): Promise<any> {
    const now = Date.now();
    // Si disjoncteur actif, on refuse immédiatement la basse priorité (soulage le CPU/Réseau)
    if (!highPriority && now < _lowPriorityDisabledUntil) return null;
    if (now < _overpassBackoffUntil) return null;

    return new Promise((resolve) => {
        const item = { query, resolve, priority: highPriority };
        if (highPriority) {
            overpassQueue.unshift(item); // Priorité : au début
        } else {
            overpassQueue.push(item);    // Normal : à la fin
        }
        
        while (overpassQueue.length > OVERPASS_MAX_QUEUE) {
            // Supprimer en priorité les requêtes non-prioritaires
            const idx = overpassQueue.findIndex(q => !q.priority);
            const dropped = overpassQueue.splice(idx !== -1 ? idx : overpassQueue.length - 1, 1)[0];
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

    const now = Date.now();
    if (now < _overpassBackoffUntil) {
        while (overpassQueue.length > 0) overpassQueue.shift()!.resolve(null);
        isOverpassProcessing = false;
        return;
    }

    isOverpassProcessing = true;
    const item = overpassQueue.shift()!;

    const servers = [
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ];
    if ((window as any)._overpassIdx === undefined) (window as any)._overpassIdx = 0;
    const idx = (window as any)._overpassIdx % servers.length;
    const server = servers[idx];
    (window as any)._overpassIdx++;

    try {
        const response = await fetch(`${server}?data=${encodeURIComponent(item.query)}`, {
            signal: AbortSignal.timeout(30000)
        });

        if (response.status === 429 || response.status === 504) {
            _overpassConsecutiveFails++;
            console.warn(`[Overpass] ${response.status} sur ${server}.`);

            // Disjoncteur après 6 échecs : désactivation Hydrologie/Bâtiments
            if (_overpassConsecutiveFails > 6) {
                console.warn("[Overpass] Trop d'échecs. Désactivation Hydrologie/Bâtiments pour 5 min.");
                _lowPriorityDisabledUntil = Date.now() + 300000;
            }

            if (item.priority) {
                overpassQueue.unshift(item);
            } else {
                item.resolve(null);
            }

            // Attendre avant de retenter sur le serveur suivant
            setTimeout(processNextOverpass, 3000);
            isOverpassProcessing = false;
            return;
        }

        if (!response.ok) {
            item.resolve(null);
        } else {
            _overpassConsecutiveFails = 0;
            const data = await response.json();
            item.resolve(data);
        }
    } catch (e) {
        _overpassConsecutiveFails++;
        const backoff = Math.min(OVERPASS_BASE_BACKOFF, 30000);
        _overpassBackoffUntil = Date.now() + backoff;
        item.resolve(null);
        isOverpassProcessing = false;
        return;
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
                console.warn("[MapTiler] Clé invalide détectée (403) sur geocoding. Backoff 5min.");
                _geocodingBackoffUntil = Date.now() + 300_000;
                return null;
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

// --- OPTIMISATION GPS (v5.28.1) ---

/**
 * Algorithme de Ramer-Douglas-Peucker (RDP)
 * Simplifie un tracé en conservant la forme globale avec un seuil d'erreur.
 * Optimisé pour éviter la récursion profonde et les allocations excessives.
 */
export function simplifyRDP<T>(
    points: T[],
    epsilon: number,
    getPos: (p: T) => { x: number, y: number, z: number }
): T[] {
    if (points.length <= 2) return points;

    const usePoint = new Uint8Array(points.length);
    usePoint[0] = 1;
    usePoint[points.length - 1] = 1;

    const stack: [number, number][] = [[0, points.length - 1]];
    const epsilonSq = epsilon * epsilon;

    while (stack.length > 0) {
        const [start, end] = stack.pop()!;
        if (end <= start + 1) continue;

        let maxDistSq = 0;
        let index = -1;
        const a = getPos(points[start]);
        const b = getPos(points[end]);

        for (let i = start + 1; i < end; i++) {
            const p = getPos(points[i]);
            const distSq = distanceToSegmentSquared3D(p, a, b);
            if (distSq > maxDistSq) {
                maxDistSq = distSq;
                index = i;
            }
        }

        if (maxDistSq > epsilonSq) {
            usePoint[index] = 1;
            stack.push([start, index]);
            stack.push([index, end]);
        }
    }

    const result: T[] = [];
    for (let i = 0; i < points.length; i++) {
        if (usePoint[i]) result.push(points[i]);
    }
    return result;
}

/** Distance d'un point P à un segment [A, B] en 3D (au carré pour perf) */
function distanceToSegmentSquared3D(
    p: { x: number, y: number, z: number },
    a: { x: number, y: number, z: number },
    b: { x: number, y: number, z: number }
): number {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
    const l2 = abx * abx + aby * aby + abz * abz;
    if (l2 === 0) return apx * apx + apy * apy + apz * apz;
    let t = (apx * abx + apy * aby + apz * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = a.x + t * abx;
    const qy = a.y + t * aby;
    const qz = a.z + t * abz;
    const dx = p.x - qx, dy = p.y - qy, dz = p.z - qz;
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Calcule la distance Haversine entre deux points GPS (en km).
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}
