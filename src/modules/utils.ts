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

export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return function(this: any, ...args: Parameters<T>) {
        const context = this;
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

export function isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
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

export function isLowPriorityDisabled(): boolean {
    return Date.now() < _lowPriorityDisabledUntil;
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
        // v5.29.19 : Timeout ultra-court (3s) pour ne pas bloquer les slots réseau en cas de panne Overpass
        const response = await fetch(`${server}?data=${encodeURIComponent(item.query)}`, {
            signal: AbortSignal.timeout(3000)
        });

        if (response.status === 429 || response.status === 504 || response.status === 502) {
            _overpassConsecutiveFails++;
            console.warn(`[Overpass] ${response.status} sur ${server}.`);

            // Disjoncteur agressif : on coupe immédiatement si le serveur est en carafe
            if (response.status === 504 || response.status === 502 || _overpassConsecutiveFails >= 2) {
                console.warn("[Overpass] Serveur saturé ou en panne. Désactivation Hydrologie/Bâtiments pour 10 min.");
                _lowPriorityDisabledUntil = Date.now() + 600000;
                _overpassConsecutiveFails = 0;
            }

            if (item.priority) {
                overpassQueue.unshift(item);
            } else {
                item.resolve(null);
            }

            // Attendre avant de retenter sur le serveur suivant
            isOverpassProcessing = false;
            setTimeout(processNextOverpass, 3000);
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

export async function fetchGeocoding(params: { lat?: number, lon?: number, query?: string }, signal?: AbortSignal): Promise<any> {
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
            const r = await fetch(maptilerUrl, { signal: signal || AbortSignal.timeout(5000) });
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
            if ((e as Error).name === 'AbortError') throw e;
            // Erreur réseau (CORS block sur 429, etc.) — backoff 30s
            console.error("[MapTiler] Erreur réseau geocoding — backoff 30s");
            _geocodingBackoffUntil = Date.now() + 30_000;
        }
    }

    // 2. Secours OSM (Gratuit et libre)
    try {
        const r = await fetch(osmUrl, { 
            headers: { 'User-Agent': 'SunTrail-3D-App' },
            signal: signal || AbortSignal.timeout(5000)
        });
        if (r.ok) return await r.json();
        if (r.status === 429) {
            console.warn("[OSM] Rate limit Nominatim (429). Backoff 60s.");
            _geocodingBackoffUntil = Date.now() + 60_000;
            return null;
        }
    } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
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

// --- FORMATAGE (v5.29.33) ---

export function fmtTime(d: Date | null): string {
    if (!d) return '—:—';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    return `${h}h ${m.toString().padStart(2, '0')}`;
}
