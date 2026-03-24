import * as THREE from 'three';
// @ts-ignore
import gpxParser from 'gpxparser';
import { state, loadSettings } from './state';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain, updateGPXMesh, loadTerrain } from './terrain';
import { updateStorageUI } from './tileLoader';
import { lngLatToTile, lngLatToWorld, worldToLngLat } from './geo';
import { showToast } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { findTerrainIntersection, getAltitudeAt } from './analysis';
import { updateElevationProfile } from './profile';
import { startLocationTracking } from './location';
import { fetchWeather } from './weather';

import { NavigationBar } from './ui/components/NavigationBar';
import { TopStatusBar } from './ui/components/TopStatusBar';
import { SettingsSheet } from './ui/components/SettingsSheet';
import { SearchSheet } from './ui/components/SearchSheet';
import { LayersSheet } from './ui/components/LayersSheet';
import { WeatherSheet, SolarProbeSheet, SOSSheet } from './ui/components/ExpertSheets';
import { TrackSheet } from './ui/components/TrackSheet';
import { WidgetsComponent } from './ui/components/WidgetsComponent';
import { TimelineComponent } from './ui/components/TimelineComponent';
import { initAutoHide } from './ui/autoHide';
import { initMobileUI } from './ui/mobile';
import { sheetManager } from './ui/core/SheetManager';

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

    const layersSheet = new LayersSheet();
    layersSheet.hydrate();

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

    const widgets = new WidgetsComponent();
    widgets.hydrate();

    new TimelineComponent();
    initAutoHide();
    initMobileUI();

    (window as any).sheetManager = sheetManager;

    window.addEventListener('gpx-uploaded', (e: any) => {
        handleGPX(e.detail);
    });

    window.addEventListener('export-recorded-gpx', () => {
        exportRecordedGPX();
    });

    // GPS MAIN BUTTON (SwissMobile Style)

    const gpsMainBtn = document.getElementById('gps-main-btn');
    gpsMainBtn?.addEventListener('click', async () => {
        try {
            // 1. Get current position with timeout
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                const timeoutId = setTimeout(() => reject(new Error("Geolocation timeout")), 5000);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        clearTimeout(timeoutId);
                        resolve(pos);
                    },
                    (err) => {
                        clearTimeout(timeoutId);
                        reject(err);
                    }
                );
            });
            
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            
            // 2. Check if we are already centered on user
            const isAlreadyCentered = state.isFollowingUser;

            if (!isAlreadyCentered) {
                // First click: Center and Zoom
                state.TARGET_LAT = lat;
                state.TARGET_LON = lon;
                state.ZOOM = 14;
                state.originTile = lngLatToTile(lon, lat, 14);
                
                refreshTerrain();
                
                const worldPos = lngLatToWorld(lon, lat, state.originTile);
                const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
                
                flyTo(worldPos.x, worldPos.z, (altWorld / state.RELIEF_EXAGGERATION) + 500);
                fetchWeather(lat, lon);
                
                state.isFollowingUser = true;
                gpsMainBtn.classList.add('active');
                showToast("📍 Position centrée");
            } else {
                // Second click while centered: Toggle continuous follow
                // (In this app, isFollowingUser already handles continuous centering in scene.ts)
                gpsMainBtn.classList.toggle('following');
                const isFollowing = gpsMainBtn.classList.contains('following');
                showToast(isFollowing ? "🚶 Suivi continu activé" : "📍 Suivi continu désactivé");
                
                if (isFollowing) {
                    await startLocationTracking();
                }
            }
        } catch (e: any) { 
            if (e.code === 1) {
                showToast("Permission GPS refusée. Vérifiez les réglages de votre navigateur.");
            } else {
                showToast("Erreur GPS ou délai dépassé"); 
            }
            console.error("Geolocation error:", e.message);
        }
    });

    // Stop following if user interacts with map
    state.subscribe('isUserInteracting', (interacting) => {
        if (interacting && state.isFollowingUser) {
            const btn = document.getElementById('gps-main-btn');
            if (btn?.classList.contains('following')) {
                // If in "hard" follow mode, we might want to keep it or break it.
                // SwissMobile breaks it if you move.
                state.isFollowingUser = false;
                btn.classList.remove('active', 'following');
                showToast("Suivi interrompu");
            }
        }
    });

    document.getElementById('close-coords')?.addEventListener('click', () => {
        const cp = document.getElementById('coords-panel');
        if (cp) cp.style.display = 'none';
        state.hasLastClicked = false;
    });

    document.getElementById('close-profile')?.addEventListener('click', () => {
        const ep = document.getElementById('elevation-profile');
        if (ep) ep.style.display = 'none';
    });
}

function handleGlobalClick(_e: MouseEvent) {
    // Global click handling if needed
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
        
        const cp = document.getElementById('coords-panel');
        if (cp) {
            cp.style.display = 'block';
            const gps = worldToLngLat(hit.x, hit.z, state.originTile);
            const clickLatLon = document.getElementById('click-latlon');
            if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            const clickAlt = document.getElementById('click-alt');
            if (clickAlt) clickAlt.textContent = `${Math.round(state.lastClickedCoords.alt)} m`;
        }
    } else {
        state.hasLastClicked = false;
    }
}

function startApp() {
    initScene();
    loadTerrain();
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
    const navBar = document.getElementById('nav-bar');
    const topBar = document.getElementById('top-status-bar');
    const widgets = document.getElementById('widgets-container');
    const gpsBtn = document.getElementById('gps-main-btn');
    
    if (navBar) navBar.style.display = 'flex';
    if (topBar) topBar.style.display = 'flex';
    if (widgets) widgets.style.display = 'block';
    if (gpsBtn) gpsBtn.style.display = 'flex';
    
    const bottomBar = document.getElementById('bottom-bar');
    if (bottomBar) bottomBar.style.display = 'block';
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
