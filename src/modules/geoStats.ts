import { haversineDistance } from './utils';
import { cleanGPSTrack } from './gpsDeduplication';
import { LocationPoint } from './geo';

export interface TrackStats {
    distance: number; // en km
    dPlus: number;    // en m
    dMinus: number;   // en m
}

/**
 * Calcule le dénivelé cumulé (D+/D-) à partir d'une série d'altitudes.
 * Utilise l'algorithme d'hystérésis (standard Garmin) pour filtrer le bruit.
 * @param elevations Tableau des altitudes en mètres.
 * @param threshold Seuil d'hystérésis en mètres (défaut: 3m).
 */
export function calculateHysteresis(elevations: number[], threshold: number = 3): { dPlus: number, dMinus: number } {
    if (elevations.length < 2) {
        return { dPlus: 0, dMinus: 0 };
    }

    let dPlus = 0;
    let dMinus = 0;
    let refAlt = elevations[0];

    for (let i = 1; i < elevations.length; i++) {
        const currentAlt = elevations[i];
        const diffFromRef = currentAlt - refAlt;

        if (diffFromRef >= threshold) {
            dPlus += diffFromRef;
            refAlt = currentAlt;
        } else if (diffFromRef <= -threshold) {
            dMinus += Math.abs(diffFromRef);
            refAlt = currentAlt;
        }
    }

    return { dPlus, dMinus };
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
    for (let i = 1; i < uniquePoints.length; i++) {
        const p1 = uniquePoints[i - 1];
        const p2 = uniquePoints[i];
        distance += haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
    }

    const { dPlus, dMinus } = calculateHysteresis(uniquePoints.map(p => p.alt), threshold);

    return { distance, dPlus, dMinus };
}
