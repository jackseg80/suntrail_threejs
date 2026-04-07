import { LocationPoint } from './state';

/**
 * Nettoie un tracé GPS en supprimant les doublons, les points trop proches 
 * et les sauts aberrants (outliers).
 */
export function cleanGPSTrack(points: LocationPoint[]): LocationPoint[] {
    if (points.length <= 1) return points;

    // Trier par timestamp pour garantir la chronologie AVANT le dédoublonnage pour garder le dernier
    points.sort((a, b) => a.timestamp - b.timestamp);

    // 1. Dédoublonnage par timestamp
    const uniquePoints: LocationPoint[] = [];
    if (points.length > 0) {
        uniquePoints.push(points[0]);
        for (let i = 1; i < points.length; i++) {
            if (points[i].timestamp !== points[i-1].timestamp) {
                uniquePoints.push(points[i]);
            }
        }
    }

    if (uniquePoints.length <= 1) return uniquePoints;

    const cleaned: LocationPoint[] = [uniquePoints[0]];
    const MAX_SPEED_KMH = 150; // Vitesse aberrante pour un randonneur (glitch GPS)
    const MIN_DISTANCE_METERS = 2; // Ignorer les micro-mouvements (bruit statique)

    for (let i = 1; i < uniquePoints.length; i++) {
        const lastValid = cleaned[cleaned.length - 1];
        const curr = uniquePoints[i];

        const dist = getDistance(lastValid.lat, lastValid.lon, curr.lat, curr.lon);
        const timeDiffSeconds = (curr.timestamp - lastValid.timestamp) / 1000;

        if (timeDiffSeconds <= 0) continue; 

        const speedKmh = (dist / 1000) / (timeDiffSeconds / 3600);

        // Filtre 1: Points trop proches (bruit statique)
        if (dist < MIN_DISTANCE_METERS && timeDiffSeconds < 30) {
            continue;
        }

        // Filtre 2: Sauts aberrants (Outliers)
        if (speedKmh > MAX_SPEED_KMH && timeDiffSeconds < 300) {
            continue;
        }

        cleaned.push(curr);
    }

    return cleaned;
}

/**
 * Calcule la distance en mètres entre deux points (Haversine).
 */
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Rayon de la Terre en mètres
    const f1 = lat1 * Math.PI / 180;
    const f2 = lat2 * Math.PI / 180;
    const df = (lat2 - lat1) * Math.PI / 180;
    const dl = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(df / 2) * Math.sin(df / 2) +
              Math.cos(f1) * Math.cos(f2) *
              Math.sin(dl / 2) * Math.sin(dl / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}
