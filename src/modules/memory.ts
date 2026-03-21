/**
 * Nettoie proprement un objet Three.js (Géométrie, Matériaux, Textures)
 * pour éviter les fuites de mémoire (VRAM).
 * 
 * @param obj L'objet Three.js à nettoyer
 */
export function disposeObject(obj: any): void {
    if (!obj) return;

    if (obj.children && obj.children.length > 0) {
        for (let i = obj.children.length - 1; i >= 0; i--) {
            disposeObject(obj.children[i]);
        }
    }

    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
        obj.geometry.dispose();
    }

    if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
            if (typeof mat.dispose === 'function') {
                // Ne PAS disposer les textures ici car elles sont désormais partagées via tileCache.ts.
                // Seul le cache est responsable de la destruction physique des textures lors de l'éviction
                // pour éviter de "tuer" une texture encore utilisée par une autre tuile.
                mat.dispose();
            }
        }
    }

    // Gère le cas spécifique des matériaux de profondeur personnalisés
    if (obj.customDepthMaterial && typeof obj.customDepthMaterial.dispose === 'function') {
        obj.customDepthMaterial.dispose();
    }
}
