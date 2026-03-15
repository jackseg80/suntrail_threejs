import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';
import { fetchOverpassData } from './utils';

const buildingCache = new Map<string, any>();

export async function loadBuildingsForTile(tile: any) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14) return;
    
    // On ne charge QUE si on ne bouge pas (évite de saturer l'API en glissant)
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

    // Nettoyage si déjà présent
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

    const group = new THREE.Group();

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
                
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                group.add(mesh);
            } catch(e) {}
        }
    });

    if (group.children.length > 0) {
        tile.buildingMesh = group;
        tile.mesh.add(group);
    }
}
