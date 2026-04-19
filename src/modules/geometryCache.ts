import * as THREE from 'three';
import { BoundedCache } from './boundedCache';

/**
 * Cache interne pour les géométries de plans avec skirt (v5.29.38 : LRU).
 */
const geometryCache = new BoundedCache<string, THREE.BufferGeometry>({
    maxSize: 64, // Garder les 64 dernières résolutions/tailles utilisées
    onEvict: (_key, geometry) => {
        geometry.dispose();
    }
});

/**
 * Récupère ou crée une géométrie de plan avec skirt pour la résolution spécifiée.
 * v5.32.14 : Géométrie unitaire (1x1) — la taille réelle est appliquée via mesh.scale
 */
export function getPlaneGeometry(res: number): THREE.BufferGeometry {
    const key = `${res}`;
    const cached = geometryCache.get(key);
    if (cached) return cached;

    // On crée toujours une géométrie de taille 1.0, le Tile appliquera le scale.
    const newGeom = createPlaneWithSkirt(res, 1.0);
    geometryCache.set(key, newGeom);
    return newGeom;
}

function createPlaneWithSkirt(res: number, size: number): THREE.BufferGeometry {
    const plane = new THREE.PlaneGeometry(size, size, res, res);
    plane.rotateX(-Math.PI / 2);

    // Flip UVs Y
    const baseUvs = plane.attributes.uv.array as Float32Array;
    for (let i = 1; i < baseUvs.length; i += 2) baseUvs[i] = 1.0 - baseUvs[i];

    const basePos = plane.attributes.position.array as Float32Array;
    const baseNormals = plane.attributes.normal.array as Float32Array;
    const baseIndices = Array.from(plane.index!.array);
    const baseVertCount = (res + 1) * (res + 1);
    const stride = res + 1;

    // Périmètre dans le sens horaire (vu de dessus) — nécessaire pour que
    // les triangles du skirt aient leur face visible vers l'extérieur.
    const perim: number[] = [];
    for (let c = 0; c <= res; c++) perim.push(c);                            // top edge →
    for (let r = 1; r <= res; r++) perim.push(r * stride + res);             // right edge ↓
    for (let c = res - 1; c >= 0; c--) perim.push(res * stride + c);         // bottom edge ←
    for (let r = res - 1; r >= 1; r--) perim.push(r * stride);               // left edge ↑

    const skirtCount = perim.length;
    const totalVerts = baseVertCount + skirtCount;

    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);
    const normals = new Float32Array(totalVerts * 3);
    const aSkirt = new Float32Array(totalVerts); // 0 = surface, 1 = skirt

    // Copier la géométrie de base
    positions.set(basePos);
    uvs.set(baseUvs);
    normals.set(baseNormals);

    // Ajouter les vertices skirt (même position/UV que le bord, marqués aSkirt=1)
    for (let i = 0; i < skirtCount; i++) {
        const src = perim[i];
        const dst = baseVertCount + i;
        positions[dst * 3]     = basePos[src * 3];
        positions[dst * 3 + 1] = basePos[src * 3 + 1];
        positions[dst * 3 + 2] = basePos[src * 3 + 2];
        uvs[dst * 2]     = baseUvs[src * 2];
        uvs[dst * 2 + 1] = baseUvs[src * 2 + 1];
        normals[dst * 3]     = baseNormals[src * 3];
        normals[dst * 3 + 1] = baseNormals[src * 3 + 1];
        normals[dst * 3 + 2] = baseNormals[src * 3 + 2];
        aSkirt[dst] = 1.0;
    }

    // Triangles du skirt : 2 triangles par segment du périmètre.
    // Winding CCW face vers l'extérieur pour le sens horaire.
    const indices = baseIndices;
    for (let i = 0; i < skirtCount; i++) {
        const next = (i + 1) % skirtCount;
        const e0 = perim[i];
        const e1 = perim[next];
        const s0 = baseVertCount + i;
        const s1 = baseVertCount + next;
        indices.push(e0, s1, s0);
        indices.push(e0, e1, s1);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geom.setAttribute('aSkirt', new THREE.BufferAttribute(aSkirt, 1));
    geom.setIndex(indices);

    plane.dispose();
    return geom;
}

/**
 * Vide le cache de géométries et libère la mémoire.
 */
export function disposeAllGeometries(): void {
    geometryCache.clear();
}
