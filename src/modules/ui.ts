import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene } from './scene';
import { updateVisibleTiles, activeTiles, lngLatToTile, worldToLngLat, resetTerrain, updateGPXMesh } from './terrain';
import { isPositionInSwitzerland } from './utils';
import { applyPreset, detectBestPreset } from './performance';

export function initUI(): void {
    // --- DÉTECTION PERFORMANCE (v3.6) ---
    const bestPreset = detectBestPreset();
    applyPreset(bestPreset);

    let s1 = '';
    try { s1 = localStorage.getItem('maptiler_key_3d') || ''; } catch (e) {}
    
    const k1 = document.getElementById('k1') as HTMLInputElement;
    if (s1 && k1) k1.value = s1;
    
    const bgo = document.getElementById('bgo');
    if (bgo) bgo.addEventListener('click', go);
    
    if (k1) k1.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') go(); });
    
    // --- GESTION DU PANNEAU RÉGLAGES ---
    const panel = document.getElementById('panel');
    const settingsToggle = document.getElementById('settings-toggle');
    const closePanel = document.getElementById('close-panel');

    if (settingsToggle && panel) settingsToggle.addEventListener('click', () => panel.classList.add('open'));
    if (closePanel && panel) closePanel.addEventListener('click', () => panel.classList.remove('open'));

    // --- PRESETS PERFORMANCE (v3.6) ---
    const presetButtons = document.querySelectorAll('.preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.getAttribute('data-preset') as any;
            applyPreset(preset);
            refreshTerrain();
        });
    });

    // --- SÉLECTEUR DE CALQUES (VIGNETTES) ---
    const layerBtn = document.getElementById('layer-btn');
    const layerMenu = document.getElementById('layer-menu');
    const layerItems = document.querySelectorAll('.layer-item');

    if (layerBtn && layerMenu) {
        layerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            layerMenu.style.display = layerMenu.style.display === 'block' ? 'none' : 'block';
        });

        window.addEventListener('click', () => layerMenu.style.display = 'none');
        layerMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    layerItems.forEach(item => {
        item.addEventListener('click', async () => {
            layerItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            state.MAP_SOURCE = (item as HTMLElement).dataset.source || 'swisstopo';
            state.hasManualSource = true;
            if (layerMenu) layerMenu.style.display = 'none';
            await refreshTerrain();
        });
    });

    // --- GESTION DU GPS ---
    const gpsBtn = document.getElementById('gps-btn');
    if (gpsBtn) {
        gpsBtn.addEventListener('click', async () => {
            try {
                const permissions = await Geolocation.checkPermissions();
                if (permissions.location !== 'granted') {
                    const req = await Geolocation.requestPermissions();
                    if (req.location !== 'granted') {
                        console.warn("Permission GPS refusée.");
                        return;
                    }
                }

                gpsBtn.classList.add('active');
                const pos = await Geolocation.getCurrentPosition({
                    enableHighAccuracy: true,
                    timeout: 10000
                });

                const { latitude, longitude } = pos.coords;
                autoSelectMapSource(latitude, longitude);
                resetTerrain();
                state.TARGET_LAT = latitude;
                state.TARGET_LON = longitude;
                if (state.controls && state.camera) {
                    state.originTile = lngLatToTile(longitude, latitude, state.ZOOM);
                    state.controls.target.set(0, 0, 0);
                    state.camera.position.set(0, 5000, 8000);
                    state.controls.update();
                }
                await updateVisibleTiles();
                gpsBtn.classList.remove('active');
            } catch (err) {
                console.warn("GPS Error:", err);
                gpsBtn.classList.remove('active');
            }
        });
    }

    // --- GPX ---
    const gpxBtn = document.getElementById('gpx-btn');
    const gpxUpload = document.getElementById('gpx-upload') as HTMLInputElement;
    const trailFollowToggle = document.getElementById('trail-follow-toggle') as HTMLInputElement;

    if (gpxBtn && gpxUpload) {
        gpxBtn.addEventListener('click', () => gpxUpload.click());
        gpxUpload.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            const file = target.files ? target.files[0] : null;
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event: ProgressEvent<FileReader>) => {
                if (event.target && typeof event.target.result === 'string') {
                    handleGPX(event.target.result);
                }
            };
            reader.readAsText(file);
        });
    }

    if (trailFollowToggle) {
        trailFollowToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.isFollowingTrail = target.checked;
            if (state.isFollowingTrail && state.gpxPoints.length > 0) {
                state.trailProgress = 0;
                if (state.controls) state.controls.enabled = false;
            } else {
                if (state.controls) state.controls.enabled = true;
            }
        });
    }

    // --- TEMPS ---
    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    const dateInput = document.getElementById('date-input') as HTMLInputElement;

    if (dateInput) {
        dateInput.valueAsDate = state.simDate;
        dateInput.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.simDate = new Date(target.value);
            if (timeSlider) updateSunPosition(parseInt(timeSlider.value));
        });
    }

    if (timeSlider) {
        timeSlider.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            updateSunPosition(parseInt(target.value));
        });
    }

    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            state.isAnimating = !state.isAnimating;
            playBtn.textContent = state.isAnimating ? "⏸" : "▶";
        });
    }

    const speedSelect = document.getElementById('speed-select') as HTMLSelectElement;
    if (speedSelect) {
        speedSelect.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLSelectElement;
            state.animationSpeed = parseFloat(target.value);
        });
    }

    // --- CLIC SUR CARTE (COORDONNÉES) ---
    window.addEventListener('click', (e: MouseEvent) => {
        if (!state.renderer || !state.camera || !state.scene) return;
        const target = e.target as HTMLElement;
        if (target.tagName !== 'CANVAS') return;
        
        const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, state.camera);
        
        const meshes: THREE.Mesh[] = [];
        const meshToTile = new Map<number, any>();
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
                if (ctx) {
                    ctx.drawImage(tile.elevationTex.image, 0, 0);
                    const uv = hit.uv; 
                    if (uv) {
                        const px = Math.floor(uv.x * 255);
                        const py = Math.floor((1.0 - uv.y) * 255);
                        const data = ctx.getImageData(px, py, 1, 1).data;
                        realAlt = -10000 + ((data[0] * 65536 + data[1] * 256 + data[2]) * 0.1);
                    }
                }
            }

            const coordsPanel = document.getElementById('coords-panel');
            const clickLatLon = document.getElementById('click-latlon');
            const clickAlt = document.getElementById('click-alt');

            if (coordsPanel) coordsPanel.style.display = 'block';
            if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            if (clickAlt) clickAlt.textContent = `${Math.round(realAlt)} m`;
        } else {
            const coordsPanel = document.getElementById('coords-panel');
            if (coordsPanel) coordsPanel.style.display = 'none';
        }
    });

    // --- RÉGLAGES TECHNIQUES ---
    const resSlider = document.getElementById('res-slider') as HTMLInputElement;
    if (resSlider) {
        resSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.RESOLUTION = parseInt(target.value);
            const resDisp = document.getElementById('res-disp');
            if (resDisp) resDisp.textContent = state.RESOLUTION.toString();
            await refreshTerrain();
        });
    }

    const rangeSlider = document.getElementById('range-slider') as HTMLInputElement;
    if (rangeSlider) {
        rangeSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.RANGE = parseInt(target.value);
            const rangeDisp = document.getElementById('range-disp');
            if (rangeDisp) rangeDisp.textContent = state.RANGE.toString();
            await refreshTerrain();
        });
    }

    const exagSlider = document.getElementById('exag-slider') as HTMLInputElement;
    if (exagSlider) {
        exagSlider.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            // Note: Exaggeration is not part of performance presets, so we don't trigger 'custom'
            state.RELIEF_EXAGGERATION = parseFloat(target.value);
            const exagDisp = document.getElementById('exag-disp');
            if (exagDisp) exagDisp.textContent = state.RELIEF_EXAGGERATION.toFixed(1);
            await updateVisibleTiles();
        });
    }

    const fogSlider = document.getElementById('fog-slider') as HTMLInputElement;
    if (fogSlider) {
        fogSlider.addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.FOG_DENSITY = parseFloat(target.value) / 1000000;
            if (state.scene && state.scene.fog && 'density' in state.scene.fog) {
                (state.scene.fog as THREE.FogExp2).density = state.FOG_DENSITY;
            }
        });
    }

    const shadowToggle = document.getElementById('shadow-toggle') as HTMLInputElement;
    if (shadowToggle) {
        shadowToggle.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            applyPreset('custom');
            state.SHADOWS = target.checked;
            if (state.sunLight) state.sunLight.castShadow = state.SHADOWS;
        });
    }

    const trailsToggle = document.getElementById('trails-toggle') as HTMLInputElement;
    if (trailsToggle) {
        trailsToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_TRAILS = target.checked;
            await refreshTerrain();
        });
    }

    const slopesToggle = document.getElementById('slopes-toggle') as HTMLInputElement;
    if (slopesToggle) {
        slopesToggle.addEventListener('change', async (e: Event) => {
            const target = e.target as HTMLInputElement;
            state.SHOW_SLOPES = target.checked;
            await refreshTerrain();
        });
    }

    initGeocoding();
}

let lastSourceCheck = 0;
export function autoSelectMapSource(lat: number, lon: number): void {
    if (state.hasManualSource) return;
    
    // On ne vérifie que toutes les 2 secondes pour éviter la charge CPU
    const now = Date.now();
    if (now - lastSourceCheck < 2000) return;
    lastSourceCheck = now;

    const isSwiss = isPositionInSwitzerland(lat, lon);
    const newSource = isSwiss ? 'swisstopo' : 'opentopomap';
    
    if (state.MAP_SOURCE !== newSource) {
        state.MAP_SOURCE = newSource;
        const items = document.querySelectorAll('.layer-item');
        items.forEach(i => {
            i.classList.remove('active');
            if ((i as HTMLElement).dataset.source === newSource) i.classList.add('active');
        });
        
        // IMPORTANT: On ne fait plus un resetTerrain() brutal ici.
        // On laisse updateVisibleTiles gérer le remplacement progressif.
        updateVisibleTiles();
    }
}

async function refreshTerrain(): Promise<void> {
    resetTerrain();
    if (state.rawGpxData) updateGPXMesh(); 
    await updateVisibleTiles();
}

async function handleGPX(xml: string): Promise<void> {
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
    
    const trailControls = document.getElementById('trail-controls');
    const gpxDist = document.getElementById('gpx-dist');
    const gpxElev = document.getElementById('gpx-elev');

    if (trailControls) trailControls.style.display = 'block';
    if (gpxDist) gpxDist.textContent = `${(gpx.tracks[0].distance.total / 1000).toFixed(1)} km`;
    if (gpxElev) gpxElev.textContent = `+${Math.round(gpx.tracks[0].elevation.pos)}m / -${Math.round(gpx.tracks[0].elevation.neg)}m`;
    
    if (state.controls && state.camera && state.gpxPoints.length > 0) {
        state.controls.target.set(state.gpxPoints[0].x, state.gpxPoints[0].y, state.gpxPoints[0].z);
        state.camera.position.set(state.gpxPoints[0].x, state.gpxPoints[0].y + 2000, state.gpxPoints[0].z + 4000);
        state.controls.update();
    }
    await updateVisibleTiles();
}

function go(): void {
    const k1 = document.getElementById('k1') as HTMLInputElement;
    state.MK = k1 ? k1.value.trim() : '';
    if (!state.MK || state.MK.length < 5) {
        const serr = document.getElementById('serr');
        if (serr) serr.textContent = 'Clé MapTiler invalide.';
        return;
    }
    localStorage.setItem('maptiler_key_3d', state.MK);
    
    const setupScreen = document.getElementById('setup-screen');
    const topSearch = document.getElementById('top-search-container');
    const layerBtn = document.getElementById('layer-btn');
    const settingsToggle = document.getElementById('settings-toggle');
    const gpsBtn = document.getElementById('gps-btn');
    const bottomBar = document.getElementById('bottom-bar');

    if (setupScreen) setupScreen.style.display = 'none';
    if (topSearch) topSearch.style.display = 'block';
    if (layerBtn) layerBtn.style.display = 'flex';
    if (settingsToggle) settingsToggle.style.display = 'flex';
    if (gpsBtn) gpsBtn.style.display = 'flex';
    if (bottomBar) bottomBar.style.display = 'flex';
    
    autoSelectMapSource(state.TARGET_LAT, state.TARGET_LON);
    initScene();
}

function initGeocoding(): void {
    const geoInput = document.getElementById('geo-input') as HTMLInputElement;
    const geoResults = document.getElementById('geo-results');
    let geoTimer: ReturnType<typeof setTimeout> | null = null;

    if (geoInput && geoResults) {
        geoInput.addEventListener('input', () => {
            if (geoTimer) clearTimeout(geoTimer);
            const q = geoInput.value.trim();
            if (q.length < 2) { geoResults.style.display = 'none'; return; }
            geoTimer = setTimeout(async () => {
                try {
                    const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json?key=${state.MK}&language=fr&limit=6`);
                    const data = await r.json();
                    if (!data.features || !data.features.length) { geoResults.style.display = 'none'; return; }
                    geoResults.innerHTML = '';
                    data.features.forEach((f: any) => {
                        const item = document.createElement('div');
                        item.style.cssText = 'padding:15px; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05);';
                        const name = f.text || f.place_name || '';
                        item.innerHTML = `<div style="color:white; font-weight:500">${name}</div><div style="color:var(--t2); font-size:12px;">${f.place_name || ''}</div>`;
                        item.addEventListener('click', async () => {
                            const [lng, lat] = f.center || f.geometry.coordinates;
                            geoResults.style.display = 'none';
                            geoInput.value = name;
                            autoSelectMapSource(lat, lng);
                            resetTerrain();
                            state.TARGET_LAT = lat;
                            state.TARGET_LON = lng;
                            if (state.controls && state.camera) {
                                state.originTile = lngLatToTile(lng, lat, state.ZOOM);
                                state.controls.target.set(0, 0, 0);
                                state.camera.position.set(0, 5000, 8000);
                                state.controls.update();
                            }
                            await updateVisibleTiles();
                            const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
                            if (timeSlider) updateSunPosition(parseInt(timeSlider.value));
                        });
                        geoResults.appendChild(item);
                    });
                    geoResults.style.display = 'block';
                } catch (e) { console.warn('Geocoding error:', e); }
            }, 300);
        });
    }
}
