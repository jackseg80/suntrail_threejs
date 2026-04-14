import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state, loadSettings, loadProStatus } from './state';
import { iapService } from './iapService';
import { requestGPSDisclosure } from './gpsDisclosure';
import { requestAcceptance } from './acceptanceWall';
import { requestOnboarding } from './onboardingTutorial';
import { i18n } from '../i18n/I18nService';
import { initScene, flyTo, forceImmediateLODUpdate } from './scene';
import { refreshTerrain } from './terrain';
import { updateStorageUI } from './tileLoader';
import { lngLatToTile, lngLatToWorld, worldToLngLat } from './geo';
import { showToast } from './toast';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { findTerrainIntersection, getAltitudeAt } from './analysis';
import { closeElevationProfile, updateElevationProfile } from './profile';
import { startLocationTracking, updateUserMarker, stopLocationTracking, clearUserMarker } from './location';
import { fetchWeather } from './weather';
import { fetchLocalPeaks } from './peaks';
import { initTheme } from './theme';
import { haptic } from './haptics';
import { resolveMapTilerKey } from './config';

import { NavigationBar } from './ui/components/NavigationBar';
import { TopStatusBar } from './ui/components/TopStatusBar';
import { WidgetsComponent } from './ui/components/WidgetsComponent';
import { TimelineComponent } from './ui/components/TimelineComponent';
import { initAutoHide } from './ui/autoHide';
import { initMobileUI } from './ui/mobile';
import { sheetManager } from './ui/core/SheetManager';
import { attachDraggablePanel } from './ui/draggablePanel';

// Référence de l'intervalle updateStorageUI (W5) — stockée pour permettre clearInterval si besoin
let storageUIIntervalId: ReturnType<typeof setInterval> | null = null;

export function initUI(): void {
    // Charger le statut Pro en premier (clé séparée, immune aux resets de version)
    loadProStatus();

    // Initialiser RevenueCat en fire-and-forget (natif seulement — no-op sur web)
    void iapService.initialize();

    // Résolution de la clé MapTiler (centralisée v5.28.20)
    const gistKeyReady = resolveMapTilerKey();

    const savedSettings = loadSettings();
    if (savedSettings) {
        // hasManualSource = true uniquement pour les sources non auto-sélectionnables.
        const AUTO_SOURCES = ['swisstopo', 'opentopomap'];
        state.hasManualSource = !AUTO_SOURCES.includes(savedSettings.MAP_SOURCE);
        if (savedSettings.PERFORMANCE_PRESET === 'custom') {
            applyCustomSettings(savedSettings);
        } else {
            applyPreset(savedSettings.PERFORMANCE_PRESET);
        }
    } else {
        const bestPreset = detectBestPreset();
        applyPreset(bestPreset);
    }

    // Sync i18n with persisted language
    i18n.setLocale(state.lang);

    // Initialiser le thème clair/sombre après chargement des settings
    initTheme();

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

    // Resize géré par scene.ts (unique handler, pas de doublon).
    let _orientPollId: ReturnType<typeof setTimeout> | null = null;
    window.addEventListener('orientationchange', () => {
        if (_orientPollId !== null) clearTimeout(_orientPollId);
        const prevW = window.innerWidth;
        const prevH = window.innerHeight;
        let attempts = 0;
        const poll = () => {
            _orientPollId = null;
            const w = window.innerWidth;
            const h = window.innerHeight;
            if ((w !== prevW || h !== prevH) && w > 0 && h > 0) {
                window.dispatchEvent(new Event('resize'));
                return;
            }
            if (++attempts < 30) { // 30 × 50ms = 1.5s max
                _orientPollId = setTimeout(poll, 50);
            } else {
                window.dispatchEvent(new Event('resize'));
            }
        };
        _orientPollId = setTimeout(poll, 50);
    });
    document.addEventListener('click', handleGlobalClick);
    
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) canvasContainer.addEventListener('click', handleMapClick);

    storageUIIntervalId = setInterval(updateStorageUI, 2000);

    // Helper : enregistre le listener sceneReady + démarre la scène
    const launchScene = () => {
        window.addEventListener('suntrail:sceneReady', () => {
            void requestAcceptance().then(() => requestOnboarding());

            const mapOverlay = document.getElementById('map-loading-overlay');
            if (mapOverlay) {
                mapOverlay.classList.add('visible');
                let tilesStarted = false;

                const offlineMsg = document.getElementById('map-loading-offline-msg');
                const spinnerText = mapOverlay.querySelector('.map-loading-text') as HTMLElement;
                const showOfflineMsg = () => {
                    if (offlineMsg) offlineMsg.style.display = 'flex';
                    if (spinnerText) spinnerText.style.display = 'none';
                };
                const hideOfflineMsg = () => {
                    if (offlineMsg) offlineMsg.style.display = 'none';
                    if (spinnerText) spinnerText.style.display = '';
                };

                if (!state.isNetworkAvailable) showOfflineMsg();
                const unsubNet = state.subscribe('isNetworkAvailable', (available: boolean) => {
                    if (available) hideOfflineMsg(); else showOfflineMsg();
                });

                const hideOverlay = () => {
                    mapOverlay.classList.add('fade-out');
                    setTimeout(() => { mapOverlay.style.display = 'none'; }, 300);
                    unsubNet();
                };

                const unsub = state.subscribe('isProcessingTiles', (processing: boolean) => {
                    if (processing) tilesStarted = true;
                    if (!processing && tilesStarted) { hideOverlay(); unsub(); }
                });

                setTimeout(() => { if (!tilesStarted) { hideOverlay(); unsub(); } }, 2000);
                setTimeout(() => { if (mapOverlay.classList.contains('visible')) hideOverlay(); }, 15000);
            }
        }, { once: true });

        startApp();
    };

    // --- INDICATEUR DE CHARGEMENT DES TUILES ---
    {
        const bar = document.getElementById('tile-loading-bar');
        let debounce: ReturnType<typeof setTimeout> | null = null;
        state.subscribe('isProcessingTiles', (processing: boolean) => {
            if (!bar) return;
            if (processing) {
                if (!debounce) {
                    debounce = setTimeout(() => { bar.classList.add('visible'); }, 600);
                }
            } else {
                if (debounce) { clearTimeout(debounce); debounce = null; }
                bar.classList.remove('visible');
            }
        });
    }

    // --- INITIALISATION COMPOSANTS ---
    const navBar = new NavigationBar();
    navBar.hydrate();

    const topStatusBar = new TopStatusBar();
    topStatusBar.hydrate();

    const widgets = new WidgetsComponent();
    widgets.hydrate();

    new TimelineComponent();
    initAutoHide();
    initMobileUI();

    const secondaryUIReady = _initSecondaryUI();

    // Démarrage automatique — attend la résolution de la clé MapTiler (avec timeout de sécurité)
    const safetyTimeout = new Promise<void>(resolve => setTimeout(resolve, 5000));
    void Promise.race([gistKeyReady, safetyTimeout]).then(async () => {
        await secondaryUIReady;
        launchScene();
    });

    (window as any).sheetManager = sheetManager;

    const gpsMainBtn = document.getElementById('gps-main-btn');
    let gpsLongPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressTriggered = false;

    gpsMainBtn?.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        longPressTriggered = false;
        
        gpsLongPressTimer = setTimeout(() => {
            clearUserMarker();
            stopLocationTracking();
            gpsMainBtn.classList.remove('active', 'following');
            showToast(i18n.t('gps.toast.disabled') || 'Position désactivée');
            gpsLongPressTimer = null;
            longPressTriggered = true;
            void haptic('medium');
        }, 2000);
    });

    const cancelGpsLongPress = () => {
        if (gpsLongPressTimer) {
            clearTimeout(gpsLongPressTimer);
            gpsLongPressTimer = null;
        }
    };

    gpsMainBtn?.addEventListener('pointerup', () => {
        // On attend un tout petit peu avant de reset pour que le 'click' qui suit puisse voir le flag
        setTimeout(() => { longPressTriggered = false; }, 10);
        cancelGpsLongPress();
    });
    gpsMainBtn?.addEventListener('pointerleave', cancelGpsLongPress);
    gpsMainBtn?.addEventListener('contextmenu', (e) => e.preventDefault());

    gpsMainBtn?.addEventListener('click', async () => {
        if (longPressTriggered) return;
        
        try {
            const allowed = await requestGPSDisclosure();
            if (!allowed) return;

            const position = await Geolocation.getCurrentPosition({
                timeout: 5000,
                enableHighAccuracy: true
            });
            
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const isAlreadyCentered = gpsMainBtn.classList.contains('active');

            if (!isAlreadyCentered) {
                state.TARGET_LAT = lat;
                state.TARGET_LON = lon;
                state.ZOOM = 14;
                state.originTile = lngLatToTile(lon, lat, 14);
                
                // v5.28.30 : Mettre à jour la position utilisateur pour que le point rouge soit visible dès le 1er clic
                state.userLocation = { lat, lon, alt: position.coords.altitude || 0 };
                updateUserMarker();

                refreshTerrain();
                
                const worldPos = lngLatToWorld(lon, lat, state.originTile);
                const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
                
                await flyTo(worldPos.x, worldPos.z, (altWorld / state.RELIEF_EXAGGERATION) + 500);
                
                // v5.28.25 : Force le LOD immédiatement en brisant le verrou de 800ms
                forceImmediateLODUpdate();
                
                fetchWeather(lat, lon);
                gpsMainBtn.classList.add('active');
                showToast(i18n.t('gps.toast.centered'));
            } else {
                gpsMainBtn.classList.toggle('following');
                const isFollowing = gpsMainBtn.classList.contains('following');
                showToast(isFollowing ? i18n.t('gps.toast.followOn') : i18n.t('gps.toast.followOff'));
                
                if (isFollowing) {
                    state.isFollowingUser = true;
                    await startLocationTracking();
                } else {
                    state.isFollowingUser = false;
                }
            }
        } catch (e: any) { 
            if (e.code === 1) {
                showToast(i18n.t('gps.toast.permissionDenied'));
            } else {
                showToast(i18n.t('gps.toast.error')); 
            }
            console.error("Geolocation error:", e.message);
        }
    });

    state.subscribe('isUserInteracting', (interacting) => {
        if (interacting && state.isFollowingUser) {
            const btn = document.getElementById('gps-main-btn');
            if (btn?.classList.contains('following')) {
                state.isFollowingUser = false;
                btn.classList.remove('active', 'following');
                showToast(i18n.t('gps.toast.interrupted'));
            }
        }
    });

    document.getElementById('close-coords')?.addEventListener('click', () => {
        const cp = document.getElementById('coords-pill');
        if (cp) cp.classList.add('hidden');
        state.hasLastClicked = false;
    });

    const coordsPill = document.getElementById('coords-pill');
    if (coordsPill) {
        attachDraggablePanel({
            panel: coordsPill,
            handle: coordsPill, 
            customPosClass: 'panel-custom-pos',
            onDismiss: () => {
                coordsPill.classList.add('hidden');
                state.hasLastClicked = false;
            },
        });

        const OVERLAP_TARGETS = [
            { el: document.querySelector('.fab-stack') as HTMLElement | null },
            { el: document.getElementById('top-pill-main') },
            { el: document.getElementById('rec-status-widget') },
            { el: document.getElementById('net-status-icon') },
            { el: document.getElementById('sos-main-btn') },
            { el: document.getElementById('timeline-toggle-btn') },
        ];
        const OVERLAP_CLS = 'widget-overlap-hidden';

        const checkPillOverlap = (): void => {
            if (coordsPill.classList.contains('hidden')) {
                OVERLAP_TARGETS.forEach(t => t.el?.classList.remove(OVERLAP_CLS));
                return;
            }
            const pr = coordsPill.getBoundingClientRect();
            OVERLAP_TARGETS.forEach(({ el }) => {
                if (!el) return;
                const had = el.classList.contains(OVERLAP_CLS);
                if (had) el.classList.remove(OVERLAP_CLS);
                const r = el.getBoundingClientRect();
                if (had) el.classList.add(OVERLAP_CLS);
                const overlaps = pr.right > r.left - 8 && pr.left < r.right + 8
                              && pr.bottom > r.top - 8 && pr.top < r.bottom + 8;
                el.classList.toggle(OVERLAP_CLS, overlaps);
            });
        };

        window.addEventListener('pointermove', checkPillOverlap, { passive: true });
        new MutationObserver(checkPillOverlap).observe(coordsPill, {
            attributes: true, attributeFilter: ['class'],
        });
    }

    const layersFab = document.getElementById('layers-fab');
    layersFab?.addEventListener('click', () => {
        sheetManager.toggle('layers-sheet');
    });

    const compassFab = document.getElementById('compass-fab');
    compassFab?.addEventListener('click', () => {
        if (state.controls && state.camera) {
            const controls = state.controls;
            const startAngle = controls.getAzimuthalAngle();
            let targetAngle = 0;
            
            let diff = targetAngle - startAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            targetAngle = startAngle + diff;
            
            const startTime = Date.now();
            const duration = 500;
            const initialAngle = startAngle;
            state.isInteractingWithUI = true;

            function animateNorth() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                const currentAngle = initialAngle + (targetAngle - initialAngle) * eased;

                const offset = state.camera!.position.clone().sub(controls.target);
                const spherical = new THREE.Spherical().setFromVector3(offset);
                spherical.theta = currentAngle;
                const newPos = new THREE.Vector3().setFromSpherical(spherical).add(controls.target);
                state.camera!.position.copy(newPos);
                controls.update();

                if (progress < 1) {
                    requestAnimationFrame(animateNorth);
                } else {
                    state.isInteractingWithUI = false;
                    showToast(i18n.t('compass.toast.northAligned'));
                }
            }
            animateNorth();
        }
    });

    state.subscribe('isUserInteracting', () => {
        const compassSvg = document.getElementById('compass-svg');
        if (compassSvg && state.camera) {
            const angle = state.controls?.getAzimuthalAngle() || 0;
            compassSvg.style.transform = `rotate(${-angle}rad)`;
        }
    });

    document.getElementById('close-profile')?.addEventListener('click', () => {
        closeElevationProfile();
    });
}

function handleGlobalClick(_e: MouseEvent) {}

async function handleMapClick(e: MouseEvent) {
    if (!state.renderer || !state.camera || !state.scene) return;

    if (sheetManager.getActiveSheetId()) {
        sheetManager.close();
    }

    const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.params.Sprite = { threshold: 35 };
    raycaster.setFromCamera(mouse, state.camera);

    const intersects = raycaster.intersectObjects(state.scene.children, true);

    const gpxHit = intersects.find(hit => hit.object.userData?.type === 'gpx-track');
    if (gpxHit) {
        const layerId = gpxHit.object.userData.layerId;
        if (layerId) {
            state.activeGPXLayerId = layerId;
            updateElevationProfile(layerId);
            sheetManager.open('track');
        }
        return;
    }

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
        
        const cp = document.getElementById('coords-pill');
        if (cp) {
            cp.classList.remove('panel-custom-pos');
            cp.style.left = ''; cp.style.top = ''; cp.style.bottom = ''; cp.style.transform = '';
            cp.classList.remove('hidden');
            const gps = worldToLngLat(hit.x, hit.z, state.originTile);
            const clickLatLon = document.getElementById('click-latlon');
            if (clickLatLon) clickLatLon.textContent = `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}`;
            const clickAlt = document.getElementById('click-alt');
            if (clickAlt) clickAlt.textContent = `${Math.round(state.lastClickedCoords.alt / state.RELIEF_EXAGGERATION)} m`;
        }
    } else {
        state.hasLastClicked = false;
        const cp = document.getElementById('coords-pill');
        if (cp) cp.classList.add('hidden');
    }
}

async function _initSecondaryUI(): Promise<void> {
    try {
        const [
            { SettingsSheet },
            { LayersSheet },
            { SearchSheet },
            { TrackSheet },
            { WeatherSheet, SolarProbeSheet, SOSSheet },
            { ConnectivitySheet },
            { PacksSheet },
            { UpgradeSheet },
            { VRAMDashboard },
            { InclinometerWidget },
        ] = await Promise.all([
            import('./ui/components/SettingsSheet'),
            import('./ui/components/LayersSheet'),
            import('./ui/components/SearchSheet'),
            import('./ui/components/TrackSheet'),
            import('./ui/components/ExpertSheets'),
            import('./ui/components/ConnectivitySheet'),
            import('./ui/components/PacksSheet'),
            import('./ui/components/UpgradeSheet'),
            import('./ui/components/VRAMDashboard'),
            import('./ui/components/InclinometerWidget'),
        ]);

        new SettingsSheet().hydrate();
        new LayersSheet().hydrate();
        new SearchSheet().hydrate();
        new TrackSheet().hydrate();
        new WeatherSheet().hydrate();
        new SolarProbeSheet().hydrate();
        new SOSSheet().hydrate();
        new ConnectivitySheet().hydrate();
        new PacksSheet().hydrate();
        new UpgradeSheet().hydrate();

        const vramDashboard = new VRAMDashboard();
        vramDashboard.init();
        state.vramPanel = vramDashboard;

        new InclinometerWidget().init();
    } catch (e) {
        console.error('[UI] Secondary hydration failed:', e);
    }
}

function startApp() {
    try {
        initScene();
        fetchWeather(state.TARGET_LAT, state.TARGET_LON);
        fetchLocalPeaks(state.TARGET_LAT, state.TARGET_LON);
        
        const navBar = document.getElementById('nav-bar');
        const topBar = document.getElementById('top-status-bar');
        const widgets = document.getElementById('widgets-container');
        const fabStack = document.querySelector('.fab-stack') as HTMLElement;
        
        if (navBar) navBar.style.display = 'flex';
        if (topBar) topBar.style.display = 'flex';
        if (widgets) widgets.style.display = 'block';
        if (fabStack) fabStack.style.display = 'flex';
        
        const bottomBar = document.getElementById('bottom-bar');
        if (bottomBar) bottomBar.style.display = 'block';
    } catch (e) {
        console.error('[UI] Critical failure during startApp:', e);
    } finally {
        (window as any).suntrailReady = true;
        window.dispatchEvent(new Event('suntrail:uiReady'));
    }
}

export function disposeUI(): void {
    if (storageUIIntervalId !== null) {
        clearInterval(storageUIIntervalId);
        storageUIIntervalId = null;
    }
}
