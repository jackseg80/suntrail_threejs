/**
 * Cadrage caméra d'une boîte englobante (utilisé pour les tracés GPX).
 *
 * `flyTo()` place la caméra non pas à `targetDistance` de la cible, mais à
 * `targetDistance` en altitude avec un décalage Z proportionnel : la distance
 * réelle caméra ↔ cible vaut donc `targetDistance × FLYTO_CAMERA_DISTANCE_FACTOR`.
 */

/** Décalage Z de la caméra dans flyTo (Z = ratio × distance). */
export const FLYTO_Z_OFFSET_RATIO = 0.8;

/** Rapport entre la distance caméra ↔ cible réelle et `targetDistance`. */
export const FLYTO_CAMERA_DISTANCE_FACTOR = Math.hypot(1, FLYTO_Z_OFFSET_RATIO);

/** Distance minimale (targetDistance) pour ne pas coller aux petits tracés. */
export const MIN_TRACK_VIEW_DISTANCE = 3000;

const DEFAULT_FOV_DEG = 45;

/**
 * Calcule le `targetDistance` à passer à `flyTo` pour qu'une boîte englobante
 * (largeur × profondeur × hauteur en unités monde) tienne entièrement dans le
 * viewport, en tenant compte du FOV, du ratio d'écran et de l'inclinaison.
 *
 * On borne la sphère englobante par le plus petit demi-FOV (souvent l'horizontal
 * en mode portrait), ce qui évite que les tracés larges débordent sur mobile.
 */
export function computeTrackFitDistance(
    width: number,
    depth: number,
    height = 0,
    margin = 1.1,
    fovDeg = DEFAULT_FOV_DEG,
    aspect = window.innerWidth / Math.max(1, window.innerHeight)
): number {
    const radius = 0.5 * Math.hypot(width, depth, height);
    if (!(radius > 0) || !(aspect > 0)) return 0;

    const vFov = (fovDeg * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const halfFov = Math.min(vFov, hFov) / 2;

    const distanceToTarget = (radius / Math.sin(halfFov)) * margin;
    return distanceToTarget / FLYTO_CAMERA_DISTANCE_FACTOR;
}
