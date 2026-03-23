import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { Geolocation } from '@capacitor/geolocation';
import { state, loadSettings } from './state';
import { updateSunPosition } from './sun';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain, autoSelectMapSource } from './terrain';
import { updateStorageUI } from './tileLoader';
import { lngLatToTile, worldToLngLat, lngLatToWorld } from './geo';
import { showToast, fetchGeocoding } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { runSolarProbe, findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking, stopLocationTracking } from './location';
import { fetchWeather, updateWeatherUIIndicator } from './weather';

import { SettingsSheet } from './ui/components/SettingsSheet';

let lastClickedCoords = { x: 0, z: 0, alt: 0 };
let hasLastClicked = false;

export function initUI(): void {
    console.log("[UI] Starting Init...");
    
    const savedSettings = loadSettings();
    if (savedSettings) {
        state.hasManualSource = true;
        if (savedSettings.PERFORMANCE_PRESET === 'custom') {
            applyCustomSettings(savedSettings);
        } else {
            applyPreset(savedSettings.PERFORMANCE_PRESET);
        }
    } else {
        const bestPreset = detectBestPreset();
        applyPreset(bestPreset);
    }

    // Diagnostic matériel
    const gpuInfo = getGpuInfo();
    const diagGpu = document.getElementById('diag-gpu');
    if (diagGpu) diagGpu.textContent = `GPU: ${gpuInfo.renderer}`;
    const diagCpu = document.getElementById('diag-cpu');
    if (diagCpu) diagCpu.textContent = `CPU: ${navigator.hardwareConcurrency || '--'} cores`;
    const diagPreset = document.getElementById('diag-preset');
    if (diagPreset) diagPreset.textContent = `PROFIL: ${state.PERFORMANCE_PRESET.toUpperCase()}`;
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
    const settingsSheet = new SettingsSheet();
    settingsSheet.hydrate();

    const settingsToggle = document.getElementById('settings-toggle');
    settingsToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsSheet.toggle();
    });

    window.addEventListener('gpx-uploaded', (e: any) => {
        handleGPX(e.detail);
    });

    // GPS
    document.getElementById('gps-btn')?.addEventListener('click', async () => {
        try {
            const pos = await Geolocation.getCurrentPosition();
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            
            // --- CORRECTION POSITIONNEMENT GPS (v5.7.3) ---
            // 1. On met à jour les coordonnées cibles globales
            state.TARGET_LAT = lat;
            state.TARGET_LON = lon;
            
            // 2. On réinitialise l'origine du monde 3D sur cette nouvelle position 
            // pour éviter les erreurs de flottants et les décalages de perspective.
            state.originTile = lngLatToTile(lon, lat, state.ZOOM);
            
            // 3. On force le rechargement du terrain sur la nouvelle zone
            refreshTerrain();
            
            // 4. On vole vers la position (maintenant centrée sur 0,0 en coordonnées monde car on a shift l'origine)
            const worldPos = lngLatToWorld(lon, lat, state.originTile);
            const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
            
            flyTo(worldPos.x, worldPos.z, altWorld);
            fetchWeather(lat, lon);
            
            showToast("📍 Position synchronisée");
        } catch (e) { showToast("Erreur GPS"); }
    });

    document.getElementById('close-coords')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const cp = document.getElementById('coords-panel');
        if (cp) cp.style.display = 'none';
        hasLastClicked = false;
    });

    document.getElementById('gps-follow-btn')?.addEventListener('click', async () => {
        state.isFollowingUser = !state.isFollowingUser;
        const btn = document.getElementById('gps-follow-btn')!;
        btn.classList.toggle('active', state.isFollowingUser);
        
        if (state.isFollowingUser) {
            showToast("Suivi activé");
            await startLocationTracking();
            // --- CENTRAGE IMMÉDIAT (Feedback Swisstopo) ---
            if (state.userLocation) {
                const wp = lngLatToWorld(state.userLocation.lon, state.userLocation.lat, state.originTile);
                const groundH = getAltitudeAt(wp.x, wp.z);
                flyTo(wp.x, wp.z, (groundH / state.RELIEF_EXAGGERATION) + 500); 
            }
        } else {
            showToast("Suivi désactivé");
            stopLocationTracking();
        }
    });

    // --- ENREGISTREMENT TRACÉ (v5.7) ---
    document.getElementById('rec-btn')?.addEventListener('click', async () => {
        state.isRecording = !state.isRecording;
        const btn = document.getElementById('rec-btn')!;
        btn.classList.toggle('active', state.isRecording);
        
        if (state.isRecording) {
            showToast("🔴 Enregistrement démarré");
            if (!state.isFollowingUser) {
                // On force le tracking GPS si pas déjà actif
                await startLocationTracking();
            }
            // Point de départ
            if (state.userLocation) {
                state.recordedPoints = [{
                    ...state.userLocation,
                    timestamp: Date.now()
                }];
            } else {
                state.recordedPoints = [];
            }
        } else {
            showToast("⏹️ Enregistrement stoppé");
        }
    });

    document.getElementById('export-gpx-btn')?.addEventListener('click', () => {
        if (state.recordedPoints.length < 2) {
            showToast("Tracé trop court pour export");
            return;
        }
        exportRecordedGPX();
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

    document.getElementById('close-profile')?.addEventListener('click', () => { document.getElementById('elevation-profile')!.style.display = 'none'; });
    document.getElementById('screenshot-btn')?.addEventListener('click', takeScreenshot);

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
    document.getElementById('rec-btn')!.style.display = 'flex';
    document.getElementById('export-gpx-btn')!.style.display = 'flex';
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

function exportRecordedGPX() {
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SunTrail 3D" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>SunTrail Recorded Track - ${new Date().toLocaleDateString()}</name>
    <trkseg>`;

    state.recordedPoints.forEach(p => {
        gpx += `
      <trkpt lat="${p.lat}" lon="${p.lon}">
        <ele>${p.alt.toFixed(1)}</ele>
        <time>${new Date(p.timestamp).toISOString()}</time>
      </trkpt>`;
    });

    gpx += `
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `suntrail-track-${Date.now()}.gpx`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("GPX téléchargé");
}

function createGeoItem(lat: number, lon: number, label: string, isPeak = false, name = '', ele = 0): HTMLElement {
    const div = document.createElement('div');
    div.className = `geo-item ${isPeak ? 'peak-item' : 'remote-item'}`;
    div.style.cssText = 'padding:12px; cursor:pointer; color:white; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;';
    div.dataset.lat = lat.toString();
    div.dataset.lon = lon.toString();
    if (isPeak) { 
        div.dataset.name = name; 
        div.dataset.ele = ele.toString();
        div.style.color = 'var(--gold)';
    }
    
    const leftSide = document.createElement('div');
    const icon = document.createElement('span');
    icon.textContent = isPeak ? '🏔️ ' : '📍 ';
    leftSide.appendChild(icon);
    
    const text = document.createElement('span');
    text.textContent = label;
    leftSide.appendChild(text);
    div.appendChild(leftSide);
    
    if (isPeak) {
        const altSpan = document.createElement('span');
        altSpan.style.cssText = 'color:var(--t2); font-size:11px;';
        altSpan.textContent = `${Math.round(ele)}m`;
        div.appendChild(altSpan);
    }
    return div;
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
                // Utilisation de l'altitude exagérée pour la cible world
                flyTo(wp.x, wp.z, peakEle * state.RELIEF_EXAGGERATION); 
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
        
        if (q.length < 2) { 
            geoResults.style.display = 'none'; 
            geoResults.innerHTML = '';
            return; 
        }
        
        // 1. AFFICHER LES PICS LOCAUX IMMÉDIATEMENT (v5.5.15)
        geoResults.innerHTML = '';
        const localMatches = state.localPeaks.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
        if (localMatches.length > 0) {
            localMatches.forEach(p => {
                geoResults.appendChild(createGeoItem(p.lat, p.lon, p.name, true, p.name, p.ele));
            });
            geoResults.style.display = 'block';
            attachListeners();
        }

        // 2. RECHERCHE DISTANTE (MAPTILER / OSM)
        timer = setTimeout(async () => {
            try {
                const data = await fetchGeocoding({ query: q });
                if (!data) return;

                // On ne vide pas, on ajoute à la suite des pics locaux
                if (Array.isArray(data)) {
                    data.forEach((f: any) => {
                        geoResults.appendChild(createGeoItem(parseFloat(f.lat), parseFloat(f.lon), f.display_name));
                    });
                } else if (data.features) {
                    data.features.forEach((f: any) => {
                        const lon = f.geometry.coordinates[0];
                        const lat = f.geometry.coordinates[1];
                        const label = f.place_name_fr || f.place_name || 'Lieu inconnu';
                        geoResults.appendChild(createGeoItem(lat, lon, label));
                    });
                }

                if (geoResults.children.length > 0) {
                    geoResults.style.display = 'block';
                    attachListeners();
                }
            } catch (e) { console.warn("Geocoding error:", e); }
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
                const name = (item as HTMLElement).dataset.name || (item as HTMLElement).querySelector('span:nth-child(2)')?.textContent || '';
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
