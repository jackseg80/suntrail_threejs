import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';

const poiCache = new Map<string, any>();

export async function loadPOIsForTile(tile: any) {
    if (!state.SHOW_SIGNPOSTS || tile.zoom < 14) return;
    if (state.controls && (state.controls as any)._isMoving) return;

    const cacheKey = `${tile.zoom}_${tile.tx}_${tile.ty}`;
    if (poiCache.has(cacheKey)) {
        renderPOIs(tile, poiCache.get(cacheKey));
        return;
    }

    const bounds = tile.getBounds();
    const query = `[out:json][timeout:30];node["information"~"guidepost|map|board"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});out body;`;

    try {
        const data = await fetchOverpassData(query);
        if (data && data.elements) {
            poiCache.set(cacheKey, data.elements);
            renderPOIs(tile, data.elements);
        }
    } catch (e) {}
}

function renderPOIs(tile: any, elements: any[]) {
    if (!elements || elements.length === 0 || !tile.mesh) return;

    // --- OPTIMISATION MÉMOIRE (Refactoring Phase 2) ---
    // Instanciation partagée pour tous les panneaux de la tuile
    const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 3);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const signGeo = new THREE.BoxGeometry(1.2, 0.4, 0.1);
    const signMat = new THREE.MeshStandardMaterial({ color: 0xffd700 });

    elements.forEach(el => {
        if (el.type === 'node') {
            const worldPos = tile.lngLatToLocal(el.lon, el.lat);
            const groundH = getAltitudeAt(tile.mesh.position.x + worldPos.x, tile.mesh.position.z + worldPos.z);
            
            const markerGroup = new THREE.Group();
            
            const pole = new THREE.Mesh(poleGeo, poleMat);
            pole.position.y = 1.5;
            markerGroup.add(pole);

            const sign = new THREE.Mesh(signGeo, signMat);
            sign.position.y = 2.8;
            markerGroup.add(sign);

            markerGroup.position.set(worldPos.x, groundH, worldPos.z);
            markerGroup.userData = { id: el.id, name: el.tags?.name || "Signalétique randonnée" };
            
            tile.mesh.add(markerGroup);
        }
    });
}
