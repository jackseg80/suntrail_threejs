import { haversineDistance } from './geo';
import { cleanGPSTrack } from './gpsDeduplication';
import { LocationPoint } from './geo';

export interface TrackStats {
    distance: number; // en km
    dPlus: number;    // en m
    dMinus: number;   // en m
    estimatedTime?: number; // en minutes (Méthode Munter)
}

/**
 * Calcule le temps de marche estimé via la méthode Munter (standard suisse).
 * Formule : (Distance + D+/100) / 4 = Temps en heures pour un marcheur moyen.
 * Retourne le temps en minutes.
 */
export function calculateEstimatedTime(distance: number, dPlus: number): number {
    if (distance <= 0) return 0;
    // 1 effort-km = 1 km horizontal ou 100m vertical
    const effortKm = distance + (dPlus / 100);
    // Vitesse moyenne : 4 effort-km / heure
    const hours = effortKm / 4;
    return Math.round(hours * 60);
}

/**
 * Calcule le dénivelé cumulé (D+/D-) à partir d'une série d'altitudes.
 * Utilise l'algorithme d'hystérésis (standard Garmin) pour filtrer le bruit.
 * @param elevations Tableau des altitudes en mètres.
 * @param threshold Seuil d'hystérésis en mètres (défaut: 5m).
 */
export function calculateHysteresis(elevations: number[], threshold: number = 5): { dPlus: number, dMinus: number } {
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
 * Seuil par défaut : 5 mètres (v5.29.28 - compromis robustesse/précision)
 */
export function calculateTrackStats(points: LocationPoint[], threshold: number = 5): TrackStats {
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
    const estimatedTime = calculateEstimatedTime(distance, dPlus);

    return { distance, dPlus, dMinus, estimatedTime };
}
