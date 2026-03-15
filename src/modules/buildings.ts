import * as THREE from 'three';
import { state } from './state';
import { getAltitudeAt } from './analysis';

const buildingCache = new Map<string, any>();

/**
 * Charge les bâtiments 3D via l'API MapTiler Planet (GeoJSON tiles)
 * Plus stable et rapide que Overpass API (v4.5.41)
 */
export async function loadBuildingsForTile(tile: any) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 15) return;

    const cacheKey = `mt_bld_${tile.zoom}_${tile.tx}_${tile.ty}`;
    if (buildingCache.has(cacheKey)) {
        renderBuildings(tile, buildingCache.get(cacheKey));
        return;
    }

    // Utilisation de l'API MapTiler Data (GeoJSON) pour la tuile de bâtiments
    const url = `https://api.maptiler.com/tiles/v3-buildings/${tile.zoom}/${tile.tx}/${tile.ty}.geojson?key=${state.MK}`;

    try {
        const response = await fetch(url);
        if (!response.ok) return;
        
        const data = await response.json();
        if (data && data.features) {
            // Filtrage pour ne garder que les objets volumétriques (bâtiments)
            const buildings = data.features.filter((f: any) => f.properties.render_height || f.properties.height || f.properties.kind === 'building');
            buildingCache.set(cacheKey, buildings);
            if (tile.status !== 'disposed') renderBuildings(tile, buildings);
        }
    } catch (e) {
        console.warn("MapTiler Buildings load failed", e);
    }
}

function renderBuildings(tile: any, features: any[]) {
    if (!features || features.length === 0 || !tile.mesh || tile.status === 'disposed') return;

    if (tile.buildingMesh) {
        tile.mesh.remove(tile.buildingMesh);
        tile.buildingMesh = null;
    }

    const material = new THREE.MeshStandardMaterial({ 
        color: 0xaaaaaa, 
        roughness: 0.5, 
        metalness: 0.1,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
    });

    const buildingGroup = new THREE.Group();

    features.forEach(feature => {
        const geom = feature.geometry;
        if (!geom || (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')) return;

        const renderPolygon = (coords: any[][]) => {
            const points: THREE.Vector2[] = [];
            coords[0].forEach((p: any) => {
                const localPos = tile.lngLatToLocal(p[0], p[1]);
                points.push(new THREE.Vector2(localPos.x, localPos.z));
            });

            if (points.length < 3) return;

            try {
                const shape = new THREE.Shape(points);
                // MapTiler fournit 'render_height' ou 'height'
                const h = feature.properties.render_height || feature.properties.height || 6;
                const height = h * state.RELIEF_EXAGGERATION;
                
                const extrudeGeom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
                
                // On cale sur l'altitude du premier point
                const baseAlt = getAltitudeAt(tile.mesh.position.x + points[0].x, tile.mesh.position.z + points[0].y);
                
                extrudeGeom.rotateX(-Math.PI / 2);
                extrudeGeom.translate(0, baseAlt, 0);
                
                const mesh = new THREE.Mesh(extrudeGeom, material);
                mesh.castShadow = state.SHADOWS;
                mesh.receiveShadow = true;
                buildingGroup.add(mesh);
            } catch (err) {}
        };

        if (geom.type === 'Polygon') {
            renderPolygon(geom.coordinates);
        } else {
            geom.coordinates.forEach((poly: any) => renderPolygon(poly));
        }
    });

    if (buildingGroup.children.length > 0) {
        tile.buildingMesh = buildingGroup;
        tile.mesh.add(buildingGroup);
    }
}
