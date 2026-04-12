import { state } from './state';

export type FeatureId = 
    | 'lod_high'        // Zoom > 14
    | 'solar_calendar'  // Accès au calendrier solaire complet
    | 'weather_pro'     // Météo détaillée (graphiques, 3 jours)
    | 'satellite'       // Source satellite
    | 'inclinometer'    // Viseur mobile
    | 'offline_unlimited'; // Plus d'une zone hors-ligne

/**
 * Vérifie si une fonctionnalité est disponible pour l'utilisateur actuel (v5.28.20).
 * Centralise la logique de monétisation et les dérogations (dev/web).
 */
export function isFeatureEnabled(featureId: FeatureId): boolean {
    // Si l'utilisateur est Pro, tout est débloqué
    if (state.isPro) return true;

    // Dérogations spécifiques
    switch (featureId) {
        case 'lod_high':
            // Bloqué à 14 pour les gratuits
            return state.ZOOM <= 14;
            
        case 'solar_calendar':
            // Simulation 24h gratuite, calendrier = Pro
            return false;

        case 'weather_pro':
            // Météo de base seulement
            return false;

        case 'satellite':
            // Satellite = Pro
            return false;

        case 'inclinometer':
            // Feature Pro (v5.27.5)
            return false;

        case 'offline_unlimited':
            // Une zone gratuite, géré par ConnectivitySheet
            return false;

        default:
            return false;
    }
}

/**
 * Retourne la valeur plafonnée pour une ressource selon le statut Pro.
 */
export function getFeatureLimit<T>(featureId: FeatureId, proValue: T, freeValue: T): T {
    return isFeatureEnabled(featureId) ? proValue : freeValue;
}
