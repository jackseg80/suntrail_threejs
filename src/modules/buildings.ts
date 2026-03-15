import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';

const buildingCache = new Map<string, any>();

export async function loadBuildingsForTile(tile: any) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14) return;
    
    if (state.controls && (state.controls as any)._isMoving) return;

    const cacheKey = `${tile.zoom}_${tile.tx}_${tile.ty}`;
    if (buildingCache.has(cacheKey)) {
        renderBuildings(tile, buildingCache.get(cacheKey));
        return;
    }

    const bounds = tile.getBounds();
    const query = `[out:json][timeout:30];(way["building"](${bounds.south},${bounds.west},${bounds.north},${bounds.east});way["tourism"="alpine_hut"](${bounds.south},${bounds.west},${bounds.north},${bounds.east}););out body geom;`;

    try {
        const data = await fetchOverpassData(query);
        if (data && data.elements) {
            buildingCache.set(cacheKey, data.elements);
            renderBuildings(tile, data.elements);
        }
    } catch (e) {}
}

function renderBuildings(tile: any, elements: any[]) {
    if (!elements || elements.length === 0 || !tile.mesh) return;

    if (tile.buildingMesh) {
        tile.mesh.remove(tile.buildingMesh);
        tile.buildingMesh = null;
    }

    const material = new THREE.MeshStandardMaterial({ 
        color: 0x888888, 
        roughness: 0.7, 
        metalness: 0.2,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
    });

    // --- OPTIMISATION MASSIVE (v4.5.43) ---
    // Au lieu de créer un Mesh par bâtiment (des centaines de Draw Calls),
    // on collecte toutes les géométries et on les fusionne en UNE SEULE.
    const geometries: THREE.BufferGeometry[] = [];

    elements.forEach(el => {
        if (el.type === 'way' && el.geometry) {
            const points: THREE.Vector2[] = [];
            el.geometry.forEach((p: any) => {
                const worldPos = tile.lngLatToLocal(p.lon, p.lat);
                points.push(new THREE.Vector2(worldPos.x, worldPos.z));
            });

            try {
                const shape = new THREE.Shape(points);
                const height = (el.tags?.['building:levels'] ? el.tags['building:levels'] * 3.5 : 6) * state.RELIEF_EXAGGERATION;
                const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
                
                const centerPoint = tile.lngLatToLocal(el.geometry[0].lon, el.geometry[0].lat);
                const baseAlt = getAltitudeAt(tile.mesh.position.x + centerPoint.x, tile.mesh.position.z + centerPoint.z);
                
                geometry.rotateX(-Math.PI / 2);
                geometry.translate(0, baseAlt, 0);
                
                geometries.push(geometry);
            } catch(e) {}
        }
    });

    if (geometries.length > 0) {
        // Fusion (Merge) de toutes les géométries en une seule
        const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
        if (mergedGeometry) {
            const mergedMesh = new THREE.Mesh(mergedGeometry, material);
            mergedMesh.castShadow = true;
            mergedMesh.receiveShadow = true;
            
            tile.buildingMesh = mergedMesh;
            tile.mesh.add(mergedMesh);
        }
    }
}
