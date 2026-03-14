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
 * Vérifie si une coordonnée est en Suisse (Bounding Box approximative)
 */
export function isPositionInSwitzerland(lat: number, lon: number): boolean {
    return (lat > 45.8 && lat < 47.8 && lon > 5.9 && lon < 10.5);
}

// --- OVERPASS GLOBAL ORCHESTRATOR (v4.5.21) ---
let isOverpassLocked = false;
let lastOverpassRequest = 0;
const OVERPASS_COOLDOWN = 1200; // 1.2s entre chaque tuile
const serverQuarantine: Record<string, number> = {};

export async function fetchOverpassData(query: string): Promise<any> {
    const now = Date.now();
    
    // 1. Verrou Global Strict
    if (isOverpassLocked || (now - lastOverpassRequest < OVERPASS_COOLDOWN)) {
        return null;
    }

    const servers = [
        'https://overpass-api.de/api/interpreter',
        'https://lz4.overpass-api.de/api/interpreter',
        'https://z.overpass-api.de/api/interpreter'
    ];

    // 2. Sélection d'un serveur non-quarantiné
    const availableServers = servers.filter(s => !serverQuarantine[s] || now > serverQuarantine[s]);
    if (availableServers.length === 0) return null;
    
    const server = availableServers[Math.floor(Math.random() * availableServers.length)];

    isOverpassLocked = true;
    lastOverpassRequest = now;

    try {
        const response = await fetch(server, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`
        });

        if (response.status === 429) {
            serverQuarantine[server] = now + 30000; // 30s de pause pour ce serveur
            throw new Error('429');
        }

        if (!response.ok) throw new Error('OSM Error');
        const data = await response.json();
        return data;
    } finally {
        setTimeout(() => { isOverpassLocked = false; }, 200);
    }
}
