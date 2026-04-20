import * as THREE from 'three';
import { state } from './state';
import { Tile } from './terrain/Tile';
import { fetchLandcoverPBF } from './landcover';
import { isPositionInSwitzerland } from './geo';

/**
 * Charge l'hydrologie via Vector Tiles PBF et génère un masque 2D de haute précision (v5.33.5)
 * Cette approche "Texture Mask" résout tous les problèmes d'élévation, de découpage,
 * de Z-fighting et de tesselation en appliquant l'eau directement dans le shader du terrain.
 */
export async function loadHydrologyForTile(tile: Tile) {
    if (!state.SHOW_HYDROLOGY || tile.zoom < 14 || (tile.status as string) === 'disposed') return;
    
    // Si la texture est déjà générée ou en cours pour cette tuile, on ignore.
    if (tile.waterMaskTex) return;

    const landcover = await fetchLandcoverPBF(tile);
    if (!landcover || !landcover.water || landcover.water.length === 0 || (tile.status as string) === 'disposed') return;

    renderHydrologyMask(tile, landcover.water);
}

function renderHydrologyMask(tile: Tile, waterFeatures: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const nTile = Math.pow(2, tile.zoom);
    const lonTileCenter = (tile.tx + 0.5) / nTile * 360 - 180;
    const latRadTileCenter = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 0.5) / nTile)));
    const latTileCenter = latRadTileCenter * 180 / Math.PI;
    const inCH = isPositionInSwitzerland(latTileCenter, lonTileCenter);

    const requestZoom = inCH ? 12 : 10;
    const ratio = Math.pow(2, tile.zoom - requestZoom);
    const rtx = Math.floor(tile.tx / ratio);
    const rty = Math.floor(tile.ty / ratio);
    
    // v5.34.5 : Constantes de projection linéaire pour court-circuiter la trigonométrie
    const offsetX = rtx * ratio - tile.tx;
    const offsetY = rty * ratio - tile.ty;

    const MASK_SIZE = 256;
    const canvas = document.createElement('canvas');
    canvas.width = MASK_SIZE;
    canvas.height = MASK_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fond noir (pas d'eau)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
    
    // Polygones blancs (eau)
    ctx.fillStyle = '#FFF';

    let drawn = false;

    waterFeatures.forEach(feat => {
        if (feat.type !== 3) return;

        const rings = feat.geometry;
        if (!rings || rings.length === 0) return;
        
        const extent = feat.extent || 4096;
        const bbox = feat.bbox;

        // v5.33.6 : Filtrage spatial ultra-rapide (Bounding Box)
        if (bbox) {
            const tileMinX = (tile.tx % ratio) * (extent / ratio);
            const tileMaxX = tileMinX + (extent / ratio);
            const tileMinY = (tile.ty % ratio) * (extent / ratio);
            const tileMaxY = tileMinY + (extent / ratio);

            if (bbox.maxX < tileMinX || bbox.minX > tileMaxX || bbox.maxY < tileMinY || bbox.minY > tileMaxY) {
                return;
            }
        }

        ctx.beginPath();
        rings.forEach((ring: any[]) => {
            ring.forEach((p: any, i: number) => {
                // v5.34.5 : Projection Mercator Directe (Court-circuit mathématique)
                // Comme le PBF est déjà en Web Mercator, la conversion est une simple homothétie.
                const px = (p.x / extent * ratio + offsetX) * MASK_SIZE;
                const py = (p.y / extent * ratio + offsetY) * MASK_SIZE;
                
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.closePath();
        });
        
        // 'evenodd' gère parfaitement et automatiquement les îles (trous) dans les multipolygones
        ctx.fill('evenodd');
        drawn = true;
    });

    if (drawn) {
        const waterTex = new THREE.CanvasTexture(canvas);
        waterTex.flipY = false; // Essentiel : aligne l'orientation UV avec la géométrie du terrain
        waterTex.generateMipmaps = false;
        // LinearFilter permet des bords de lacs/rivières adoucis
        waterTex.minFilter = THREE.LinearFilter;
        waterTex.magFilter = THREE.LinearFilter;
        // Clamp pour éviter que l'eau ne "fuite" sur le bord opposé
        waterTex.wrapS = THREE.ClampToEdgeWrapping;
        waterTex.wrapT = THREE.ClampToEdgeWrapping;
        
        tile.waterMaskTex = waterTex;

        // Mise à jour immédiate du shader de terrain s'il est déjà compilé
        if (tile.mesh && tile.mesh.material) {
            const shader = (tile.mesh.material as any).userData.shader;
            if (shader) {
                shader.uniforms.uWaterMask.value = waterTex;
                shader.uniforms.uHasWaterMask.value = true;
            }
        }
    }
}
