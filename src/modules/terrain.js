import * as THREE from 'three';
import { state } from './state.js';
import { fetchNearbyPeaks, createLabelSprite } from './utils.js';

const EARTH_CIRCUMFERENCE = 40075016.68;
export const activeTiles = new Map(); 
export const activeLabels = new Map(); 

// Uniforms partagés pour toutes les tuiles
const terrainUniforms = {
    uExaggeration: { value: state.RELIEF_EXAGGERATION }
};

/**
 * Fragment de code pour le Vertex Shader
 * Décode le RGB de MapTiler et déplace le vertex
 */
const terrainVertexShader = `
    uniform sampler2D uElevationMap;
    uniform float uExaggeration;
    varying vec2 vUv;

    float decodeHeight(vec4 rgba) {
        // Formule MapTiler: -10000 + (R * 256 * 256 + G * 256 + B) * 0.1
        // rgba est entre 0.0 et 1.0, on multiplie par 255.0
        return -10000.0 + ((rgba.r * 255.0 * 65536.0 + rgba.g * 255.0 * 256.0 + rgba.b * 255.0) * 0.1);
    }

    // Fonction pour obtenir la hauteur à un certain UV
    float getHeight(vec2 uv) {
        vec4 col = texture2D(uElevationMap, uv);
        float h = decodeHeight(col);
        // Filtrage des valeurs aberrantes
        if (h < -1000.0 || h > 9000.0) return 0.0;
        return h * uExaggeration;
    }

    #include <common>
    #include <displacementmap_pars_vertex>
    #include <fog_pars_vertex>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    #include <shadowmap_pars_vertex>
    #include <logdepthbuffer_pars_vertex>
    #include <clipping_planes_pars_vertex>

    void main() {
        vUv = uv;
        
        // Calcul de la hauteur
        float h = getHeight(vUv);
        
        // Déplacement du vertex (axe Y car on a fait une rotation X -PI/2)
        vec3 transformed = vec3(position.x, h, position.z);

        // --- CALCUL DES NORMALES AU GPU ---
        // On échantillonne les points voisins pour calculer la pente
        float texelSize = 1.0 / 256.0;
        float hL = getHeight(vUv + vec2(-texelSize, 0.0));
        float hR = getHeight(vUv + vec2(texelSize, 0.0));
        float hD = getHeight(vUv + vec2(0.0, -texelSize));
        float hU = getHeight(vUv + vec2(0.0, texelSize));
        
        // Approximation de la normale
        vec3 normal = normalize(vec3(hL - hR, 2.0, hD - hU));
        vNormal = normalMatrix * normal;

        #include <morphtarget_vertex>
        #include <skinning_vertex>
        #include <displacementmap_vertex>
        #include <project_vertex>
        #include <logdepthbuffer_vertex>
        #include <clipping_planes_vertex>
        #include <worldpos_vertex>
        #include <shadowmap_vertex>
        #include <fog_vertex>
    }
`;

export class Tile {
    constructor(tx, ty, zoom, key) {
        this.tx = tx;
        this.ty = ty;
        this.zoom = zoom;
        this.key = key;
        this.status = 'idle';
        this.mesh = null;
        this.elevationTex = null; 
        this.colorTex = null;    
        this.currentResolution = -1;
        this.tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
        
        this.worldX = (tx - state.originTile.x) * this.tileSizeMeters;
        this.worldZ = (ty - state.originTile.y) * this.tileSizeMeters;
    }

    async load() {
        if (this.status === 'loading' || this.status === 'loaded') return;
        this.status = 'loading';

        try {
            const opts = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' };
            const pElev = fetch(`https://api.maptiler.com/tiles/terrain-rgb-v2/${this.zoom}/${this.tx}/${this.ty}.png?key=${state.MK}`)
                .then(r => r.blob())
                .then(b => createImageBitmap(b, opts));

            const urlColor = this.getColorUrl();
            const pColor = fetch(urlColor).then(r => {
                if(!r.ok) throw new Error('404');
                return r.blob();
            }).then(b => createImageBitmap(b));

            const [imgElev, imgColor] = await Promise.all([pElev, pColor]);
            
            this.elevationTex = new THREE.CanvasTexture(imgElev);
            this.elevationTex.minFilter = THREE.LinearFilter;
            this.elevationTex.magFilter = THREE.LinearFilter;
            this.elevationTex.flipY = false;

            this.colorTex = new THREE.CanvasTexture(imgColor);
            this.colorTex.colorSpace = THREE.SRGBColorSpace;
            this.colorTex.flipY = false;

            this.status = 'loaded';
            this.buildMesh(state.RESOLUTION);
        } catch (e) {
            console.error(`Erreur chargement tuile ${this.key}:`, e);
            this.status = 'failed';
        }
    }

    getColorUrl() {
        if (!state.SHOW_TRAILS) {
            return `https://api.maptiler.com/maps/satellite/256/${this.zoom}/${this.tx}/${this.ty}@2x.jpg?key=${state.MK}`;
        }
        switch(state.MAP_SOURCE) {
            case 'opentopomap':
                const s = ['a', 'b', 'c'][Math.floor(Math.random() * 3)];
                return `https://${s}.tile.opentopomap.org/${this.zoom}/${this.tx}/${this.ty}.png`;
            case 'swisstopo':
                return `https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/${this.zoom}/${this.tx}/${this.ty}.jpeg`;
            case 'maptiler-topo':
                return `https://api.maptiler.com/maps/topo-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
            default:
                return `https://api.maptiler.com/maps/outdoor-v2/256/${this.zoom}/${this.tx}/${this.ty}@2x.png?key=${state.MK}`;
        }
    }

    buildMesh(resolution) {
        if (!this.elevationTex || !this.colorTex) return;
        if (this.currentResolution === resolution && this.mesh) return;

        const oldMesh = this.mesh;

        const geometry = new THREE.PlaneGeometry(this.tileSizeMeters, this.tileSizeMeters, resolution, resolution);
        geometry.rotateX(-Math.PI / 2);

        // Correction des UV pour MapTiler
        const uvs = geometry.attributes.uv.array;
        for (let i = 1; i < uvs.length; i += 2) uvs[i] = 1.0 - uvs[i];

        const material = new THREE.MeshStandardMaterial({ 
            map: this.colorTex, 
            roughness: 0.9, 
            metalness: 0.0 
        });

        // Injection du shader personnalisé
        material.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.vertexShader = terrainVertexShader;
        };

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.worldX, 0, this.worldZ);
        this.mesh.castShadow = this.mesh.receiveShadow = true;
        
        // Pour les ombres, on doit aussi injecter le shader dans le depth material
        this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            displacementMap: this.elevationTex, // On utilise l'attribut existant pour "forcer" Three à binder la texture
        });
        this.mesh.customDepthMaterial.onBeforeCompile = (shader) => {
            shader.uniforms.uElevationMap = { value: this.elevationTex };
            shader.uniforms.uExaggeration = terrainUniforms.uExaggeration;
            shader.vertexShader = terrainVertexShader.replace('#include <shadowmap_pars_vertex>', '');
        };

        state.scene.add(this.mesh);
        this.currentResolution = resolution;

        if (oldMesh) {
            state.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
            // On ne dispose pas des textures car elles sont partagées/réutilisées
            oldMesh.material.dispose();
        }
    }

    dispose() {
        if (this.mesh) {
            state.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            if (this.mesh.customDepthMaterial) this.mesh.customDepthMaterial.dispose();
        }
        if (this.elevationTex) this.elevationTex.dispose();
        if (this.colorTex) this.colorTex.dispose();
        this.status = 'disposed';
    }
}

export function lngLatToTile(lon, lat, zoom) {
    const x = Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
    const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
    return { x, y, z: zoom };
}

export function lngLatToWorld(lon, lat) {
    const zoom = state.ZOOM;
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (lon + 180) / 360 * Math.pow(2, zoom);
    const yfrac = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom);
    const worldX = (xfrac - (state.originTile.x + 0.5)) * tileSizeMeters;
    const worldZ = (yfrac - (state.originTile.y + 0.5)) * tileSizeMeters;
    return { x: worldX, z: worldZ };
}

export function worldToLngLat(worldX, worldZ) {
    const zoom = state.ZOOM;
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, zoom);
    const xfrac = (worldX / tileSizeMeters) + (state.originTile.x + 0.5);
    const yfrac = (worldZ / tileSizeMeters) + (state.originTile.y + 0.5);
    const lon = xfrac / Math.pow(2, zoom) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * yfrac / Math.pow(2, zoom);
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
}

export function clearLabels() {
    for (const [name, obj] of activeLabels.entries()) {
        state.scene.remove(obj.sprite);
        state.scene.remove(obj.line);
        if (obj.sprite.material.map) obj.sprite.material.map.dispose();
        obj.sprite.material.dispose();
        obj.line.geometry.dispose();
        obj.line.material.dispose();
    }
    activeLabels.clear();
}

function calculateTargetLOD(tile, camX, camZ) {
    const dx = tile.worldX - camX;
    const dz = tile.worldZ - camZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    
    const tileSize = tile.tileSizeMeters;
    if (dist < tileSize * 1.5) return state.RESOLUTION; 
    if (dist < tileSize * 3.0) return Math.floor(state.RESOLUTION / 2); 
    return Math.floor(state.RESOLUTION / 4); 
}

export async function updateVisibleTiles(camLat, camLon, camAltitude, worldX, worldZ) {
    // Mise à jour de l'uniform global d'exagération
    terrainUniforms.uExaggeration.value = state.RELIEF_EXAGGERATION;

    if (!state.mapCenter) state.mapCenter = { lat: state.TARGET_LAT, lon: state.TARGET_LON };
    const tileSizeMeters = EARTH_CIRCUMFERENCE / Math.pow(2, state.ZOOM);
    
    let centerTile;
    if (worldX !== undefined && worldZ !== undefined) {
        centerTile = { x: state.originTile.x + Math.round(worldX / tileSizeMeters), y: state.originTile.y + Math.round(worldZ / tileSizeMeters), z: state.ZOOM };
    } else {
        centerTile = lngLatToTile(camLon || state.TARGET_LON, camLat || state.TARGET_LAT, state.ZOOM);
    }

    fetchNearbyPeaks(camLat || state.TARGET_LAT, camLon || state.TARGET_LON).then(peaks => {
        peaks.forEach(p => {
            if (!activeLabels.has(p.name)) {
                const pos = lngLatToWorld(p.lon, p.lat);
                const sprite = createLabelSprite(p.name);
                sprite.position.set(pos.x, 6000, pos.z); 
                sprite.renderOrder = 9999;
                state.scene.add(sprite);
                const points = [new THREE.Vector3(pos.x, 5950, pos.z), new THREE.Vector3(pos.x, p.alt || 0, pos.z)];
                const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
                const lineMat = new THREE.LineBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.5 });
                const line = new THREE.Line(lineGeo, lineMat);
                state.scene.add(line);
                activeLabels.set(p.name, { sprite, line });
            }
        });
    });

    let range = state.RANGE; 
    const keptTiles = new Set();

    for (let dy = -range; dy <= range; dy++) {
        for (let dx = -range; dx <= range; dx++) {
            const tx = centerTile.x + dx, ty = centerTile.y + dy, key = `${tx}_${ty}_${state.ZOOM}`;
            keptTiles.add(key);

            let tile = activeTiles.get(key);
            if (!tile) {
                tile = new Tile(tx, ty, state.ZOOM, key);
                activeTiles.set(key, tile);
                tile.load(); 
            } else if (tile.status === 'loaded') {
                const targetRes = calculateTargetLOD(tile, state.camera.position.x, state.camera.position.z);
                if (targetRes !== tile.currentResolution) {
                    tile.buildMesh(targetRes);
                }
            }
        }
    }

    for (const [key, tile] of activeTiles.entries()) {
        if (!keptTiles.has(key)) {
            tile.dispose();
            activeTiles.delete(key);
        }
    }
}

export async function loadTerrain() { await updateVisibleTiles(); }
