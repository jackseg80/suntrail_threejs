/**
 * solarPhases.ts — source unique de vérité pour la classification des phases
 * solaires (jour / heure dorée / crépuscule / nuit).
 *
 * Ces seuils étaient auparavant dupliqués dans `sun.ts`. Toute nouvelle surface
 * qui doit nommer une phase solaire (frise, curseur, bandeau) doit passer par
 * `getSolarPhase()` au lieu de recoder les valeurs.
 */

export type SolarPhase = 'day' | 'golden' | 'twilight' | 'night';

/** Seuils d'altitude solaire (degrés), partagés par toutes les surfaces. */
export const SOLAR_PHASE_THRESHOLDS = {
    day: 6,
    golden: -4,
    twilight: -12,
} as const;

export function getSolarPhase(altitudeDeg: number): SolarPhase {
    if (altitudeDeg > SOLAR_PHASE_THRESHOLDS.day) return 'day';
    if (altitudeDeg > SOLAR_PHASE_THRESHOLDS.golden) return 'golden';
    if (altitudeDeg > SOLAR_PHASE_THRESHOLDS.twilight) return 'twilight';
    return 'night';
}

/** Clés i18n des libellés de phase (déjà présentes dans les quatre locales). */
export const SOLAR_PHASE_LABEL_KEYS: Record<SolarPhase, string> = {
    day: 'solar.phase.day',
    golden: 'solar.phase.golden',
    twilight: 'solar.phase.twilight',
    night: 'solar.phase.night',
};
