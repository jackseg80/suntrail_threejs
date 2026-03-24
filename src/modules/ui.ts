import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { state, loadSettings } from './state';
import { updateSunPosition } from './sun';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain } from './terrain';
import { updateStorageUI } from './tileLoader';
import { lngLatToTile, lngLatToWorld } from './geo';
import { showToast } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking, stopLocationTracking } from './location';
import { fetchWeather } from './weather';

import { NavigationBar } from './ui/components/NavigationBar';
import { TopStatusBar } from './ui/components/TopStatusBar';
import { SettingsSheet } from './ui/components/SettingsSheet';
import { SearchSheet } from './ui/components/SearchSheet';
import { WeatherSheet, SolarProbeSheet, SOSSheet } from './ui/components/ExpertSheets';
import { TrackSheet } from './ui/components/TrackSheet';
import { initAutoHide } from './ui/autoHide';
import { initMobileUI } from './ui/mobile';

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
    const updateNetworkStatus = () => {
        state.IS_OFFLINE = !navigator.onLine;
    };
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    window.addEventListener('resize', onWindowResize);
    document.addEventListener('click', handleGlobalClick);
    
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.addEventListener('click', handleMapClick);

    setInterval(updateStorageUI, 2000);

    // --- INITIALISATION VALEURS TEMPORELLES ---
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

    // --- INITIALISATION COMPOSANTS ---
    const navBar = new NavigationBar();
    navBar.hydrate();

    const topStatusBar = new TopStatusBar();
    topStatusBar.hydrate();

    const settingsSheet = new SettingsSheet();
    settingsSheet.hydrate();

    const searchSheet = new SearchSheet();
    searchSheet.hydrate();

    const trackSheet = new TrackSheet();
    trackSheet.hydrate();

    const weatherSheet = new WeatherSheet();
    weatherSheet.hydrate();

    const solarProbeSheet = new SolarProbeSheet();
    solarProbeSheet.hydrate();

    const sosSheet = new SOSSheet();
    sosSheet.hydrate();

    initAutoHide();
    initMobileUI();

    const settingsToggle = document.getElementById('settings-toggle');
    settingsToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsSheet.toggle();
    });

    window.addEventListener('gpx-uploaded', (e: any) => {
        handleGPX(e.detail);
    });

    window.addEventListener('export-recorded-gpx', () => {
        exportRecordedGPX();
    });

    // GPS
    document.getElementById('gps-btn')?.addEventListener('click', async () => {
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });
            
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            state.TARGET_LAT = lat;
            state.TARGET_LON = lon;
            state.originTile = lngLatToTile(lon, lat, state.ZOOM);
            
            refreshTerrain();
            
            const worldPos = lngLatToWorld(lon, lat, state.originTile);
            const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
            
            flyTo(worldPos.x, worldPos.z, altWorld);
            fetchWeather(lat, lon);
            
            showToast("📍 Position synchronisée");
        } catch (e) { 
            showToast("Erreur GPS"); 
            console.error("Geolocation error:", e);
        }
    });

    document.getElementById('gps-follow-btn')?.addEventListener('click', async () => {
        state.isFollowingUser = !state.isFollowingUser;
        const btn = document.getElementById('gps-follow-btn')!;
        btn.classList.toggle('active', state.isFollowingUser);
        
        if (state.isFollowingUser) {
            showToast("Suivi activé");
            await startLocationTracking();
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

    document.getElementById('screenshot-btn')?.addEventListener('click', takeScreenshot);
}

function handleGlobalClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.id === 'weather-clickable' || target.closest('#weather-clickable')) {
        const wp = document.getElementById('weather-panel');
        if (wp) wp.style.display = wp.style.display === 'none' ? 'block' : 'none';
    }
}

function handleMapClick(e: MouseEvent) {
    if (!state.renderer || !state.camera || !state.scene) return;

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 35 };
    raycaster.setFromCamera(mouse, state.camera);

    const intersects = raycaster.intersectObjects(state.scene.children, true);
    const spriteHit = intersects.find(hit => hit.object.type === 'Sprite');
    
    if (spriteHit) {
        const poiData = spriteHit.object.userData;
        if (poiData && poiData.name) {
            state.hasLastClicked = true;
            state.lastClickedCoords = { 
                x: spriteHit.object.position.x + (spriteHit.object.parent?.position.x || 0), 
                z: spriteHit.object.position.z + (spriteHit.object.parent?.position.z || 0), 
                alt: getAltitudeAt(spriteHit.object.position.x, spriteHit.object.position.z) 
            };
            return;
        }
    }

    const hit = findTerrainIntersection(raycaster.ray);
    if (hit && state.originTile) {
        state.hasLastClicked = true;
        state.lastClickedCoords = { x: hit.x, z: hit.z, alt: getAltitudeAt(hit.x, hit.z) };
    } else {
        state.hasLastClicked = false;
    }
}

function startApp() {
    initScene();
    loadTerrain();
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    document.querySelectorAll('.ui-element').forEach(el => {
        (el as HTMLElement).style.display = 'flex';
    });
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

async function handleGPX(xml: string) {
    const gpx = new gpxParser(); gpx.parse(xml);
    if (!gpx.tracks?.length) return;
    state.rawGpxData = gpx;
    const startPt = gpx.tracks[0].points[0];
    state.TARGET_LAT = startPt.lat; state.TARGET_LON = startPt.lon;
    state.ZOOM = 13; state.originTile = lngLatToTile(startPt.lon, startPt.lat, 13);
    updateGPXMesh(); updateElevationProfile(); await updateVisibleTiles();
}

function refreshTerrain() { resetTerrain(); updateVisibleTiles(); }

async function takeScreenshot() {
    if (!state.renderer || !state.scene || !state.camera) {
        console.error("Missing scene, renderer, or camera for screenshot.");
        return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    const originalSize = { width: state.renderer.getSize(new THREE.Vector2()).width, height: state.renderer.getSize(new THREE.Vector2()).height };
    state.renderer.setSize(width, height);
    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();

    state.renderer.render(state.scene, state.camera);

    const imageBlob = await new Promise<Blob | null>((resolve) => {
        state.renderer!.domElement.toBlob(resolve, 'image/png', 1.0);
    });

    state.renderer.setSize(originalSize.width, originalSize.height);
    state.camera.aspect = originalSize.width / originalSize.height;
    state.camera.updateProjectionMatrix();

    if (imageBlob) {
        const url = URL.createObjectURL(imageBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `suntrail-screenshot-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
        showToast("Screenshot saved!");
    } else {
        showToast("Failed to create screenshot.");
    }
}
