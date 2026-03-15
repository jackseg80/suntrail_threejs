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
                // Optionnel : on peut aussi dispose les textures liées au matériau
                // (attention : ne pas dispose une texture partagée par plusieurs objets)
                // Ici, dans SunTrail, la plupart des tuiles ont leurs propres textures de map.
                if (mat.map && typeof mat.map.dispose === 'function') mat.map.dispose();
                if (mat.lightMap && typeof mat.lightMap.dispose === 'function') mat.lightMap.dispose();
                if (mat.bumpMap && typeof mat.bumpMap.dispose === 'function') mat.bumpMap.dispose();
                if (mat.normalMap && typeof mat.normalMap.dispose === 'function') mat.normalMap.dispose();
                if (mat.specularMap && typeof mat.specularMap.dispose === 'function') mat.specularMap.dispose();
                if (mat.envMap && typeof mat.envMap.dispose === 'function') mat.envMap.dispose();
                
                mat.dispose();
            }
        }
    }

    // Gère le cas spécifique des matériaux de profondeur personnalisés
    if (obj.customDepthMaterial && typeof obj.customDepthMaterial.dispose === 'function') {
        obj.customDepthMaterial.dispose();
    }
}
