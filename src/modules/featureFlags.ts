import { isProActive } from './iap';

export type FeatureId = 
    | 'lod_high'        // Capacité à zoomer au-delà de 14
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
    // Si l'utilisateur est Pro (achat ou essai), tout est débloqué
    if (isProActive()) return true;

    // Dérogations spécifiques pour les utilisateurs gratuits
    switch (featureId) {
        case 'lod_high':
            // Retourne false pour forcer le plafonnement à 14 dans scene.ts
            return false;
            
        case 'solar_calendar':
        case 'weather_pro':
        case 'satellite':
        case 'inclinometer':
        case 'offline_unlimited':
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
