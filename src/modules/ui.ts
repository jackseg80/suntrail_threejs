import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state } from './state';
import { updateSunPosition } from './sun';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain, autoSelectMapSource, deleteTerrainCache, downloadOfflineZone, updateSlopeVisibility, updateHydrologyVisibility, updateStorageUI } from './terrain';
import { lngLatToTile, worldToLngLat, lngLatToWorld } from './geo';
import { showToast, fetchGeocoding } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo } from './performance';
import { runSolarProbe, findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking } from './location';
import { fetchWeather, updateWeatherUIIndicator } from './weather';

let lastClickedCoords = { x: 0, z: 0, alt: 0 };
let hasLastClicked = false;

export function initUI(): void {
    console.log("[UI] Starting Init...");
    const bestPreset = detectBestPreset();
    applyPreset(bestPreset);

    // Diagnostic matériel
    const gpuInfo = getGpuInfo();
    const diagGpu = document.getElementById('diag-gpu');
    if (diagGpu) diagGpu.textContent = `GPU: ${gpuInfo.renderer}`;
    const diagCpu = document.getElementById('diag-cpu');
    if (diagCpu) diagCpu.textContent = `CPU: ${navigator.hardwareConcurrency || '--'} cores`;
    const diagPreset = document.getElementById('diag-preset');
    if (diagPreset) diagPreset.textContent = `PROFIL: ${bestPreset.toUpperCase()}`;
    const techInfo = document.getElementById('tech-info');
    if (techInfo) techInfo.style.display = 'block';

    // --- GESTION RÉSEAU ---
    const offlineIndicator = document.getElementById('offline-indicator');
    const updateNetworkStatus = () => {
        state.IS_OFFLINE = !navigator.onLine;
        if (offlineIndicator) offlineIndicator.style.display = state.IS_OFFLINE ? 'block' : 'none';
    };
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', handleGlobalClick);
    
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.addEventListener('click', handleMapClick);

    setInterval(updateStorageUI, 2000);

    // --- INITIALISATION VALEURS TEMPORELLES (v5.4.8) ---
    const dateInput = document.getElementById('date-input') as HTMLInputElement;
    const timeSlider = document.getElementById('time-slider') as HTMLInputElement;
    if (dateInput) {
        const year = state.simDate.getFullYear();
        const month = String(state.simDate.getMonth() + 1).padStart(2, '0');
        const day = String(state.simDate.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
    }
    if (timeSlider) {
        timeSlider.value = (state.simDate.getHours() * 60 + state.simDate.getMinutes()).toString();
    }

    // Setup Screen
    const setupK1 = document.getElementById('k1') as HTMLInputElement;
    const setupBgo = document.getElementById('bgo');
    const setupScreen = document.getElementById('setup-screen');
    const maptilerKeyInput = document.getElementById('maptiler-key-input') as HTMLInputElement;

    const savedKey = localStorage.getItem('maptiler_key');
    if (savedKey) {
        setupK1.value = savedKey;
        if (maptilerKeyInput) maptilerKeyInput.value = savedKey;
    }

    setupBgo?.addEventListener('click', () => {
        const key = setupK1.value.trim();
        if (key.length < 10) {
            const serr = document.getElementById('serr');
            if (serr) serr.textContent = "Clé MapTiler invalide.";
            return;
        }
        state.MK = key;
        localStorage.setItem('maptiler_key', key);
        if (maptilerKeyInput) maptilerKeyInput.value = key;
        setupScreen!.style.display = 'none';
        startApp();
    });

    // --- RE-WIRING CALQUES (FIX v5.4.7) ---
    const layerBtn = document.getElementById('layer-btn');
    const layerMenu = document.getElementById('layer-menu');
    
    layerBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCurrentlyOpen = layerMenu!.style.display === 'block';
        if (isCurrentlyOpen) {
            layerMenu!.style.display = 'none';
            layerMenu!.classList.remove('open');
        } else {
            layerMenu!.style.display = 'block';
            layerMenu!.classList.add('open');
        }
    });

    // Delegation sur les items
    layerMenu?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const item = target.closest('.layer-item') as HTMLElement;
        if (item) {
            e.stopPropagation();
            const source = item.dataset.source;
            if (source) {
                document.querySelectorAll('.layer-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                state.MAP_SOURCE = source;
                state.hasManualSource = true;
                layerMenu!.style.display = 'none';
                layerMenu!.classList.remove('open');
                refreshTerrain();
            }
        }
    });

    document.getElementById('trails-toggle')?.addEventListener('change', (e) => {
        state.SHOW_TRAILS = (e.target as HTMLInputElement).checked;
        refreshTerrain();
    });

    document.getElementById('slopes-toggle')?.addEventListener('change', (e) => {
        updateSlopeVisibility((e.target as HTMLInputElement).checked);
    });

    // Panneau Réglages
    const settingsToggle = document.getElementById('settings-toggle');
    const panel = document.getElementById('panel');
    const closePanel = document.getElementById('close-panel');
    settingsToggle?.addEventListener('click', (e) => { e.stopPropagation(); panel!.classList.toggle('open'); });
    closePanel?.addEventListener('click', () => panel!.classList.remove('open'));

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => { applyPreset((btn as HTMLElement).dataset.preset as any); });
    });

    // Sliders
    const bindSlider = (id: string, stateKey: string, dispId: string, onChange?: Function) => {
        const slider = document.getElementById(id) as HTMLInputElement;
        const disp = document.getElementById(dispId);
        if (slider) {
            slider.addEventListener('input', () => {
                (state as any)[stateKey] = parseFloat(slider.value);
                if (disp) disp.textContent = slider.value;
            });
            if (onChange) slider.addEventListener('change', () => onChange());
        }
    };

    bindSlider('res-slider', 'RESOLUTION', 'res-disp', refreshTerrain);
    bindSlider('range-slider', 'RANGE', 'range-disp', refreshTerrain);
    bindSlider('exag-slider', 'RELIEF_EXAGGERATION', 'exag-disp', refreshTerrain);
    bindSlider('veg-density-slider', 'VEGETATION_DENSITY', 'veg-density-disp', refreshTerrain);
    bindSlider('weather-density-slider', 'WEATHER_DENSITY', 'weather-density-disp');
    bindSlider('weather-speed-slider', 'WEATHER_SPEED', 'weather-speed-disp');

    document.getElementById('energy-saver-toggle')?.addEventListener('change', (e) => {
        state.ENERGY_SAVER = (e.target as HTMLInputElement).checked;
    });

    document.getElementById('load-speed-select')?.addEventListener('change', (e) => {
        state.LOAD_DELAY_FACTOR = parseFloat((e.target as HTMLSelectElement).value);
    });

    document.getElementById('fog-slider')?.addEventListener('input', (e) => {
        state.FOG_FAR = parseFloat((e.target as HTMLInputElement).value) * 1000;
        if (state.scene?.fog && state.scene.fog instanceof THREE.Fog) state.scene.fog.far = state.FOG_FAR;
    });

    // Toggles 3D
    const bindToggle = (id: string, stateKey: string, onChange?: Function) => {
        const toggle = document.getElementById(id) as HTMLInputElement;
        if (toggle) {
            toggle.addEventListener('change', () => {
                (state as any)[stateKey] = toggle.checked;
                if (onChange) onChange(toggle.checked);
            });
        }
    };

    bindToggle('stats-toggle', 'SHOW_STATS', (val: boolean) => { if (state.stats) state.stats.dom.style.display = val ? 'block' : 'none'; });
    bindToggle('debug-toggle', 'SHOW_DEBUG', (val: boolean) => {
        document.getElementById('zoom-indicator')!.style.display = val ? 'block' : 'none';
        document.getElementById('compass-canvas')!.style.display = val ? 'block' : 'none';
    });
    bindToggle('veg-toggle', 'SHOW_VEGETATION', refreshTerrain);
    bindToggle('buildings-toggle', 'SHOW_BUILDINGS', refreshTerrain);
    bindToggle('hydro-toggle', 'SHOW_HYDROLOGY', (val: boolean) => updateHydrologyVisibility(val));
    bindToggle('poi-toggle', 'SHOW_SIGNPOSTS', refreshTerrain);
    bindToggle('shadow-toggle', 'SHADOWS', (val: boolean) => { if (state.sunLight) state.sunLight.castShadow = val; });

    // GPS
    document.getElementById('gps-btn')?.addEventListener('click', async () => {
        try {
            const pos = await Geolocation.getCurrentPosition();
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const worldPos = lngLatToWorld(lon, lat, state.originTile);
            const alt = getAltitudeAt(worldPos.x, worldPos.z) / state.RELIEF_EXAGGERATION;
            flyTo(worldPos.x, worldPos.z, alt);
            fetchWeather(lat, lon);
        } catch (e) { showToast("Erreur GPS"); }
    });

    document.getElementById('gps-follow-btn')?.addEventListener('click', () => {
        state.isFollowingUser = !state.isFollowingUser;
        document.getElementById('gps-follow-btn')!.classList.toggle('active', state.isFollowingUser);
        if (state.isFollowingUser) startLocationTracking();
    });

    // Temps & Soleil
    if (timeSlider) {
        timeSlider.addEventListener('input', () => {
            const mins = parseInt(timeSlider.value);
            state.simDate.setHours(Math.floor(mins / 60), mins % 60);
            updateSunPosition(mins);
        });
    }

    document.getElementById('date-input')?.addEventListener('change', (e) => {
        const d = new Date((e.target as HTMLInputElement).value);
        if (!isNaN(d.getTime())) {
            state.simDate.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
            const mins = state.simDate.getHours() * 60 + state.simDate.getMinutes();
            updateSunPosition(mins);
        }
    });

    document.getElementById('play-btn')?.addEventListener('click', (e) => {
        state.isSunAnimating = !state.isSunAnimating;
        (e.target as HTMLElement).textContent = state.isSunAnimating ? '⏸' : '▶';
    });

    document.getElementById('speed-select')?.addEventListener('change', (e) => {
        state.animationSpeed = parseFloat((e.target as HTMLSelectElement).value);
    });

    // Analyse Solaire & SOS
    document.getElementById('probe-btn')?.addEventListener('click', () => {
        if (hasLastClicked) {
            runSolarProbe(lastClickedCoords.x, lastClickedCoords.z, lastClickedCoords.alt);
        } else {
            showToast("Cliquez sur le terrain d'abord");
        }
    });

    document.getElementById('sos-btn')?.addEventListener('click', openSOSModal);
    document.getElementById('sos-copy-btn')?.addEventListener('click', () => {
        const txt = document.getElementById('sos-text-container')?.textContent;
        if (txt) { navigator.clipboard.writeText(txt); showToast("🆘 Message copié"); }
    });
    document.getElementById('sos-close-btn')?.addEventListener('click', () => { document.getElementById('sos-modal')!.style.display = 'none'; });

    // Modales & Panels
    document.getElementById('close-weather')?.addEventListener('click', () => { document.getElementById('weather-panel')!.style.display = 'none'; });
    document.getElementById('open-expert-weather')?.addEventListener('click', () => { document.getElementById('expert-weather-panel')!.style.display = 'block'; });
    document.getElementById('close-expert-weather')?.addEventListener('click', () => { document.getElementById('expert-weather-panel')!.style.display = 'none'; });
    document.getElementById('close-probe')?.addEventListener('click', () => { document.getElementById('probe-result')!.style.display = 'none'; });

    // Simulation Météo Manuelle
    document.querySelectorAll('.weather-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.currentWeather = (btn as HTMLElement).dataset.weather as any;
            state.WEATHER_DENSITY = (state.currentWeather === 'clear') ? 0 : 5000;
            updateWeatherUIIndicator();
        });
    });

    // Stockage & GPX
    document.getElementById('clear-cache-btn')?.addEventListener('click', deleteTerrainCache);
    document.getElementById('download-zone-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('download-zone-btn')!;
        btn.setAttribute('disabled', 'true');
        await downloadOfflineZone(state.TARGET_LAT, state.TARGET_LON, (done, total) => {
            const span = btn.querySelector('span');
            if (span) span.textContent = `Chargement ${Math.round(done/total*100)}%`;
        });
        btn.removeAttribute('disabled');
        const span = btn.querySelector('span');
        if (span) span.textContent = `⬇️ Zone Téléchargée`;
    });

    document.getElementById('gpx-btn')?.addEventListener('click', () => { document.getElementById('gpx-upload')?.click(); });
    document.getElementById('gpx-upload')?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => handleGPX(ev.target!.result as string);
            reader.readAsText(file);
        }
    });

    document.getElementById('trail-follow-toggle')?.addEventListener('change', (e) => { state.isFollowingTrail = (e.target as HTMLInputElement).checked; });
    document.getElementById('close-profile')?.addEventListener('click', () => { document.getElementById('elevation-profile')!.style.display = 'none'; });
    document.getElementById('screenshot-btn')?.addEventListener('click', takeScreenshot);

    document.getElementById('api-key-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = maptilerKeyInput.value.trim();
        if (key.length > 10) {
            state.MK = key;
            localStorage.setItem('maptiler_key', key);
            showToast("Clé API mise à jour");
            refreshTerrain();
        }
    });

    initGeocoding();
}

function handleGlobalClick(e: MouseEvent) {
    const layerMenu = document.getElementById('layer-menu');
    const layerBtn = document.getElementById('layer-btn');
    const target = e.target as HTMLElement;

    if (layerMenu?.classList.contains('open') && !layerMenu.contains(target) && target !== layerBtn && !layerBtn?.contains(target)) {
        layerMenu.classList.remove('open');
        layerMenu.style.display = 'none';
    }
    
    if (target.id === 'weather-clickable' || target.closest('#weather-clickable')) {
        const wp = document.getElementById('weather-panel');
        if (wp) wp.style.display = wp.style.display === 'none' ? 'block' : 'none';
    }
}

function handleMapClick(e: MouseEvent) {
    if (!state.renderer || !state.camera || !state.scene) return;
    const panel = document.getElementById('panel');
    if (panel?.classList.contains('open')) panel.classList.remove('open');

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 35 };
    raycaster.setFromCamera(mouse, state.camera);

    const intersects = raycaster.intersectObjects(state.scene.children, true);
    const spriteHit = intersects.find(hit => hit.object.type === 'Sprite');
    
    if (spriteHit) {
        const poiData = spriteHit.object.userData;
        if (poiData && poiData.name) {
            const cp = document.getElementById('coords-panel')!;
            cp.style.display = 'block';
            document.getElementById('click-latlon')!.innerHTML = `<span style="color:var(--gold)">📍 ${poiData.name}</span>`;
            document.getElementById('click-alt')!.textContent = `Signalétique`;
            lastClickedCoords = { 
                x: spriteHit.object.position.x + (spriteHit.object.parent?.position.x || 0), 
                z: spriteHit.object.position.z + (spriteHit.object.parent?.position.z || 0), 
                alt: getAltitudeAt(spriteHit.object.position.x, spriteHit.object.position.z) 
            };
            hasLastClicked = true;
            return;
        }
    }

    const hitPoint = findTerrainIntersection(raycaster.ray);
    if (hitPoint && state.originTile) {
        const gps = worldToLngLat(hitPoint.x, hitPoint.z, state.originTile);
        const rawAlt = getAltitudeAt(hitPoint.x, hitPoint.z);
        const realAlt = rawAlt / state.RELIEF_EXAGGERATION;
        const cp = document.getElementById('coords-panel')!;
        cp.style.display = 'block';
        document.getElementById('click-latlon')!.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
        document.getElementById('click-alt')!.textContent = `${Math.round(realAlt)} m`;
        lastClickedCoords = { x: hitPoint.x, z: hitPoint.z, alt: rawAlt };
        hasLastClicked = true;
    } else {
        const cp = document.getElementById('coords-panel'); 
        if (cp) cp.style.display = 'none';
    }
}

function startApp() {
    initScene();
    loadTerrain();
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    document.getElementById('layer-btn')!.style.display = 'flex';
    document.getElementById('settings-toggle')!.style.display = 'flex';
    document.getElementById('gps-btn')!.style.display = 'flex';
    document.getElementById('gps-follow-btn')!.style.display = 'flex';
    document.getElementById('screenshot-btn')!.style.display = 'flex';
    document.getElementById('bottom-bar')!.style.display = 'block';
    document.getElementById('top-search-container')!.style.display = 'block';
}

function onWindowResize() {
    if (!state.camera || !state.renderer) return;
    state.camera.aspect = window.innerWidth / window.innerHeight;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(window.innerWidth, window.innerHeight);
}

function initGeocoding() {
    const geoInput = document.getElementById('geo-input') as HTMLInputElement;
    const geoResults = document.getElementById('geo-results');
    if (!geoInput || !geoResults) return;

    let timer: any;
    const handleResultClick = (lat: number, lon: number, isPeak: boolean, peakName: string = '', peakEle: number = 0) => {
        geoResults.style.display = 'none';
        geoInput.value = '';
        if (isPeak) {
            state.TARGET_LAT = lat; state.TARGET_LON = lon;
            autoSelectMapSource(lat, lon);
            state.ZOOM = 14; state.originTile = lngLatToTile(lon, lat, 14);
            if (state.controls && state.camera) { state.controls.target.set(0, 0, 0); state.camera.position.set(0, 15000, 20000); state.controls.update(); }
            refreshTerrain();
            setTimeout(() => { 
                const wp = lngLatToWorld(lon, lat, state.originTile);
                flyTo(wp.x, wp.z, peakEle); 
            }, 100);
            const cp = document.getElementById('coords-panel')!; cp.style.display = 'block';
            document.getElementById('click-latlon')!.textContent = `🏔️ ${peakName}`;
            document.getElementById('click-alt')!.textContent = `${Math.round(peakEle)} m`;
            const wp = lngLatToWorld(lon, lat, state.originTile);
            lastClickedCoords = { x: wp.x, z: wp.z, alt: peakEle * state.RELIEF_EXAGGERATION };
            hasLastClicked = true;
        } else {
            state.TARGET_LAT = lat; state.TARGET_LON = lon;
            autoSelectMapSource(lat, lon);
            state.ZOOM = 13; state.originTile = lngLatToTile(lon, lat, 13);
            if (state.controls && state.camera) { state.controls.target.set(0, 0, 0); state.camera.position.set(0, 35000, 40000); state.controls.update(); }
            refreshTerrain(); 
        }
        fetchWeather(lat, lon);
    };

    geoInput.addEventListener('input', () => {
        if (timer) clearTimeout(timer);
        const q = geoInput.value.trim().toLowerCase();
        if (q.length < 2) { geoResults.style.display = 'none'; return; }
        
        const localMatches = state.localPeaks.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
        let html = localMatches.map(p => `<div class="geo-item peak-item" data-lat="${p.lat}" data-lon="${p.lon}" data-name="${p.name}" data-ele="${p.ele}" style="padding:12px; cursor:pointer; color:var(--gold); border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;"><span>🏔️ ${p.name}</span><span style="color:var(--t2); font-size:11px;">${Math.round(p.ele)}m</span></div>`).join('');
        
        if (html) { geoResults.innerHTML = html; geoResults.style.display = 'block'; attachListeners(); }
        
        timer = setTimeout(async () => {
            const data = await fetchGeocoding({ query: q });
            if (!data) return;

            let resultsHtml = '';
            // --- GESTION FORMATS HYBRIDES MapTiler / OSM ---
            if (Array.isArray(data)) {
                // Format Nominatim (OSM)
                resultsHtml = data.map((f: any) => {
                    const lat = parseFloat(f.lat);
                    const lon = parseFloat(f.lon);
                    return `<div class="geo-item remote-item" data-lat="${lat}" data-lon="${lon}" style="padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05);">📍 ${f.display_name}</div>`;
                }).join('');
            } else if (data.features) {
                // Format MapTiler
                resultsHtml = data.features.map((f: any) => {
                    const lon = f.geometry.coordinates[0];
                    const lat = f.geometry.coordinates[1];
                    return `<div class="geo-item remote-item" data-lat="${lat}" data-lon="${lon}" style="padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05);">📍 ${f.place_name_fr || f.place_name}</div>`;
                }).join('');
            }

            if (resultsHtml || html) {
                geoResults.innerHTML = html + resultsHtml;
                geoResults.style.display = 'block';
                attachListeners();
            }
        }, 400);
    });

    function attachListeners() {
        geoResults?.querySelectorAll('.geo-item').forEach(item => {
            (item as HTMLElement).onclick = (e) => {
                e.stopPropagation();
                const lat = parseFloat((item as HTMLElement).dataset.lat!);
                const lon = parseFloat((item as HTMLElement).dataset.lon!);
                if (isNaN(lat) || isNaN(lon)) return;
                const isPeak = item.classList.contains('peak-item');
                const name = (item as HTMLElement).dataset.name || (item as HTMLElement).textContent || '';
                const ele = parseFloat((item as HTMLElement).dataset.ele!) || 0;
                handleResultClick(lat, lon, isPeak, name, ele);
            };
        });
    }
}

async function handleGPX(xml: string) {
    const gpx = new gpxParser(); gpx.parse(xml);
    if (!gpx.tracks?.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    state.TARGET_LAT = startPt.lat; state.TARGET_LON = startPt.lon;
    state.ZOOM = 13; state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
    updateGPXMesh(); updateElevationProfile(); await updateVisibleTiles();
    document.getElementById('trail-controls')!.style.display = 'block';
}

async function openSOSModal() {
    const modal = document.getElementById('sos-modal')!;
    const textContainer = document.getElementById('sos-text-container')!;
    modal.style.display = 'block';
    textContainer.textContent = "⌛ Localisation en cours...";
    let lat: number, lon: number, alt: number;
    if (state.userLocation) { lat = state.userLocation.lat; lon = state.userLocation.lon; alt = state.userLocation.alt; }
    else { const gps = worldToLngLat(state.controls?.target.x || 0, state.controls?.target.z || 0, state.originTile); lat = gps.lat; lon = gps.lon; alt = getAltitudeAt(state.controls?.target.x || 0, state.controls?.target.z || 0) / state.RELIEF_EXAGGERATION; }
    let bat = "??"; try { const battery = await (navigator as any).getBattery(); bat = Math.round(battery.level * 100).toString(); } catch(e) {}
    const now = new Date(); const time = `${now.getHours()}h${now.getMinutes().toString().padStart(2, '0')}`;
    textContainer.textContent = `🆘 SOS SUNTRAIL: ${lat.toFixed(5)},${lon.toFixed(5)} | ALT:${Math.round(alt)}m | BAT:${bat}% | ${time}`;
}

function takeScreenshot() {
    if (!state.renderer) return;
    state.renderer.render(state.scene!, state.camera!);
    const data = state.renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `suntrail-${Date.now()}.png`; link.href = data; link.click();
}

function refreshTerrain() { resetTerrain(); updateVisibleTiles(); }
