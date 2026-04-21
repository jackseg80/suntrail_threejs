import { haversineDistance } from './geo';

/**
 * Interface générique pour un point GPS
 */
export interface GPSPoint {
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;
}

/**
 * Nettoie un tracé GPS en supprimant les doublons, les points trop proches,
 * les sauts aberrants (outliers) et les incohérences d'altitude.
 * Applique également un lissage par moyenne mobile (v5.28.5).
 * 
 * Cette fonction est la SOURCE DE VÉRITÉ unique pour le nettoyage des tracés.
 */
export function cleanGPSTrack<T extends GPSPoint>(points: T[]): T[] {
    if (points.length === 0) return [];
    
    // 1. Trier par timestamp pour garantir la chronologie
    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

    // 2. Dédoublonnage par timestamp et filtrage de cohérence radical
    const preCleaned: T[] = [];
    
    const MAX_SPEED_KMH = 600;      // Vitesse aberrante (glitch GPS)
    const MIN_DISTANCE_METERS = 2.5; // Ignorer les micro-mouvements (bruit statique)
    const MAX_ALT_JUMP = 200;       // Saut vertical max (plus strict v5.28.5)

    for (const curr of sorted) {
        // Ignorer les points "zéro" ou invalides du démarrage (Cause majeure de champignons)
        if (!curr || isNaN(curr.lat) || isNaN(curr.lon) || isNaN(curr.alt)) continue;
        if (curr.lat === 0 && curr.lon === 0) continue;
        if (Math.abs(curr.lat) < 0.0001 && Math.abs(curr.lon) < 0.0001) continue;
        
        // Plage absolue de sécurité d'altitude
        if (curr.alt < -500 || curr.alt > 9000) continue;

        if (preCleaned.length === 0) {
            preCleaned.push(curr);
            continue;
        }

        const lastValid = preCleaned[preCleaned.length - 1];
        
        // Dédoublonnage strict par timestamp
        if (curr.timestamp <= lastValid.timestamp) continue;

        const dist = haversineDistance(lastValid.lat, lastValid.lon, curr.lat, curr.lon) * 1000;
        const timeDiffSeconds = (curr.timestamp - lastValid.timestamp) / 1000;
        const altDiff = Math.abs(curr.alt - lastValid.alt);

        // Filtre 1: Points trop proches (bruit statique / jitter)
        if (dist < MIN_DISTANCE_METERS && altDiff < 2 && timeDiffSeconds < 30) {
            continue;
        }

        // Filtre 2: Sauts aberrants de vitesse (Outliers)
        if (timeDiffSeconds > 0.1) {
            const speedKmh = (dist / 1000) / (timeDiffSeconds / 3600);
            if (speedKmh > MAX_SPEED_KMH) {
                continue;
            }
            // Sécurité absolue : un point ne peut pas être à plus de 500km du précédent (glitch radical)
            if (dist > 500000) continue;
        }

        // Filtre 3: Cohérence d'altitude (saut vertical radical)
        if (altDiff > MAX_ALT_JUMP && timeDiffSeconds < 10) {
            continue;
        }

        preCleaned.push(curr);
    }

    if (preCleaned.length < 5) return preCleaned;

    // 3. Lissage de l'altitude (Moyenne mobile 5 points) (v5.29.28)
    // Aide à stabiliser le D+/D- sur les capteurs GPS bruités (ex: Galaxy A53)
    const smoothed: T[] = [];
    
    for (let i = 0; i < preCleaned.length; i++) {
        let sum = 0;
        let count = 0;
        
        // Fenêtre de 5 points (i-2 à i+2)
        for (let j = i - 2; j <= i + 2; j++) {
            if (j >= 0 && j < preCleaned.length) {
                sum += preCleaned[j].alt;
                count++;
            }
        }
        
        smoothed.push({
            ...preCleaned[i],
            alt: sum / count
        });
    }

    return smoothed;
}
