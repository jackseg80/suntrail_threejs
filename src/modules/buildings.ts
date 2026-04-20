import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { state } from './state';
import { Tile } from './terrain/Tile';
import { getAltitudeAt } from './analysis';
import { fetchLandcoverPBF } from './landcover';
import { isPositionInSwitzerland } from './geo';
import { fetchOverpassData, isOverpassInBackoff } from './utils';
import { BoundedCache } from './boundedCache';

const overpassMemoryCache = new BoundedCache<string, any[]>({ maxSize: 100 });
const overpassFetchPromises = new Map<string, Promise<any[] | null>>();
const zoneFailureCooldown = new Map<string, number>();

const buildingMaterial = new THREE.MeshStandardMaterial({
    color: 0xcccccc,
    roughness: 0.7,
    metalness: 0.2,
    side: THREE.DoubleSide
});

const buildingMaterial2D = new THREE.MeshBasicMaterial({
    color: 0xcccccc,
    side: THREE.DoubleSide
});

export async function loadBuildingsForTile(tile: Tile) {
    if (!state.SHOW_BUILDINGS || tile.zoom < 14 || (tile.status as string) === 'disposed') return;
    if (tile.buildingGroup) return;

    if (state.isUserInteracting) {
        setTimeout(() => loadBuildingsForTile(tile), 1000);
        return;
    }

    const landcover = await fetchLandcoverPBF(tile);
    if (landcover && landcover.buildings && landcover.buildings.length > 0) {
        renderBuildingsPBF(tile, landcover.buildings);
        return;
    }

    if (isOverpassInBackoff()) return;
    const zoneZ = 14;
    const ratio = Math.pow(2, tile.zoom - zoneZ);
    const zx = Math.floor(tile.tx / ratio), zy = Math.floor(tile.ty / ratio);
    const zoneKey = `bld_z${zoneZ}_${zx}_${zy}`;

    if ((zoneFailureCooldown.get(zoneKey) || 0) > Date.now()) return;

    let buildings = overpassMemoryCache.get(zoneKey);
    if (!buildings) {
        let promise = overpassFetchPromises.get(zoneKey);
        if (!promise) {
            promise = fetchBuildingsOverpassWithCache(zoneZ, zx, zy, zoneKey);
            overpassFetchPromises.set(zoneKey, promise);
        }
        buildings = await promise;
        if (buildings) overpassMemoryCache.set(zoneKey, buildings);
        else zoneFailureCooldown.set(zoneKey, Date.now() + 60000);
        overpassFetchPromises.delete(zoneKey);
    }

    if (!buildings || buildings.length === 0 || (tile.status as string) === 'disposed') return;

    const bounds = tile.getBounds();
    const latPad = (bounds.north - bounds.south) * 0.05, lonPad = (bounds.east - bounds.west) * 0.05;
    const tileBuildings = buildings.filter(el => {
        if (!el.geometry || el.geometry.length === 0) return false;
        let slat = 0, slon = 0;
        el.geometry.forEach((p: any) => { slat += p.lat; slon += p.lon; });
        const clat = slat / el.geometry.length, clon = slon / el.geometry.length;
        return clat <= (bounds.north + latPad) && clat >= (bounds.south - latPad) &&
               clon <= (bounds.east + lonPad) && clon >= (bounds.west - lonPad);
    });

    if (tileBuildings.length > 0) renderBuildingsOverpass(tile, tileBuildings);
}

async function fetchBuildingsOverpassWithCache(z: number, x: number, y: number, key: string): Promise<any[] | null> {
    try {
        const cache = await caches.open('suntrail-buildings-v4');
        const cached = await cache.match(key);
        if (cached) return await cached.json();
    } catch (e) {}

    const n = Math.pow(2, z);
    const w = x / n * 360 - 180, e = (x + 1) / n * 360 - 180;
    const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    const latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 1) / n))) * 180 / Math.PI;

    const query = `[out:json][timeout:25];way["building"](${latS.toFixed(4)},${w.toFixed(4)},${latN.toFixed(4)},${e.toFixed(4)});out body geom;`;
    const data = await fetchOverpassData(query);
    if (data && data.elements) {
        try {
            const cache = await caches.open('suntrail-buildings-v4');
            await cache.put(key, new Response(JSON.stringify(data.elements)));
        } catch(e) {}
        return data.elements;
    }
    return null;
}

function renderBuildingsOverpass(tile: Tile, elements: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;
    const geometries: THREE.BufferGeometry[] = [];
    elements.slice(0, 150).forEach(el => {
        if (!el.geometry || el.geometry.length < 3) return;
        const ring = el.geometry.map((p: any) => {
            const lp = tile.lngLatToLocal(p.lon, p.lat);
            return new THREE.Vector2(lp.x, lp.z);
        });
        try {
            let ax = 0, az = 0;
            ring.forEach(p => { ax += p.x; az += p.y; });
            const worldX = tile.worldX + (ax / ring.length);
            const worldZ = tile.worldZ + (az / ring.length);
            const baseAlt = getAltitudeAt(worldX, worldZ, tile);

            const levels = el.tags?.['building:levels'] || el.tags?.levels || 2;
            const h = parseFloat(levels as string) * 3.5 * state.RELIEF_EXAGGERATION;
            geometries.push(createBuildingManualGeometry([ring], h, 10 * state.RELIEF_EXAGGERATION, baseAlt));
        } catch (e) {}
    });
    finalizeBuildings(tile, geometries);
}

function renderBuildingsPBF(tile: Tile, buildings: any[]) {
    if ((tile.status as string) === 'disposed' || !tile.mesh) return;

    const n = Math.pow(2, tile.zoom);
    const lonC = (tile.tx + 0.5) / n * 360 - 180;
    const latC = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tile.ty + 0.5) / n))) * 180 / Math.PI;
    const ratio = Math.pow(2, tile.zoom - (isPositionInSwitzerland(latC, lonC) ? 12 : 10));
    const rtx = Math.floor(tile.tx / ratio), rty = Math.floor(tile.ty / ratio);
    const offX = rtx * ratio - tile.tx, offY = rty * ratio - tile.ty;
    const scale = tile.tileSizeMeters;

    const geometries: THREE.BufferGeometry[] = [];
    let count = 0;

    buildings.forEach(feat => {
        if (count >= 150) return;
        
        const bbox = feat.bbox;
        const extent = feat.extent || 4096;
        if (bbox) {
            const tMinX = (tile.tx % ratio) * (extent / ratio);
            const tMaxX = tMinX + (extent / ratio);
            const tMinY = (tile.ty % ratio) * (extent / ratio);
            const tMaxY = tMinY + (extent / ratio);
            if (bbox.maxX < tMinX || bbox.minX > tMaxX || bbox.maxY < tMinY || bbox.minY > tMaxY) return;
        }

        const rings = feat.geometry;
        if (!rings || rings.length === 0) return;

        const processed: THREE.Vector2[][] = rings.map((r: any[]) => r.map(p => new THREE.Vector2(
            (p.x / extent * ratio + offX) * scale - scale * 0.5,
            (p.y / extent * ratio + offY) * scale - scale * 0.5
        )));

        if (processed[0].length > 2) {
            try {
                let ax = 0, az = 0;
                processed[0].forEach(p => { ax += p.x; az += p.y; });
                const worldX = tile.worldX + (ax / processed[0].length);
                const worldZ = tile.worldZ + (az / processed[0].length);
                const baseAlt = getAltitudeAt(worldX, worldZ, tile);
                
                const props = feat.properties;
                const levels = props?.['building:levels'] || props?.levels || 2;
                const h = (typeof levels === 'number' ? levels : parseFloat(levels)) * 3.5 * state.RELIEF_EXAGGERATION;

                geometries.push(createBuildingManualGeometry(processed, h, 10 * state.RELIEF_EXAGGERATION, baseAlt));
                count++;
            } catch (e) {}
        }
    });
    finalizeBuildings(tile, geometries);
}

function finalizeBuildings(tile: Tile, geometries: THREE.BufferGeometry[]) {
    if (geometries.length > 0) {
        try {
            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            if (!merged) return;
            const mesh = new THREE.Mesh(merged, state.IS_2D_MODE ? buildingMaterial2D : buildingMaterial);
            mesh.castShadow = !state.IS_2D_MODE && state.PERFORMANCE_PRESET !== 'low';
            mesh.receiveShadow = !state.IS_2D_MODE;

            if (tile.buildingGroup && state.scene) state.scene.remove(tile.buildingGroup);
            tile.buildingGroup = new THREE.Group();
            tile.buildingGroup.add(mesh);
            tile.buildingGroup.position.set(tile.worldX, 0, tile.worldZ);
            if (state.scene) state.scene.add(tile.buildingGroup);
        } catch (e) { console.warn('[Buildings] Merge failed', e); }
        finally { geometries.forEach(g => g.dispose()); }
    }
}

function createBuildingManualGeometry(rings: THREE.Vector2[][], height: number, skirt: number, baseAlt: number): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const yB = baseAlt - skirt, yT = baseAlt + height;

    if (rings.length > 0 && rings[0].length >= 3) {
        try {
            const shape = new THREE.Shape(rings[0]);
            for (let i = 1; i < rings.length; i++) {
                if (rings[i].length >= 3) shape.holes.push(new THREE.Path(rings[i]));
            }
            const roof = new THREE.ShapeGeometry(shape);
            const pos = roof.attributes.position;
            for (let j = 0; j < pos.count; j++) {
                pos.setXYZ(j, pos.getX(j), yT, pos.getY(j));
            }
            roof.deleteAttribute('uv');
            roof.deleteAttribute('normal');
            geometries.push(roof);
        } catch (e) {}
    }

    const v: number[] = [], idx: number[] = [];
    let o = 0;
    rings.forEach(ring => {
        for (let i = 0; i < ring.length; i++) {
            const p1 = ring[i], p2 = ring[(i + 1) % ring.length];
            if (((p2.x - p1.x)**2 + (p2.y - p1.y)**2) < 0.01) continue;
            v.push(p1.x, yB, p1.y, p2.x, yB, p2.y, p2.x, yT, p2.y, p1.x, yT, p1.y);
            idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
            o += 4;
        }
    });

    if (v.length > 0) {
        const wall = new THREE.BufferGeometry();
        wall.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
        wall.setIndex(idx);
        geometries.push(wall);
    }

    if (geometries.length === 0) return new THREE.BufferGeometry();
    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    geometries.forEach(g => g.dispose());
    if (merged) merged.computeVertexNormals();
    return merged || new THREE.BufferGeometry();
}
