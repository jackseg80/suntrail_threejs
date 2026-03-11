import * as THREE from 'three';
import gpxParser from 'gpxparser';
import { state } from './state.js';
import { updateSunPosition } from './sun.js';
import { initScene } from './scene.js';
import { loadTerrain, updateVisibleTiles, activeTiles, lngLatToTile, clearLabels, lngLatToWorld, worldToLngLat, resetTerrain, updateGPXMesh } from './terrain.js';
import { isPositionInSwitzerland } from './utils.js';

export function initUI() {
    const s1 = localStorage.getItem('maptiler_key_3d');
    if (s1) document.getElementById('k1').value = s1;
    
    document.getElementById('bgo').addEventListener('click', go);
    document.getElementById('k1').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    
    const gpxBtn = document.getElementById('gpx-btn');
    const gpxUpload = document.getElementById('gpx-upload');
    const trailFollowToggle = document.getElementById('trail-follow-toggle');

    gpxBtn.addEventListener('click', () => gpxUpload.click());
    gpxUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => handleGPX(event.target.result);
        reader.readAsText(file);
    });

    trailFollowToggle.addEventListener('change', (e) => {
        state.isFollowingTrail = e.target.checked;
        if (state.isFollowingTrail && state.gpxPoints.length > 0) {
            state.trailProgress = 0;
            if (state.controls) state.controls.enabled = false;
        } else {
            if (state.controls) state.controls.enabled = true;
        }
    });

    const dateInput = document.getElementById('date-input');
    dateInput.valueAsDate = state.simDate;
    dateInput.addEventListener('change', (e) => {
        state.simDate = new Date(e.target.value);
        updateSunPosition(document.getElementById('time-slider').value);
    });

    const timeSlider = document.getElementById('time-slider');
    timeSlider.addEventListener('input', (e) => {
        updateSunPosition(e.target.value);
    });

    window.addEventListener('click', (e) => {
        if (!state.renderer || !state.camera || !state.scene) return;
        if (e.target.tagName !== 'CANVAS') return;
        
        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, state.camera);
        
        const meshes = [];
        const meshToTile = new Map();
        for (const tile of activeTiles.values()) {
            if (tile && tile.mesh) {
                meshes.push(tile.mesh);
                meshToTile.set(tile.mesh.id, tile);
            }
        }

        const intersects = raycaster.intersectObjects(meshes);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const tile = meshToTile.get(hit.object.id);
            const gps = worldToLngLat(hit.point.x, hit.point.z);
            
            let realAlt = 0;
            if (tile && tile.elevationTex && tile.elevationTex.image) {
                const canvas = document.createElement('canvas');
                canvas.width = 256; canvas.height = 256;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(tile.elevationTex.image, 0, 0);
                const uv = hit.uv; 
                const px = Math.floor(uv.x * 255);
                const py = Math.floor((1.0 - uv.y) * 255);
                const data = ctx.getImageData(px, py, 1, 1).data;
                realAlt = -10000 + ((data[0] * 65536 + data[1] * 256 + data[2]) * 0.1);
            }

            const panel = document.getElementById('coords-panel');
            panel.style.display = 'block';
            document.getElementById('click-latlon').textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            document.getElementById('click-alt').textContent = `${Math.round(realAlt)} m`;
        } else {
            document.getElementById('coords-panel').style.display = 'none';
        }
    });

    const mapSourceSelect = document.getElementById('map-source-select');
    mapSourceSelect.addEventListener('change', async (e) => {
        state.MAP_SOURCE = e.target.value;
        await refreshTerrain();
    });

    document.getElementById('play-btn').addEventListener('click', () => {
        state.isAnimating = !state.isAnimating;
        const btn = document.getElementById('play-btn');
        btn.textContent = state.isAnimating ? "⏸ Pause" : "▶ Lecture";
    });

    document.getElementById('speed-select').addEventListener('change', (e) => {
        state.animationSpeed = parseFloat(e.target.value);
    });

    document.getElementById('res-slider').addEventListener('change', async (e) => {
        state.RESOLUTION = parseInt(e.target.value);
        document.getElementById('res-disp').textContent = state.RESOLUTION;
        await refreshTerrain();
    });

    document.getElementById('range-slider').addEventListener('change', async (e) => {
        state.RANGE = parseInt(e.target.value);
        document.getElementById('range-disp').textContent = state.RANGE;
        await refreshTerrain();
    });

    document.getElementById('exag-slider').addEventListener('change', async (e) => {
        state.RELIEF_EXAGGERATION = parseFloat(e.target.value);
        document.getElementById('exag-disp').textContent = state.RELIEF_EXAGGERATION.toFixed(1);
        await updateVisibleTiles();
    });

    // --- RÉTABLISSEMENT DU BROUILLARD ---
    const fogSlider = document.getElementById('fog-slider');
    fogSlider.addEventListener('input', (e) => {
        state.FOG_DENSITY = parseFloat(e.target.value) / 1000000;
        document.getElementById('fog-disp').textContent = e.target.value;
        if (state.scene && state.scene.fog) {
            state.scene.fog.density = state.FOG_DENSITY;
        }
    });

    // --- RÉTABLISSEMENT DES OMBRES ---
    document.getElementById('shadow-toggle').addEventListener('change', (e) => {
        state.SHADOWS = e.target.checked;
        if (state.sunLight) state.sunLight.castShadow = state.SHADOWS;
    });

    // --- RÉTABLISSEMENT DES SENTIERS ---
    document.getElementById('trails-toggle').addEventListener('change', async (e) => {
        state.SHOW_TRAILS = e.target.checked;
        await refreshTerrain();
    });

    // --- RÉTABLISSEMENT PIXEL RATIO ---
    document.getElementById('pixel-limit-select').addEventListener('change', (e) => {
        state.PIXEL_RATIO_LIMIT = parseFloat(e.target.value);
        if (state.renderer) state.renderer.setPixelRatio(state.PIXEL_RATIO_LIMIT);
    });

    initGeocoding();
    initCollapsibles();
}

export function autoSelectMapSource(lat, lon) {
    const isSwiss = isPositionInSwitzerland(lat, lon);
    if (state.MAP_SOURCE === 'swisstopo' && !isSwiss) {
        const isReallyOutside = (lat < 45.75 || lat > 47.85 || lon < 5.85 || lon > 10.55);
        if (!isReallyOutside) return; 
    }
    const newSource = isSwiss ? 'swisstopo' : 'opentopomap';
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        const select = document.getElementById('map-source-select');
        if (select) select.value = newSource;
        console.log(`Auto-switching map source to: ${newSource}`);
    }
}

function initCollapsibles() {
    const panel = document.getElementById('panel');
    const panelToggle = document.getElementById('panel-toggle');
    const toggleIcon = document.getElementById('toggle-icon');
    panelToggle.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
        toggleIcon.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
    });
    const perfHeader = document.getElementById('perf-header');
    const perfContent = document.getElementById('perf-content');
    perfHeader.addEventListener('click', () => {
        perfContent.classList.toggle('collapsed');
        perfHeader.classList.toggle('collapsed');
    });
}

async function refreshTerrain() {
    resetTerrain();
    if (state.rawGpxData) updateGPXMesh(); 
    await updateVisibleTiles();
}

async function handleGPX(xml) {
    const gpx = new gpxParser();
    gpx.parse(xml);
    if (!gpx.tracks || !gpx.tracks.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    autoSelectMapSource(startPt.lat, startPt.lon);
    resetTerrain();
    state.TARGET_LAT = startPt.lat;
    state.TARGET_LON = startPt.lon;
    state.originTile = lngLatToTile(startPt.lon, startPt.lat, state.ZOOM);
    updateGPXMesh();
    document.getElementById('trail-controls').style.display = 'block';
    document.getElementById('gpx-dist').textContent = `${(gpx.tracks[0].distance.total / 1000).toFixed(1)} km`;
    document.getElementById('gpx-elev').textContent = `+${Math.round(gpx.tracks[0].elevation.pos)}m / -${Math.round(gpx.tracks[0].elevation.neg)}m`;
    if (state.controls) {
        state.controls.target.set(state.gpxPoints[0].x, state.gpxPoints[0].y, state.gpxPoints[0].z);
        state.camera.position.set(state.gpxPoints[0].x, state.gpxPoints[0].y + 2000, state.gpxPoints[0].z + 4000);
        state.controls.update();
    }
    await updateVisibleTiles();
}

function go() {
    state.MK = document.getElementById('k1').value.trim();
    if (!state.MK || state.MK.length < 5) {
        document.getElementById('serr').textContent = 'Clé MapTiler invalide.';
        return;
    }
    localStorage.setItem('maptiler_key_3d', state.MK);
    document.getElementById('setup-screen').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    document.getElementById('panel-toggle').style.display = 'flex';
    autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
    initScene();
}

function initGeocoding() {
    const geoInput = document.getElementById('geo-input');
    const geoResults = document.getElementById('geo-results');
    let geoTimer = null;
    geoInput.addEventListener('input', () => {
        clearTimeout(geoTimer);
        const q = geoInput.value.trim();
        if (q.length < 2) { geoResults.style.display = 'none'; return; }
        geoTimer = setTimeout(async () => {
            try {
                const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${state.MK}&language=fr&limit=6`);
                if (!r.ok) return;
                const data = await r.json();
                if (!data.features || !data.features.length) { geoResults.style.display = 'none'; return; }
                geoResults.innerHTML = '';
                data.features.forEach(f => {
                    const item = document.createElement('div');
                    item.style.cssText = 'padding:0.6rem 0.75rem; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.8rem;';
                    const name = f.text || f.place_name || '';
                    item.innerHTML = `<div style="color:white; font-weight:500">${name}</div><div style="color:#8b8d98; font-size:0.7rem;">${f.place_name || ''}</div>`;
                    item.addEventListener('click', async () => {
                        const [lng, lat] = f.center || f.geometry.coordinates;
                        geoResults.style.display = 'none';
                        geoInput.value = name;
                        autoSelectMapSource(lat, lng);
                        resetTerrain();
                        state.TARGET_LAT = lat;
                        state.TARGET_LON = lng;
                        if (state.controls) {
                            state.originTile = lngLatToTile(lng, lat, state.ZOOM);
                            state.controls.target.set(0, 0, 0);
                            state.camera.position.set(0, 8000, 12000);
                            state.controls.update();
                        }
                        await updateVisibleTiles();
                        updateSunPosition(document.getElementById('time-slider').value);
                    });
                    geoResults.appendChild(item);
                });
                geoResults.style.display = 'block';
            } catch (e) { console.warn('Geocoding error:', e); }
        }, 300);
    });
}
