import * as THREE from 'three';
import { Geolocation } from '@capacitor/geolocation';
import { state, loadSettings, loadProStatus } from './state';
import { iapService } from './iapService';
import { requestGPSDisclosure } from './gpsDisclosure';
import { requestAcceptance } from './acceptanceWall';
import { requestOnboarding } from './onboardingTutorial';
import { i18n } from '../i18n/I18nService';
import { initScene, flyTo } from './scene';
import { updateVisibleTiles, resetTerrain } from './terrain';
import { updateStorageUI } from './tileLoader';
import { lngLatToTile, lngLatToWorld, worldToLngLat } from './geo';
import { showToast } from './utils';
import { applyPreset, detectBestPreset, getGpuInfo, applyCustomSettings } from './performance';
import { findTerrainIntersection, getAltitudeAt } from './analysis';
import { closeElevationProfile } from './profile';
import { startLocationTracking } from './location';
import { fetchWeather } from './weather';

import { NavigationBar } from './ui/components/NavigationBar';
import { TopStatusBar } from './ui/components/TopStatusBar';
import { SettingsSheet } from './ui/components/SettingsSheet';
import { SearchSheet } from './ui/components/SearchSheet';
import { LayersSheet } from './ui/components/LayersSheet';
import { WeatherSheet, SolarProbeSheet, SOSSheet } from './ui/components/ExpertSheets';
import { TrackSheet } from './ui/components/TrackSheet';
import { ConnectivitySheet } from './ui/components/ConnectivitySheet';
import { UpgradeSheet } from './ui/components/UpgradeSheet';
import { WidgetsComponent } from './ui/components/WidgetsComponent';
import { TimelineComponent } from './ui/components/TimelineComponent';
import { VRAMDashboard } from './ui/components/VRAMDashboard';
import { InclinometerWidget } from './ui/components/InclinometerWidget';
import { initAutoHide } from './ui/autoHide';
import { initMobileUI } from './ui/mobile';
import { sheetManager } from './ui/core/SheetManager';
import { attachDraggablePanel } from './ui/draggablePanel';

// Référence de l'intervalle updateStorageUI (W5) — stockée pour permettre clearInterval si besoin
let storageUIIntervalId: ReturnType<typeof setInterval> | null = null;

export function initUI(): void {
    console.log("[UI] Starting Init...");
    
    // Charger le statut Pro en premier (clé séparée, immune aux resets de version)
    loadProStatus();

    // Initialiser RevenueCat en fire-and-forget (natif seulement — no-op sur web)
    void iapService.initialize();

    // Clé MapTiler bundlée — injectée au build depuis .env
    // Ne remplace la clé que si l'utilisateur n'en a pas défini une manuellement
    const bundledKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
    if (bundledKey && bundledKey.length > 10 && !state.MK) {
        state.MK = bundledKey;
    }

    // Clés MapTiler distantes (GitHub Gist) — rotation aléatoire sans re-deploy.
    // Le Gist contient un tableau de clés. L'app en choisit une au hasard par session.
    // Fire-and-forget : si le fetch échoue, la clé bundlée reste active.
    // La clé distante écrase la bundlée SAUF si l'utilisateur a défini sa propre clé.
    const userDefinedKey = localStorage.getItem('maptiler_key');
    if (!userDefinedKey) {
        fetch('https://gist.githubusercontent.com/jackseg80/c4f2e5e99c1efb9d736736cb65fce862/raw/suntrail_config.json', { cache: 'no-cache' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const raw = data?.maptiler_keys;
                if (!raw || !Array.isArray(raw) || raw.length === 0) return;
                // Support 2 formats : tableau de strings OU tableau d'objets {key, enabled}
                const activeKeys: string[] = raw
                    .filter((k: any) => typeof k === 'string' ? true : k.enabled !== false)
                    .map((k: any) => typeof k === 'string' ? k : k.key)
                    .filter((k: string) => k && k.length > 10);
                if (activeKeys.length > 0) {
                    const idx = Math.floor(Math.random() * activeKeys.length);
                    state.MK = activeKeys[idx];
                    console.log(`[Config] Clé MapTiler distante (${idx + 1}/${activeKeys.length} actives, ${raw.length} totales)`);
                }
            })
            .catch(() => { /* silencieux — la clé bundlée suffit */ });
    }

    const savedSettings = loadSettings();
    if (savedSettings) {
        // hasManualSource = true uniquement pour les sources non auto-sélectionnables.
        // 'swisstopo' et 'opentopomap' sont choisies par autoSelectMapSource() → ne pas bloquer l'auto-switch.
        // 'satellite', 'ign', 'osm' sont des choix explicites → respecter au rechargement.
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
    // Fix UI minuscule après rotation paysage→portrait sur Android WebView (v5.20) :
    // NE PAS toucher la <meta viewport> — ça désynchronise le scale factor interne du WebView.
    // On poll simplement jusqu'à ce que window.innerWidth/Height reflètent les nouvelles dimensions.
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

    // Setup Screen
    const setupK1 = document.getElementById('k1') as HTMLInputElement;
    const setupBgo = document.getElementById('bgo');
    const setupScreen = document.getElementById('setup-screen');

    const savedKey = localStorage.getItem('maptiler_key');
    if (savedKey) {
        setupK1.value = savedKey;
    }

    // Helper : enregistre le listener sceneReady + démarre la scène
    const launchScene = () => {
        // Cacher l'écran de setup une fois que le moteur 3D est prêt (render loop actif)
        // 'suntrail:sceneReady' est dispatché par initScene() avant await loadTerrain()
        window.addEventListener('suntrail:sceneReady', () => {
            if (setupScreen) {
                setupScreen.style.transition = 'opacity 0.4s ease';
                setupScreen.style.opacity = '0';
                setTimeout(() => {
                    setupScreen.style.display = 'none';
                    // Acceptance Wall : affiché une fois la scène visible, après la disparition
                    // du setup screen. Premier lancement ou nouvelle version des CGU.
                    void requestAcceptance().then(() => requestOnboarding());
                }, 420);
            }

            // Afficher l'overlay de chargement carte jusqu'aux 1ères tuiles
            // — résout le canvas vide au 1er démarrage Android sans cache
            const mapOverlay = document.getElementById('map-loading-overlay');
            if (mapOverlay) {
                mapOverlay.classList.add('visible');
                let tilesStarted = false;

                // Si pas de réseau détecté, afficher le message offline au lieu du spinner seul
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
                // Réagir si le réseau change pendant le chargement
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

                // Fallback 1 : si les tuiles ne démarrent jamais (cache chaud → 0 tiles à charger)
                setTimeout(() => { if (!tilesStarted) { hideOverlay(); unsub(); } }, 2000);
                // Fallback 2 : timeout max réseau lent ou hors-ligne
                setTimeout(() => { if (mapOverlay.classList.contains('visible')) hideOverlay(); }, 15000);
            }
        }, { once: true });

        startApp();
    };

    // --- INDICATEUR DE CHARGEMENT DES TUILES (permanent) ---
    // Barre fine en haut de l'écran, visible après 600ms de chargement réseau.
    // Débounce : ignore les hits cache (<0.3s) pour éviter le clignotement.
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

    // Si pas de clé bundlée → afficher le setup screen, lancer via bouton
    if (!state.MK) {
        setupBgo?.addEventListener('click', () => {
            const key = setupK1.value.trim();
            if (key.length < 10) {
                const serr = document.getElementById('serr');
                if (serr) serr.textContent = i18n.t('setup.error.invalidKey');
                return;
            }
            state.MK = key;
            localStorage.setItem('maptiler_key', key);

            if (setupBgo) {
                (setupBgo as HTMLButtonElement).disabled = true;
                setupBgo.innerHTML = `<span class="spinner" style="margin-right:8px;"></span>${i18n.t('setup.loading') || 'Chargement...'}`;
            }

            launchScene();
        });
    }

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

    const connectivitySheet = new ConnectivitySheet();
    connectivitySheet.hydrate();

    const upgradeSheet = new UpgradeSheet();
    upgradeSheet.hydrate();

    const widgets = new WidgetsComponent();
    widgets.hydrate();

    const vramDashboard = new VRAMDashboard();
    vramDashboard.init();
    state.vramPanel = vramDashboard;

    const inclinometer = new InclinometerWidget();
    inclinometer.init();

    new TimelineComponent();
    initAutoHide();
    initMobileUI();

    // Si clé bundlée (.env) ou clé manuelle sauvegardée → démarrage automatique
    // IMPORTANT : appelé APRÈS hydrate() de tous les composants pour que
    // #widgets-container et #bottom-bar soient dans le DOM quand startApp() s'exécute.
    // (v5.12.5 regression : launchScene() était appelé avant les hydrations → display:none non effacé)
    if (state.MK) {
        if (setupScreen) setupScreen.style.display = 'none';
        launchScene();
    }

    (window as any).sheetManager = sheetManager;

    // GPS MAIN BUTTON (SwissMobile Style)

    const gpsMainBtn = document.getElementById('gps-main-btn');
    gpsMainBtn?.addEventListener('click', async () => {
        try {
            // Prominent Disclosure GPS obligatoire Play Store (une seule fois)
            const allowed = await requestGPSDisclosure();
            if (!allowed) return;

            // 1. Get current position with timeout
            const position = await Geolocation.getCurrentPosition({
                timeout: 5000,
                enableHighAccuracy: true
            });
            
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            
            // 2. Check if we are already centered on user
            // Utiliser la classe 'active' du bouton (état visuel) plutôt que state.isFollowingUser.
            // state.isFollowingUser = true uniquement quand le suivi continu est actif (2e clic).
            // Sur le 1er clic, isFollowingUser=true bloquait isIdleMode → throttle 20fps cassé. (v5.11.1)
            const isAlreadyCentered = gpsMainBtn.classList.contains('active');

            if (!isAlreadyCentered) {
                // First click: Center and Zoom (centrage unique, pas de suivi continu)
                state.TARGET_LAT = lat;
                state.TARGET_LON = lon;
                state.ZOOM = 14;
                state.originTile = lngLatToTile(lon, lat, 14);
                
                refreshTerrain();
                
                const worldPos = lngLatToWorld(lon, lat, state.originTile);
                const altWorld = getAltitudeAt(worldPos.x, worldPos.z);
                
                flyTo(worldPos.x, worldPos.z, (altWorld / state.RELIEF_EXAGGERATION) + 500);
                fetchWeather(lat, lon);
                // Ne PAS mettre isFollowingUser=true ici — le centrage est unique.
                // isFollowingUser=true sur 1er clic empêche isIdleMode de s'activer
                // indéfiniment (userLocation=null → centerOnUser() ne fait rien mais throttle cassé).
                gpsMainBtn.classList.add('active');
                showToast(i18n.t('gps.toast.centered'));
            } else {
                // Second click: Toggle continuous follow + start GPS tracking
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

    // Stop following if user interacts with map
    state.subscribe('isUserInteracting', (interacting) => {
        if (interacting && state.isFollowingUser) {
            const btn = document.getElementById('gps-main-btn');
            if (btn?.classList.contains('following')) {
                // If in "hard" follow mode, we might want to keep it or break it.
                // SwissMobile breaks it if you move.
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

    // Rendre le coords-pill déplaçable (v5.19.1)
    const coordsPill = document.getElementById('coords-pill');
    if (coordsPill) {
        attachDraggablePanel({
            panel: coordsPill,
            handle: coordsPill, // Le pill entier sert de handle
            customPosClass: 'panel-custom-pos',
            onDismiss: () => {
                coordsPill.classList.add('hidden');
                state.hasLastClicked = false;
            },
        });
    }

    const layersFab = document.getElementById('layers-fab');
    layersFab?.addEventListener('click', () => {
        sheetManager.toggle('layers-sheet');
    });

    const compassFab = document.getElementById('compass-fab');
    compassFab?.addEventListener('click', () => {
        if (state.controls && state.camera) {
            // Animer la caméra vers le Nord (azimuth = 0)
            const controls = state.controls;
            const startAngle = controls.getAzimuthalAngle();
            let targetAngle = 0;
            
            // Choisir la direction la plus courte (gérer le wrap autour de -PI/PI)
            let diff = targetAngle - startAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            targetAngle = startAngle + diff;
            
            // Animation sur 500ms — isInteractingWithUI force le render loop à rendre
            const startTime = Date.now();
            const duration = 500;
            const initialAngle = startAngle;
            state.isInteractingWithUI = true;

            function animateNorth() {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // Easing ease-out-cubic
                const eased = 1 - Math.pow(1 - progress, 3);

                const currentAngle = initialAngle + (targetAngle - initialAngle) * eased;

                // Met à jour la position de la caméra pour maintenir la même distance
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

    // Update compass rotation in the loop (usually handled in scene.ts but we can add a listener)
    state.subscribe('isUserInteracting', () => {
        const compassSvg = document.getElementById('compass-svg');
        if (compassSvg && state.camera) {
            // Simplified angle extraction
            const angle = state.controls?.getAzimuthalAngle() || 0;
            compassSvg.style.transform = `rotate(${-angle}rad)`;
        }
    });

    document.getElementById('close-profile')?.addEventListener('click', () => {
        closeElevationProfile();
    });
}

function handleGlobalClick(_e: MouseEvent) {
    // Global click handling if needed
}

function handleMapClick(e: MouseEvent) {
    if (!state.renderer || !state.camera || !state.scene) return;

    // Fermer tout sheet ouvert quand on clique sur la carte
    if (sheetManager.getActiveSheetId()) {
        sheetManager.close();
    }

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
        
        const cp = document.getElementById('coords-pill');
        if (cp) {
            // Reset position custom si le pill avait été déplacé
            cp.classList.remove('panel-custom-pos');
            cp.style.left = '';
            cp.style.top = '';
            cp.style.bottom = '';
            cp.style.transform = '';
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

function startApp() {
    initScene(); // initScene() appelle await loadTerrain() en interne — pas de double appel
    // loadTerrain() supprimé ici (fix v5.11 — double appel inutile)
    fetchWeather(state.TARGET_LAT, state.TARGET_LON);
    
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

    // Notifier les modules qui attendent que l'UI soit prête (ex: toast d'enregistrement interrompu)
    window.dispatchEvent(new Event('suntrail:uiReady'));
}

// Nettoyage des ressources UI (intervalle updateStorageUI) — W5
export function disposeUI(): void {
    if (storageUIIntervalId !== null) {
        clearInterval(storageUIIntervalId);
        storageUIIntervalId = null;
    }
}


function refreshTerrain() { resetTerrain(); updateVisibleTiles(); }
