import { haversineDistance } from './utils';
import { cleanGPSTrack } from './gpsDeduplication';

export interface LocationPoint {
    lat: number;
    lon: number;
    alt: number;
    timestamp: number;
}

export interface TrackStats {
    distance: number; // en km
    dPlus: number;    // en m
    dMinus: number;   // en m
}

/**
 * Calcule les statistiques d'un tracé GPS avec un algorithme d'hystérésis
 * Seuil par défaut : 3 mètres (v5.28.5 - standard Garmin robuste)
 */
export function calculateTrackStats(points: LocationPoint[], threshold: number = 3): TrackStats {
    // v5.28.2: Utilisation de la source de vérité unique pour le nettoyage
    const uniquePoints = cleanGPSTrack(points);

    if (uniquePoints.length < 2) {
        return { distance: 0, dPlus: 0, dMinus: 0 };
    }

    let distance = 0;
    let dPlus = 0;
    let dMinus = 0;
    let refAlt = uniquePoints[0].alt;

    for (let i = 1; i < uniquePoints.length; i++) {
        const p1 = uniquePoints[i - 1];
        const p2 = uniquePoints[i];

        // Distance cumulée (Haversine)
        distance += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);

        // Algorithme d'hystérésis pour le dénivelé
        const currentAlt = p2.alt;
        const diffFromRef = currentAlt - refAlt;

        if (diffFromRef >= threshold) {
            dPlus += diffFromRef;
            refAlt = currentAlt;
        } else if (diffFromRef <= -threshold) {
            dMinus += Math.abs(diffFromRef);
            refAlt = currentAlt;
        }
    }

    return { distance, dPlus, dMinus };
}
