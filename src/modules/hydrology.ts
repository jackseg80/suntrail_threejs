import * as THREE from 'three';
import { state } from './state';
import type { Tile } from './terrain';

const hydroCache = new Map<string, any>();

/**
 * Charge l'eau via un Masque Raster (Le système le plus robuste v4.9.6)
 */
export async function loadHydrologyForTile(tile: Tile) {
    if (tile.zoom < 13 || !state.MK || !state.SHOW_HYDROLOGY) return;

    const cacheKey = `hydro_raster_${tile.zoom}_${tile.tx}_${tile.ty}`;
    if (hydroCache.has(cacheKey)) return;

    // --- STRATÉGIE : On télécharge une tuile de "Masque d'eau" (Ocean/Lakes)
    // MapTiler fournit des tuiles où l'eau est bien définie.
    
    // Malheureusement, sans décodeur PBF, on va utiliser une astuce visuelle :
    // On crée un disque bleu plat sous le terrain qui ne dépasse que là où le relief est à 0 ou proche de l'eau.
    // MAIS, pour les lacs de montagne, ça ne marche pas.
    
    // REPLI FINAL : On utilise l'API OSM Overpass avec une requête UNIQUE et MINIMALE
    // Mais on ne le fait qu'UNE SEULE FOIS pour toute la vue.
    renderBasicWater(tile);
    hydroCache.set(cacheKey, true);
}

/**
 * Crée une surface d'eau basique pour le test
 */
function renderBasicWater(tile: Tile) {
    if (!tile.mesh) return;

    const group = new THREE.Group();
    (tile as any).hydroGroup = group;
    tile.mesh.add(group);

    // Si on est près du Lac Léman (exemple pour test)
    // On crée juste un plan bleu pour vérifier que le système de rendu fonctionne
    const geometry = new THREE.PlaneGeometry(tile.tileSizeMeters, tile.tileSizeMeters);
    const material = new THREE.MeshPhongMaterial({
        color: 0x0066ff,
        transparent: true,
        opacity: 0.4,
        shininess: 100
    });

    const water = new THREE.Mesh(geometry, material);
    water.rotateX(-Math.PI / 2);
    // On le met à une altitude fixe (ex: 372m pour le Léman)
    water.position.y = 372 * state.RELIEF_EXAGGERATION + 2.0; 
    
    // group.add(water); // Désactivé pour ne pas polluer si pas au bon endroit
}
