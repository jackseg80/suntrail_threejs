# SunTrail - Base de Connaissance (v5.16.0)

Ce fichier sert de mémoire long-terme pour les agents IA travaillant sur SunTrail. Il consigne les décisions architecturales critiques et les solutions aux problèmes complexes.

## 🧠 Architecture Core

### État Global & Persistance (`state.ts`)
- **Pivot Central** : Toute la configuration (LOD, sources, presets) réside dans l'objet `state`.
- **Réactivité (v5.8.0)** : L'objet `state` est désormais enveloppé dans un **Proxy JS récursif** (`ReactiveState.ts`). Les composants s'abonnent aux changements via `state.subscribe('path', callback)`.
- **Note sur les Tableaux (v5.8.16)** : Les méthodes modifiant les tableaux in-place (comme `.push()`) ne déclenchent pas le Proxy. Il faut utiliser la réaffectation (`state.arr = [...state.arr, item]`) pour notifier les abonnés.
- **Persistance** : Sauvegarde automatique dans `localStorage`. 
- **Versioning (v5.8.16)** : Le système inclut désormais un contrôle de version (`CURRENT_SETTINGS_VERSION`). Si une version obsolète est détectée lors du chargement, les réglages sont réinitialisés pour éviter les corruptions.
- **Event Bus (`eventBus.ts`)** : Utilisé pour briser les dépendances circulaires entre `terrain.ts` et `scene.ts`. Permet de déclencher des événements transversaux (ex: `terrainReady`, `flyTo`).
- **Multi-GPX (v5.10.0)** : `state.gpxLayers: GPXLayer[]` remplace `rawGpxData/gpxMesh/gpxPoints`. Chaque layer a son propre mesh, couleur, stats et points 3D. La réaffectation `state.gpxLayers = [...state.gpxLayers, layer]` est obligatoire pour notifier le Proxy.
- **isFlyingTo (v5.10.0)** : Flag `state.isFlyingTo` mis à `true` pendant l'animation flyTo. **Bloque l'origin shift** pour éviter que les coordonnées capturées dans la closure de l'animation deviennent stales. Remis à `false` à la fin de l'animation (`progress >= 1`).
- **i18n live-reload (v5.10.0)** : `BaseComponent.hydrate()` souscrit à `localeChanged` et appelle `applyToDOM(this.element)`. Cela ne met à jour **que** les éléments avec `data-i18n`. Les strings créées par `innerHTML`/`textContent` en JS doivent **aussi avoir `data-i18n`** pour être re-traduites. Exemple : `el.innerHTML = \`<p data-i18n="key">\${i18n.t('key')}</p>\``. Pour les éléments hors composants (ex: `sun.ts`), utiliser un listener `eventBus.on('localeChanged', () => ...)` dédié.
- **ID Testeur (v5.16.1)** : `SettingsSheet.ts` → section "ID Testeur" dans Réglages → Avancés. Appelle `iapService.getAppUserID()` (async) → affiche `$RCAnonymousID:...` avec bouton copier presse-papier. Permet l'identification des testeurs pour attribution de récompense Pro après passage en Production. Visible uniquement si `iapService.initialized` (natif Android/iOS).
- **OnboardingTutorial (v5.16.0)** : `src/modules/onboardingTutorial.ts` — module standalone (pas un BaseComponent). Deux exports : `requestOnboarding()` (flag `suntrail_onboarding_v1` — 1er lancement seulement) et `showOnboarding()` (toujours afficher, pour le bouton Réglages). Appelé dans `ui.ts` via `requestAcceptance().then(() => requestOnboarding())`. `z-index: 9000` (en dessous de l'acceptance wall à 9998 qui s'affiche avant). **Ne jamais appeler `localStorage.setItem(ONBOARDING_KEY)` dans `showOnboarding()`** — uniquement dans `requestOnboarding()` après résolution.
- **VRAMDashboard (v5.10.0)** : `state.vramPanel: VRAMDashboard | null`. Classe standalone (pas un BaseComponent). `init()` injecte un panel `position:fixed` dans `document.body`. `toggle()` contrôle simultanément les FPS Stats.js (`state.stats.dom`) et le panel VRAM. Activé via toggle "Stats de performance" dans Réglages Avancés.

### Interface & Composants (v5.9.0)
- **Architecture Découplée** : La logique UI est extraite de `ui.ts` vers des classes spécialisées (`src/modules/ui/components/`).
- **BaseComponent** : Classe abstraite gérant le cycle de vie (hydratation via `<template>`, rendu, nettoyage des abonnements).
- **SheetManager** : Singleton gérant l'exclusivité des Bottom Sheets. Gère également : focus trap (Tab/Shift+Tab), touche Escape, attributs ARIA (`role="dialog"`, `aria-modal`), swipe-to-dismiss via `.sheet-drag-handle`.
- **EventBus Sheet Events (v5.9.0)** : `sheetOpened`/`sheetClosed` émis par SheetManager. `NavigationBar` s'abonne à ces événements — le `setInterval(300ms)` de polling a été supprimé.
- **Design Tokens (v5.9.0)** : Variables CSS systématiques dans `:root` — `--space-1..6`, `--text-xs..xl`, `--radius-sm..xl`, `--transition-fast/normal/slow`. Utiliser ces tokens dans tout nouveau CSS, jamais de valeurs hardcodées.
- **SharedAPIKeyComponent (v5.9.0)** : Formulaire clé MapTiler réutilisable (`src/modules/ui/components/SharedAPIKeyComponent.ts`). Instancier avec un `containerId` slot. Synchronisation automatique via `state.subscribe('MK')`.
- **Haptics (v5.9.0)** : Helper `src/modules/haptics.ts` avec `haptic(type)`. Appel via `void haptic('medium')` (jamais await). Utilisé uniquement sur les swipes et les confirmations de succès — PAS sur les clics courants.
- **Glassmorphism** : Style visuel unifié basé sur des variables CSS (`--glass-*`) avec flou de profondeur (20px) et saturation optimisée.
- **Timeline FAB (v5.9.0)** : La classe `body.timeline-open` masque `.fab-stack` quand la timeline est ouverte. Togglée dans `TimelineComponent`. Ne pas utiliser le sélecteur CSS `~` (ordre DOM non garanti).

### Sources Cartographiques LOD 6-10 (v5.15.0)
- **OpenTopoMap à LOD ≤ 10 (v5.15.0)** : `getColorUrl()` utilise `{a|b|c}.tile.opentopomap.org` quand `zoom <= 10`. MapTiler n'est **pas** appelé à ces zooms — coût quota trop élevé pour une qualité identique, risque de 429 global. Rotation des 3 sous-domaines via `(tx+ty) % 3`. Licence CC-BY-SA.
- **`preloadChOverviewTiles()` désactivée (v5.15.0)** : le bulk pre-seeding des ~300-400 tuiles Suisse LOD 6-9 viole la politique d'utilisation OSM/OpenTopoMap. Fonction conservée en no-op `@deprecated`. **Ne jamais réactiver** sans accord explicite du fournisseur ou serveur de tuiles auto-hébergé (PMTiles).
- **`nativeMax = 18` universel (v5.15.0)** : le cap `nativeMax = 15` pour `MAP_SOURCE === 'opentopomap'` a été supprimé. OpenTopoMap n'est utilisé qu'à LOD ≤ 10 (zoom < 15), donc le cap était sans effet — mais trompeur pour les agents. À LOD > 10, swisstopo/IGN/MapTiler supportent tous zoom 18 nativement.

### Moteur de Tuiles & Performance (`terrain.ts` / `tileLoader.ts`)
- **Sélection source par coins de tuile (v5.14.1)** : `getColorUrl()` et `getOverlayUrl()` utilisent `isTileFullyInRegion()` (4 coins) au lieu du centre pour décider si une tuile utilise SwissTopo ou IGN. Une tuile-frontière dont le centre est en Suisse mais dont la moitié nord est en Allemagne ne doit PAS utiliser SwissTopo (retourne zone noire hors couverture). SwissTopo/IGN uniquement si **tous les 4 coins** sont dans le pays. Sinon fallback MapTiler/OSM. **Ne jamais revenir à un check centre-seul pour les sources nationales.**
- **WebWorkers Pool** : 8 workers asynchrones (`tileWorker.ts`) pour le fetch et le calcul des Normal Maps (relief).
- **Material Pooling (`materialPool.ts`)** : Réutilisation des shaders pour éviter les micro-saccades de compilation Three.js (v5.6.4).
- **Gestion Mémoire (`memory.ts`)** : Utilisation stricte de `disposeObject()` pour libérer la VRAM lors du déchargement des tuiles.
- **Offline-First & PMTiles** : Support PWA (Service Worker) et lecture de fichiers `.pmtiles` locaux pour un usage sans réseau (v5.7.0).
- **Données d'Élévation (v5.8.17)** : Les tuiles d'élévation Terrain-RGB sont capées au zoom 14 max. Pour éviter les erreurs de calcul de pentes à LOD > 14, le worker utilise `elevSourceZoom` (zoom réel des données) pour calculer la taille des pixels des normal maps, pas le zoom d'affichage demandé.

### Données & APIs
- **Hydrologie 3D (v5.8.4)** : Restauration d'un moteur d'eau réaliste. Détection chromatique optimisée pour SwissTopo et vagues en **"Rouleaux Géants"** sans couture entre les tuiles grâce à l'utilisation des coordonnées mondiales absolues.
- **Bâtiments 3D (v5.8.5)** : Utilisation prioritaire de l'**API MapTiler Buildings (Vector Tiles)** pour la rapidité et la stabilité. Les données étant limitées nativement au Zoom 14, un système d'**Overzooming** recalcule les coordonnées pour les niveaux supérieurs. Basculement automatique (Fallback) vers l'API Overpass (OSM) en cas d'erreur ou de quota atteint.
- **Sentiers (MVT)** : Utilisation de tuiles vectorielles (**MVT/PBF**) au lieu de raster pour une netteté infinie et un rendu stylisé (v5.6.5).
- **Végétation Bio-Fidèle (v5.8.15)** : Sélection des essences d'arbres basée sur l'altitude réelle. Utilisation d'un **Dithered Scan** (échantillonnage aléatoire des pixels) pour éliminer le moiré et les bandes. Inclusion d'un **Filtre de Forêt Continue** capturant le fond clair et les symboles sombres de SwissTopo tout en excluant strictement les prairies lumineuses. Nouveauté (v5.8.15) : **Déterminisme Absolu** ; passage à un système de placement par **Pseudo-Random Déterministe** (basé sur les coordonnées mondiales) éliminant définitivement les coutures entre tuiles (net cuts) et les bandes vides.

## 🔋 Performance & Mobile

### Optimisations Énergétiques (v5.11)
- **Battery API** : Basculement automatique en mode "Eco" si la batterie descend sous les 20% (v5.7.1).
- **Deep Sleep réel (v5.11)** : `renderer.setAnimationLoop(null)` sur `visibilitychange hidden` — arrêt total du GPU quand l'écran est verrouillé ou l'app minimisée. Le handler est stocké en variable module-level et supprimé dans `disposeScene()`. IMPORTANT : le `return` inline dans renderLoopFn était insuffisant — setAnimationLoop continuait de tourner.
- **Throttle eau/météo (v5.11 Phase 2)** : `waterTimeAccum` et `weatherTimeAccum` (accumulateurs en ms) dans `scene.ts`. `uTime` de l'eau s'incrémente uniquement quand `waterFrameDue` (toutes les 50ms = 20 FPS max). `updateWeatherSystem` n'est appelé que quand `weatherFrameDue` — avec `weatherAccumDelta` (delta cumulé entre deux appels). `SHOW_HYDROLOGY` et météo ne déclenchent un rendu dans `needsUpdate` que quand `*FrameDue` est vrai — économise les frames GPU quand seule l'eau/météo est animée.
- **⚠️ RÈGLE CRITIQUE — Accumulateurs AVANT les guards (v5.11.1)** : `waterTimeAccum` et `weatherTimeAccum` doivent être incrémentés **avant** tout `return` guard dans `renderLoopFn` (ENERGY_SAVER guard, idle throttle guard). Si placés après, les frames skippées ne les incrémentent pas → il faut N renders pour atteindre 50ms au lieu de 1 → eau/météo visible à ~5fps au lieu de 20fps. Symptôme : "la pluie semble à 2-3fps malgré le throttle 20fps configuré".
- **Idle Throttle Global (v5.11.1)** : Guard `isIdleMode` dans `renderLoopFn` limite le render à 20fps quand `!isUserInteracting && !isFlyingTo && !isFollowingUser && !(isWeatherActive && weatherFrameDue) && now - lastInteractionTime >= 800ms`. `lastInteractionTime` mis à jour dans `controls.addEventListener('end')` ET dans le callback `onEnd` de `initTouchControls`. Résout le GPU à 45-48fps en idle sur Android WebView.
- **⚠️ RÈGLE `isIdleMode` — Tout mouvement continu doit être exempté** : Tout état produisant un mouvement continu de caméra **doit** figurer dans la condition `isIdleMode` **ET** comme condition standalone dans `needsUpdate`. Liste actuelle : `isFlyingTo`, `isFollowingUser`. Si un jour on ajoute une cinématique orbitale ou un "replay" de tracé, appliquer le même pattern — sinon le mouvement sera throttlé à 20fps.
- **flyTo / `needsUpdate` standalone (v5.11.1)** : La RAF `animateFlight` appelle `controls.update()` en interne, ce qui met à jour `lastPosition` dans OrbitControls. Le `controls.update()` suivant de `renderLoopFn` retourne donc `false` (aucun delta détecté) → `controlsDirty = false`. `state.isFlyingTo` est donc déclaré en condition **standalone** dans `needsUpdate` (non couplé à `controlsDirty`). Idem pour `state.isFollowingUser` : `centerOnUser()` manipule directement `camera.position`. **Ne jamais recoupler ces états à `controlsDirty`**.
- **controls.update() stuck WebView Android (v5.11.1)** : `OrbitControls.update()` retourne `true` indéfiniment sur WebView Android (convergence floating-point jamais terminée). Fix : appeler `controls.update()` à chaque frame (damping physique préservé) mais n'inclure son résultat dans `needsUpdate` que pendant 800ms après `lastInteractionTime`. `tiltAnimating` extrait comme source séparée (calcul du tilt auto parabolique) — indépendant de `controls.update()`.
- **Météo GPU-driven (v5.11.1)** : Le système météo (pluie/neige) utilise un `THREE.Points` avec `ShaderMaterial` custom. Les positions sont calculées **entièrement dans le vertex shader** depuis `uTime` (uniform). `updateWeatherSystem(delta, cameraPos)` incrémente `uTime += delta` (delta = `weatherAccumDelta`) et met à jour les uniforms cosmétiques (couleur, vent, taille). Ne jamais réintroduire `tickWeatherTime` — la séparation uTime/uniforms n'est pas nécessaire car le throttle 20fps avec accumulateurs corrects donne des particules fluides.
- **Loading Overlay 1er démarrage (v5.11.1)** : `#map-loading-overlay` dans `index.html` — fond noir + spinner, `z-index: 50`. Affiché dans le listener `suntrail:sceneReady` (ui.ts). Caché quand `state.subscribe('isProcessingTiles')` passe `false` pour la première fois après `true`. Fallback timer 2s si tuiles déjà en cache (pas de transition `true → false`). Timeout max 15s pour réseau lent ou hors-ligne.
- **Adaptive DPR (v5.11 Phase 2)** : Sur mobile, `controls 'start'` → `renderer.setPixelRatio(1.0)`. `controls 'end'` + 200ms → restaure `state.PIXEL_RATIO_LIMIT`. Timer effacé si nouveau 'start' avant expiration. Conditionné à `isMobileDevice`. Invisible pour l'utilisateur.
- **VEGETATION_CAST_SHADOW (v5.11 Phase 2)** : Flag dans `PerformanceSettings` + `state`. `false` pour eco/balanced (économise ~18 draw calls shadow pass). `true` pour performance/ultra. Appliqué dans `vegetation.ts` : `iMesh.castShadow = state.VEGETATION_CAST_SHADOW`.
- **ENERGY_SAVER par tier (v5.11)** : eco/balanced → `true` par défaut (mid-range, autonomie prioritaire). **performance/ultra → `false` par défaut** (flagship, 60fps — l'utilisateur a payé pour les perfs). Le toggle manuel dans Réglages Avancés permet à chaque utilisateur d'ajuster. Exception dans `applyPreset()` : eco/balanced mobile force toujours `true` même si localStorage avait `false` (utilisateurs existants).
- **IS_2D_MODE (v5.11)** : `state.IS_2D_MODE: boolean` — flag indépendant du preset. Contrôle l'affichage (mesh plat vs élévation) sans affecter ENERGY_SAVER ni la qualité 3D. Persisté en localStorage. Le preset `eco` met `IS_2D_MODE=true` dans `applyPreset()`. Les tuiles sont TOUJOURS fetchées avec élévation pour LOD > 10 (`fetchAs2D = zoom <= 10`), même en mode 2D — garantit un switch 2D→3D instantané sans re-fetch.
- **Toggle 2D/3D (v5.11)** : Bouton en première position de la nav bar bas. `rebuildActiveTiles()` (terrain.ts) reconstruit les meshes EN PLACE sans vider la scène. **Ne jamais appeler `resetTerrain()` pour un toggle 2D/3D** — `dispose()` détruit les matériaux GPU au lieu de les rendre au `materialPool` → pool vide → recompilation shader → damier noir/clair. Le switch 2D→3D détecte les tuiles sans élévation valide (`!pixelData && zoom > 10`), invalide leur cache et les recharge.
- **IS_2D_MODE verrouillé en LOD ≤ 10 (v5.11.2)** : `NavigationBar.ts` souscrit à `state.ZOOM`. Quand `ZOOM ≤ 10` : `btn.disabled = true`, `IS_2D_MODE` forcé à `true`, `_modeBeforeLowZoom` mémorise l'état précédent. Quand `ZOOM > 10` : bouton réactivé, mode restauré depuis `_modeBeforeLowZoom`, `rebuildActiveTiles()` appelé si le mode change réellement. Raison : `fetchAs2D = zoom <= 10` dans `terrain.ts` — les tuiles basses résolutions sont toujours plates, la 3D n'a aucun effet.
- **Pré-cache Suisse LOD 6-9 (v5.11.2)** : `preloadChOverviewTiles()` dans `tileLoader.ts`, appelé en fire-and-forget depuis `main.ts`. Calcule toutes les tuiles couvrant la CH (bbox 5.4–11.3°lon, 45.2–48.2°lat) aux zooms 6 à 9 (~300-400 tuiles), les télécharge via `fetchWithCache(url, true)` par lots de 8. Flag `suntrail-ch-preloaded-v1` en localStorage — ne s'exécute qu'une seule fois. À partir de la 2e visite, la vue de démarrage LOD 6 est instantanée même hors-ligne.
- **2D Turbo** : Mode spécifique avec élévation zéro et maillage plat (2 triangles/tuile), bridé à 30 FPS.
- **FPS Rolling (v5.11)** : `state.currentFPS` alimenté dans le render loop (compteur de frames, fenêtre 1s). Utilisé par le PerfRecorder et affiché dans le panel VRAM.
- **processLoadQueue hardcodé corrigé (v5.11)** : `slice(0, 4)` → `slice(0, Math.max(1, state.MAX_BUILDS_PER_CYCLE))`. Le preset ne contrôlait pas le débit réel des fetchs de tuiles — seulement les rebuilds de mesh.

### Presets — Tiers du Marché Mobile (v5.11)
Les presets reflètent désormais le marché mobile réel, sans double-couche "preset + caps". Les valeurs sont directes et universelles :
- **eco** : Vieux mobile (Mali-G52, Adreno 5xx, Intel HD 4xx) — RANGE 3, shadow off, MAX_ZOOM 14
- **balanced** (STD — Galaxy A53) : RESOLUTION 32, RANGE 4, shadow 256, végétation légère (density 500)
- **performance** (High — Galaxy S23 / Adreno 740 / GTX 1050) : RANGE 5, shadow 1024, MAX_BUILDS 2 — valeurs baked-in sans caps
- **ultra** (PC / Snapdragon Elite) : Pleine qualité PC. Sur mobile Elite : shadow≤2048, RANGE≤8 (ajustements minimaux dans `applyPreset()`).
- **Seuls ajustements mobiles résiduels** dans `applyPreset()` : ENERGY_SAVER (batterie), Ultra shadow/range, PIXEL_RATIO≤2.0.

### Détection GPU (v5.11)
`detectBestPreset()` couvre 52 patterns GPU : Intel HD/UHD par génération, Intel Arc, Intel Iris Xe, AMD Vega iGPU, AMD RX par série (RDNA/Polaris), NVIDIA GTX par série numérique, Snapdragon Elite (Adreno 830+), Mali par modèle exact. Fallback : ≥8 cores CPU → `balanced`, sinon `eco`. **`detectBestPreset()` ne modifie plus `state.ENERGY_SAVER` directement** — c'est fait dans `applyPreset()` pour gérer les utilisateurs de retour (localStorage).

### PerfRecorder (v5.11)
`VRAMDashboard` intègre un enregistreur de sessions de performance. Bouton ⏺/⏹ dans le panel VRAM. Buffer circulaire 600 échantillons (5 min à 500ms). Export JSON dans le presse-papier. Données : fps, textures, geometries, drawCalls, triangles, tiles, zoom, isProcessingTiles, isUserInteracting, energySaver. Utiliser pour analyser les chutes de FPS : coller le JSON dans le chat IA pour corrélation fps↔textures↔isProcessingTiles.

### Adaptabilité Matérielle
- **Light Shader** : Shader simplifié pour GPU Mali/Adreno mid-range, divisant par 4 la charge GPU (v4.5.46).
- **Adaptive Scan** : Réduction du pas de scan pour la végétation sur les appareils mobiles pour préserver le CPU (v4.5.45).

## 🕹️ Navigation & UX

### Mouvements de Caméra
- **Vue de démarrage (v5.11.2)** : Centroïde Suisse — `TARGET_LAT: 46.8182, TARGET_LON: 8.2275`, `ZOOM: 6` (`state.ts`). Caméra initiale à `(0, 2000000, 2000000)` → dist ≈ 2 828 000 → `getIdealZoom()` retourne LOD 6 (seuil `dist ≥ 2 000 000`). `TARGET_LAT/LON` et `ZOOM` ne sont **pas persistés** en localStorage — le changement s'applique à tous les utilisateurs existants et nouveaux.
- **Cinematic flyTo** : Trajectoire en "cloche" (parabolique) avec interpolation `easeInOutCubic` et vérification anti-collision en temps realtime (v4.6.0).
- **Adaptive Zoom (v5.8.6)** : Logique de saut intelligent de LOD lors des téléportations ou des déplacements rapides. Élimine le délai de chargement des paliers intermédiaires pour une netteté immédiate à l'arrivée.
- **Tilt Parabola** : L'inclinaison maximale de la caméra est dynamique ; elle atteint son pic au LOD 14 et se redresse automatiquement vers le sol à haute altitude pour masquer l'horizon vide (v4.5.56).
 - **Navigation Tactile Google Earth (v6.3)** : `src/modules/touchControls.ts` — module autonome interceptant les **PointerEvents** (pas TouchEvents) en phase capture avant OrbitControls. Stratégie : désactive `controls.enabled = false` au premier contact, réactive à la fin. **Architecture 2 doigts (v6.3)** :
   - **Zoom** : pinch-spread → `doZoomToPoint()` raycasting (zoome vers le centre des doigts, pas le centre écran).
   - **Rotation** : twist tire-bouchon → `doRotate()`, per-frame avec 3 guards : `|dAngle| > ROT_DEADZONE` + `|dAngle| > spreadDelta × 0.5` (pas de bruit zoom) + `|dAngle| × 150 > |dy|` (pas de bruit tilt).
   - **Tilt** : détecté par le **placement initial des doigts** (style Google Earth). Si les 2 doigts sont posés côte à côte (angle < `TILT_ANGLE = 45°` de l'horizontal), `_tiltPreArmed = true`. Dès le premier mouvement vertical (`|dy| > |dx|` + spread stable) → `_tiltLocked = true` → **seul** `doTilt(dy)` s'applique, zoom/rotation bloqués. Reset au lever d'un doigt. **⚠️ Erreur fatale** : détecter le tilt par accumulation de signal (v2→v5) → PointerEvents se déclenchent un pointeur à la fois → d2y=0 systématiquement → faux positifs constants. Seule la détection par placement fonctionne.
   - **Pan** : 1 doigt (avec inertie) ou 2 doigts horizontaux (fallback).
   - Paramètres ajustables en tête de fichier : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE`, `TILT_ANGLE`.

### GPS & Orientation
- **Origin Shift (Précision GPS)** : Recentrage dynamique complet du monde 3D (Seuil 35km) incluant la translation atomique de tous les objets : Caméra, Soleil, Marqueur, GPX, Forêts et Étiquettes pour une précision absolue longue distance (v5.8.3).
- **Lissage Boussole** : Filtre passe-bas (10%) sur les données de l'API `DeviceOrientation` pour supprimer les tremblements du cône de vue.

## 🗺️ Stratégies Cartographiques Spécifiques

### Unification Globale (LOD <= 10)
- **Problème** : Effet "patchwork" (Suisse verte, France blanche, Allemagne brune) à petite échelle.
- **Solution** : Forçage d'une source unique (MapTiler Topo ou OSM) au LOD <= 10. Les sources de précision (Swisstopo/IGN) ne s'activent qu'au LOD 11+ (v5.7.4).

### Sécurité API & Fallback OSM
- **Détection 403** : Détection dynamique des erreurs de clé MapTiler invalide (v5.7.4).
- **Auto-Switch** : Basculement instantané et global vers **OpenStreetMap Standard** si MapTiler est bloqué ou inaccessible.

## 🛠️ Guide de Débogage

| Symptôme | Cause Probable | Solution |
|----------|----------------|----------|
| Altitude affichée en double au clic | `getAltitudeAt()` retourne altitude × `RELIEF_EXAGGERATION` (correct pour 3D). L'affichage texte ne doit pas utiliser cette valeur brute. | Diviser par `state.RELIEF_EXAGGERATION` au moment du `textContent` uniquement. Voir `ui.ts` `#click-alt`. (v5.15.0) |
| Toast "Accès Pro activé" × 3 | Deux `showToast()` explicites (un dans `grantProAccess()`, un dans `UpgradeSheet.ts`) + listener `addCustomerInfoUpdateListener` sans guard. | Supprimer le toast dans `UpgradeSheet.ts`. Ajouter `if (!state.isPro)` dans le listener. `grantProAccess()` = seule source de vérité. (v5.15.0) |
| Prix test Google Play "3.99€ for 5 minutes" | Google Play ajoute le suffixe de période de test au `priceString` RevenueCat. | Regex de sanitisation dans `iapService.ts` `getPrices()`. En production, le prix est normal. (v5.15.0) |
| Panneau météo/solaire s'ouvre en bas au lieu du haut | `trapFocus()` dans `SheetManager.ts` focus le 1er élément focusable via `setTimeout(..., 50)` → le navigateur scroll vers cet élément à +50ms, après le `requestAnimationFrame` de reset (~16ms). Premier élément focusable = bouton "Copier" en bas du contenu → scroll vers bas. | `setTimeout(() => { sheet.scrollTop = 0; }, 55)` dans `SheetManager.open()` après `eventBus.emit('sheetOpened')` — contrecarre le focus-scroll en tirant 5ms après. Ne jamais utiliser `requestAnimationFrame` seul : trop tôt. (v5.16.4) |
| `#settings-version` et bloc Sources & Légal invisibles dans Paramètres Avancés | Template `template-settings` avait un `</div>` surnuméraire (ligne ~361) qui, via l'algorithme d'adoption HTML5, fermait accidentellement `<div id="settings">`. Sources & version se retrouvaient hors du sheet container et étaient rendus hors-écran. Diagnostiqué par parse5 : `closing-of-element-with-open-child-elements` à la ligne `</template>`. | Supprimer le `</div>` orphelin + ajouter `</details></div>` explicites avant `</template>`. Valider avec parse5 : `node -e "const {parse}=require('parse5'); parse(html,{onParseError:e=>{throw e}})"`. (v5.16.4) |
| Bande vide transparente LOD 11+ (Schaffhausen nord, Forêt Noire, Tessin) | `isPositionInFrance()` avait `lon < 9.6` → les tuiles en Allemagne (Baden-Württemberg) passaient `isTileFullyInRegion(FR) = TRUE` → IGN appelé pour des tuiles hors-France → 404 "No data found" → canvas transparent → HTML visible. La Corse (8.4-9.7°E) nécessite un cas séparé. | `lon < 8.3` pour la France continentale + cas Corse `lat 41-43°N, lon 8.4-9.7°E`. Cache tuiles vidé v1→v2. (v5.16.3) |
| Spam MapTiler à LOD 6-10, arrêt de chargement | Toutes les tuiles couleur LOD ≤ 10 appelaient MapTiler — 300+ requêtes au démarrage. Une 429 désactivait MapTiler globalement. | `getColorUrl()` utilise OpenTopoMap (`{a|b|c}.tile.opentopomap.org`) à `zoom <= 10`. `preloadChOverviewTiles()` désactivée (violation politique OSM). (v5.15.0) |
| Inclinomètre caché par la nav bar | `InclinometerWidget` avait `bottom: 80px` hardcodé. Sur appareils avec grande `safe-area-inset-bottom` (> 8px), la nav bar dépasse 80px. | `bottom: calc(var(--bar-h) + var(--safe-bottom) + 16px)` — les CSS custom properties fonctionnent dans les inline styles. (v5.15.0) |
| Bouton 2D/3D introuvable dans NavigationBar après déplacement vers FAB | Si le bouton est déplacé hors du template nav-bar, `this.element.querySelector()` retourne null. | Utiliser `document.querySelector('#nav-2d-toggle')` dans `NavigationBar.ts` — le bouton est dans la FAB stack statique, pas dans le template. (v5.15.0) |
| Tuiles Noires (Est) | Clé MapTiler invalide/403 | Vérifier `state.MK` ou laisser le fallback OSM agir. |
| Saut de carte au dézoom | `updateVisibleTiles` sans args | S'assurer de passer la position caméra ou laisser le fallback par défaut (v5.7.4). |
| Voile rouge en 2D | Pentes activées par erreur | Vérifier le flag `is2DGlobal` dans `updateVisibleTiles`. |
| Bâtiments dans les lacs | Erreur Z-Mirror | Vérifier la correction d'altitude relative au relief dans `buildings.ts`. |
| Pentes tout rouge (LOD 15+) | Mauvais calcul normal map | Les données d'élévation sont capées au zoom 14. Le worker doit utiliser `elevSourceZoom` pour calculer la taille des pixels, pas le zoom demandé (v5.8.17). |
| Haptics silencieux Android | Permission VIBRATE manquante | Vérifier `<uses-permission android:name="android.permission.VIBRATE"/>` dans `AndroidManifest.xml` + `npx cap sync`. |
| FABs visibles par-dessus la timeline | Sélecteur CSS `~` cassé | Utiliser `body.timeline-open .fab-stack` (classe togglée dans `TimelineComponent`). Ne jamais utiliser `#bottom-bar.is-open ~ .fab-stack`. |
| Styles inline dans un nouveau composant | Mauvaise pratique | Utiliser les classes CSS namespaced et les design tokens. Jamais de `style.cssText` ou `element.style.property = 'valeur'` hardcodée. |
| FlyTo envoie au mauvais endroit (2e tracé+) | Origin shift pendant animation | `state.isFlyingTo` bloque l'origin shift. Coords flyTo toujours recalculées depuis lat/lon brut avec `state.originTile` courant (v5.10.0). |
| Tracé GPX passe sous le terrain | Waypoints GPS espacés → courbe lisse coupe la montagne | `gpxDrapePoints()` densifie (×4) + clamp `max(terrainAlt, elevGPX) + 30m`. Re-draping à +3s/+6s post-import (v5.10.0). |
| Tracé GPX visible mais au mauvais endroit | `layer.points` stale après origin shift | `scene.ts` itère sur `state.gpxLayers` et applique le même offset à `layer.points` (v5.10.0). |
| Touch 1 doigt tourne au lieu de panner | TouchEvents interceptés au lieu de PointerEvents | Three.js r160 OrbitControls utilise PointerEvents. Intercepter `pointerdown` en capture + `controls.enabled = false` (v5.11.0). |
| Touch 1 doigt gauche/droite = rotation | `camera.matrix` stale lors du calcul des axes | Utiliser `camera.quaternion` (toujours à jour) et non `setFromMatrixColumn` pour obtenir right/fwd (v5.11.0). |
| Tilt 2 doigts impossible — rotation à la place | PointerEvents se déclenchent un pointeur à la fois → d2y=0 → toute accumulation per-pointeur (v2→v5) donne de faux positifs. isRotating tirée sur les 1ères frames avant que le lock s'active. | Détecter le tilt par le **placement initial des doigts** : si `|sin(angle)| < TILT_ANGLE` → `_tiltPreArmed=true`. Dès `|dy| > |dx| && spreadDelta < 1%` → `_tiltLocked=true`. Le lock s'active avant la 1ère frame de rotation possible (v6.3). |
| Zoom 2 doigts déclenche de la rotation | `ROT_DEADZONE` trop bas (0.003 rad) : le bruit d'angle pendant un pinch (~0.01 rad) dépasse le seuil | 3 guards sur `isRotating` : `absDAngle > ROT_DEADZONE` + `absDAngle > spreadDelta × 0.5` (angle doit dominer spread) + `absDAngle × 150 > |dy|` (angle doit dominer drift vertical) (v6.1). |
| Violation CSP `frame-ancestors` via `<meta>` | Directive valide uniquement en HTTP header | Supprimer `frame-ancestors` du `<meta>` CSP — ne fonctionne que côté serveur. |
| Violations CSP domaines cartographiques | `connect-src` incomplet | Ajouter : `https://*.overpass-api.de` ET `https://overpass-api.de` (wildcard ≠ domaine racine), `https://overpass.kumi.systems`, `https://api.open-meteo.com`, `https://cloud.maptiler.com` (img-src). |
| Stats de performance : toggle ON mais rien ne s'affiche | `toggle()` = flip, désync état↔panel au démarrage | Utiliser `setVisible(val)` (setter exact). `VRAMDashboard.init()` appelle `setVisible(state.SHOW_STATS)`. Le callback de `bindToggle` utilise `setVisible` (v5.11.0). |
| FPS counter absent au démarrage (VRAM table visible) | `VRAMDashboard.init()` s'exécute avant `initScene()` → `state.stats` est null → `stats.dom` skippé | `initScene()` appelle `state.vramPanel?.setVisible(state.SHOW_STATS)` après création Stats.js (v5.11). |
| `ENERGY_SAVER=false` malgré Phase 1 déployée | `loadSettings()` restaure l'ancienne valeur depuis localStorage avant `applyPreset()`. `detectBestPreset()` n'est exécuté que pour les nouveaux utilisateurs. | `applyPreset()` force `ENERGY_SAVER=true` sur mobile (sauf Ultra) indépendamment du localStorage (v5.11). |
| Timeline slider ne met pas à jour les ombres en temps réel | `needsUpdate = false` quand ni animation ni mouvement caméra | Setter `state.isInteractingWithUI = true` dans le handler `input` du slider + debounce 150ms → render loop reste actif (v5.11.0). |
| App Android tuée en background pendant REC | Pas de Foreground Service → Android recycle l'activité | `RecordingService.java` (foregroundServiceType=location) + `RecordingPlugin.java` Capacitor. `startRecordingService()` au début du REC, `stopRecordingService()` à la fin (v5.11.0). |
| Barre de statut Android visible en plein écran | `onResume()` trop tôt — Android reset les insets au focus | Utiliser `onWindowFocusChanged(hasFocus=true)` pour `WindowInsetsController.hide(statusBars())` (v5.11.0). |
| Eau/météo consomme du GPU même sans interaction | `needsUpdate` toujours vrai quand hydro/météo actifs | Accumulateurs `waterTimeAccum` + `weatherTimeAccum` — flag `*FrameDue` conditionne les renders (v5.11 Phase 2). |
| GPU idle à 45-48fps en idle sur Android WebView | `controls.update()` retourne `true` indéfiniment (floating-point non convergé) | Guard temporel 800ms sur `controls.update()` + `tiltAnimating` source séparée (v5.11.1). |
| Météo/pluie visible à 2-3fps malgré throttle 20fps | Accumulateurs `weatherTimeAccum` placés après le guard idle → s'incrémentent seulement sur les frames rendues → 4 renders pour atteindre 50ms | Déplacer `waterTimeAccum +=` et `weatherTimeAccum +=` **avant** tous les `return` guards dans `renderLoopFn` (v5.11.1). |
| Canvas vide au 1er démarrage Android (pas de cache) | `suntrail:sceneReady` dispatché avant que les tuiles soient chargées → setup-screen caché trop tôt | `#map-loading-overlay` affiché sur `sceneReady`, caché quand `isProcessingTiles → false` (v5.11.1). |
| Export GPX silencieux sur Android (fichier introuvable) | `link.click()` + `blob://` URL ignoré par WebView Android — le DownloadManager ne gère pas les blob URLs | `@capacitor/filesystem` → `Filesystem.writeFile(Directory.Documents)`. Sur web → `link.click()` conservé. Auto-export au STOP (v5.11.1). |
| DPR trop élevé pendant le pan/zoom mobile | GPU charge inutile en mouvement | Adaptive DPR : `controls 'start'` → `setPixelRatio(1.0)`, restauré après 200ms idle (v5.11 Phase 2). |
| Végétation projette des ombres sur mobile mid-range | `castShadow=true` par défaut sur tous les InstancedMesh | `iMesh.castShadow = state.VEGETATION_CAST_SHADOW` (false pour eco/balanced, v5.11 Phase 2). |
| Démarrage mobile 10-20s de blanc avant la carte | `setAnimationLoop` appelé APRÈS `await loadTerrain()` → canvas noir pendant le fetch réseau | Render loop démarré AVANT `await loadTerrain()` dans `initScene()`. Event `suntrail:sceneReady` dispatché → ui.ts cache le setup-screen. Double `loadTerrain()` supprimé de `startApp()`. Workers : 4 max mobile (v5.11). |
| Warning Vite `img/maps/... didn't resolve at build time` | Chemins `./img/maps/` relatifs dans des `style=""` inline de `index.html` | Remplacer par `/img/maps/` (chemin absolu — servi depuis `public/`). |
| Warning Vite `tileLoader dynamically imported but also statically` | `ConnectivitySheet` et `SettingsSheet` importent `tileLoader` en statique ET en dynamique pour `setPMTilesSource` | Ajouter `setPMTilesSource` à l'import statique existant, supprimer l'`await import()` redondant. |
| Toggle 2D→3D : tuiles plates et volantes en damier (LOD 14+) | Tuiles chargées en mode 2D sans élévation (`elevUrl=null` → canvas vide). Switch 3D = buildMesh avec canvas vide → moitié flat, moitié elevated | `fetchAs2D = zoom <= 10` uniquement dans `Tile.load()`. `rebuildActiveTiles()` invalide le cache des tuiles sans `pixelData` et les force à recharger (v5.11). |
| Toggle 2D↔3D : écran blanc pendant quelques secondes | `resetTerrain()` vide la scène + détruit les matériaux GPU (via `disposeObject`) → pool vide → recompilation shader + re-fetch réseau | Utiliser `rebuildActiveTiles()` au lieu de `resetTerrain()` pour les toggles mode. Meshes reconstruits en place via pattern `oldMesh` 500ms. Scène jamais vide (v5.11). |
| `apple-mobile-web-app-capable` warning dans Chrome Android | Meta tag Apple déprécié pour Chrome (toujours requis iOS Safari) | Ajouter `<meta name="mobile-web-app-capable" content="yes">` pour Chrome en plus du meta Apple (v5.11). |
| FlyTo ou GPS follow caméra à 20fps | `isFlyingTo`/`isFollowingUser` couplés à `controlsDirty` dans `needsUpdate` — or la RAF interne appelle déjà `controls.update()` → `controlsDirty=false` côté renderLoopFn | Déclarer `state.isFlyingTo` et `state.isFollowingUser` comme conditions **standalone** dans `needsUpdate` (non couplées à `controlsDirty`). Ajouter `!isFollowingUser` dans la guard `isIdleMode` (v5.11.1). |
| Bouton GPS suivi reste "actif" après flyTo vers un résultat de recherche | `flyTo()` cherchait l'élément `gps-follow-btn` (inexistant) → classe `active` jamais retirée | Corriger l'ID en `gps-main-btn` + retirer aussi la classe `following` dans le bloc de désactivation de `flyTo()` (v5.11.1). |
| Artefact ombre/lumière pulsante sur l'eau aux LOD 17-18 | Amplitude de vague ±3.7m — la vague dépasse la surface du terrain par en-dessous → shadow map artifacts de la géométrie eau vs terrain | Réduire l'amplitude shader à ±0.9m (w1: 2.5→0.6, w2: 1.2→0.3) et rehausser la base du mesh à `baseAlt + 2.0m` (vs +1.0m) pour garder la vague au-dessus du terrain à tout moment (v5.11.1). |
| Tuiles blanches intermittentes (0.5-1s) | `addToCache()` / `trimCache()` évincent la tuile FIFO la plus ancienne sans vérifier si elle est encore en scène → `texture.dispose()` supprime le handle WebGL → blanc jusqu'à re-upload (1-2 frames ; amplifié par throttling thermique à 5-15fps = 100-400ms) | `activeCacheKeys` Set<string> dans `tileCache.ts`. `terrain.ts` appelle `markCacheKeyActive(key)` après `buildMesh` et `markCacheKeyInactive(key)` dans `dispose()`. `addToCache()` et `trimCache()` cherchent la première entrée non-active avant fallback FIFO (v5.11.1). |
| Idle throttle 20fps désactivé après clic bouton GPS | `state.isFollowingUser = true` posé sur 1er clic GPS (centrage unique, `userLocation=null`). `centerOnUser()` retourne immédiatement mais `isIdleMode` reste `false` indéfiniment. | `isAlreadyCentered` utilise `gpsMainBtn.classList.contains('active')` (état visuel). `isFollowingUser=true` uniquement sur 2e clic (suivi continu réel, `startLocationTracking()`). (v5.11.1) |
| GPS follow à 120fps sur flagship (ENERGY_SAVER=false) | `isFollowingUser` exempté du throttle idle (correct) mais sans plafond propre → tourne à la fréquence max du display. GPS = 1Hz, lerp fluide à 30fps. | Guard `33ms` conditionnel `state.isFollowingUser && !state.ENERGY_SAVER` dans `renderLoopFn`, avant le guard isIdleMode. (v5.11.1) |
| App démarre en LOD 12 au lieu de LOD 6 | `camera.position` trop basse — `adaptiveLOD(dist)` retourne LOD > 6 si dist < 2 000 000 | Vérifier `scene.ts` : `camera.position.set(0, 2000000, 2000000)` donne dist ≈ 2 828 000 → LOD 6. Toute position plus basse remontera le LOD. (v5.11.2) |
| Bouton 2D non grisé au démarrage (LOD 6) | `syncLowZoomState()` absent ou non appelé en init dans `NavigationBar.render()` | Vérifier que `syncLowZoomState()` est appelé après `syncToggleVisual()` dans le bloc `modeToggle` de NavigationBar.ts. (v5.11.2) |
| Mode 3D restauré mais meshes encore plats après zoom-in LOD 10→11 | `rebuildActiveTiles()` non appelé lors de la restauration du mode | `syncLowZoomState()` doit appeler `rebuildActiveTiles() + updateVisibleTiles()` quand `previousMode !== state.IS_2D_MODE`. (v5.11.2) |
| Flash blanc lors des transitions de LOD (zoom in/out) | `updateVisibleTiles()` disposait immédiatement TOUTES les tuiles de l'ancien LOD en un seul frame → scène vide pendant le chargement du nouveau LOD | **Ghost tiles** : au changement de LOD (`zoom !== lastRenderedZoom`), les tuiles sortantes passent dans `fadingOutTiles` avec `tile.startFadeOut()`. Elles restent en scène avec fondu sortant 1.2s (`GHOST_FADE_MS`). `animateTiles()` gère leur cycle. **Ne JAMAIS appeler `tile.dispose()` immédiatement sur un changement de LOD**. (v5.13.9) |
| Chargement lent après changement de LOD (scroll ou zoom rapide) | Les fetches HTTP de l'ancien LOD continuent en background après `tile.dispose()` — saturent la bande passante, retardent les nouvelles tuiles | `Tile.activeTaskId` stocké au début de `load()`. `dispose()` appelle `cancelTileLoad(activeTaskId)` → `tileWorkerManager.cancelTile()` → message `{ type:'cancel' }` au worker → `AbortController.abort()` → fetch HTTP annulé. (v5.14.0) |
| GPS ne switche pas vers SwissTopo même en Suisse | `ui.ts` posait `state.hasManualSource = true` inconditionnellement dans le bloc `loadSettings()` → `autoSelectMapSource()` retournait via `if (state.hasManualSource) return` pour tout utilisateur avec settings sauvegardés | **Ne jamais mettre `hasManualSource = true` lors du chargement des settings.** Seules les sources non-auto-sélectionnables méritent ce flag : `satellite`, `ign`, `osm`. Inférer avec `const AUTO_SOURCES = ['swisstopo', 'opentopomap']; state.hasManualSource = !AUTO_SOURCES.includes(savedSettings.MAP_SOURCE)`. (v5.13.8) |
| Panel SOS bloqué sur "Localisation en cours..." (ouvert via TopStatusBar) | `resolveAndDisplay()` n'était attaché qu'au `#sos-btn-pill`. Le bouton `TopStatusBar` appelait `sheetManager.toggle('sos')` → template affiché, GPS jamais résolu | **Pattern EventBus pour toute logique déclenchée à l'ouverture d'un sheet** : `eventBus.on('sheetOpened', ({ id }) => { if (id === 'sos') void this.resolveAndDisplay(); })`. Tous les points d'entrée (`sheetManager.open/toggle`) déclenchent automatiquement la résolution. Ne jamais coupler la logique d'un sheet à un bouton spécifique. (v5.13.8) |

## 💰 Freemium & IAP (v5.12)

### Architecture Freemium
- **`state.isPro: boolean`** : Flag central. `false` par défaut. Persisté dans `localStorage` via clé séparée `suntrail_pro` (immunisée contre les resets de version `CURRENT_SETTINGS_VERSION`).
- **`saveProStatus()` / `loadProStatus()`** dans `state.ts`. `loadProStatus()` appelé en **premier** dans `initUI()`, avant `loadSettings()`.
- **`src/modules/iap.ts`** : Point central — `showUpgradePrompt(feature)` ouvre l'UpgradeSheet, `grantProAccess()` / `revokeProAccess()` modifient `state.isPro` + persistent.
- **`src/modules/iapService.ts`** : Service RevenueCat (`@revenuecat/purchases-capacitor` v12.3.0). `iapService.initialize()` appelé en fire-and-forget dans `initUI()`. Entitlement : `'SunTrail 3D Pro'` (avec espaces — identifiant exact du dashboard RevenueCat). No-op sur Web/PWA.
- **Clé bundlée** : `VITE_REVENUECAT_KEY` dans `.env` (hors Git). `VITE_MAPTILER_KEY` idem.

### Feature Gates (où vérifier `state.isPro`)
| Feature | Fichier | Guard |
|---|---|---|
| LOD > 14 | `performance.ts` → `applyPreset()` | `if (!state.isPro && state.MAX_ALLOWED_ZOOM > 14)` |
| Couche Satellite | `LayersSheet.ts` → click handler | `if (source === 'satellite' && !state.isPro)` |
| Multi-tracés GPX (> 1) | `TrackSheet.ts` → `handleGPX()` | `if (!state.isPro && state.gpxLayers.length >= 1)` |
| Export GPX | `TrackSheet.ts` → `exportRecordedGPX()` | `if (!state.isPro)` |
| REC > 30 min | `TrackSheet.ts` → recBtn click | `setTimeout(REC_FREE_LIMIT_MS)` si `!state.isPro` |

### Acceptance Wall (`src/modules/acceptanceWall.ts`)
- Overlay bloquant, même pattern que `gpsDisclosure.ts`.
- Stocké : `suntrail_acceptance_v1` (incrémenter la version pour forcer un re-affichage).
- Affiché 420ms après disparition du setup screen (dans le handler `suntrail:sceneReady`).
- Pas de bouton "Refuser" — l'utilisateur doit accepter pour continuer.

### Setup Screen & Clé MapTiler (v5.12)
- **Auto-skip** : Si `VITE_MAPTILER_KEY` est défini dans `.env`, `state.MK` est peuplé dans `initUI()` et le setup screen est masqué — l'app démarre directement.
- **Fallback** : Si `state.MK` est vide (dev sans `.env`, PWA), le setup screen s'affiche pour saisie manuelle.
- **Clé utilisateur** : Une clé saisie manuellement (via ConnectivitySheet) prend priorité sur la clé bundlée.
- **⚠️ Ordre d'init (v5.12.6)** : `launchScene()` doit être appelé **après** toute l'hydratation des composants dans `initUI()`. Si appelé avant, `startApp()` ne trouve pas `#widgets-container` dans le DOM → `display:none` jamais effacé → widgets invisibles.

### REC GPS — Architecture (v5.12.8)
- **Séparation save/export** : `TrackSheet.ts` possède 3 méthodes distinctes :
  - `saveRecordedGPXInternal()` — **sans gate Pro** — parse GPX → `addGPXLayer()`. Toujours appelé au STOP et à l'auto-stop.
  - `downloadRecordedGPX()` — I/O filesystem uniquement, pas de gate (l'appelant vérifie `isPro`).
  - `exportRecordedGPX()` — wrapper Pro-only pour les appels externes (bouton manuel).
- **⚠️ RÈGLE CRITIQUE** : Ne jamais mettre un gate `isPro` dans la sauvegarde automatique — l'utilisateur perdrait ses données.
- **Permission GPS** : Le handler REC vérifie `requestGPSDisclosure()` → `Geolocation.checkPermissions()` → `requestPermissions()` avant tout démarrage.
- **Persistance filesystem (C1)** : `foregroundService.ts` — `updateRecordingSnapshot(count, points[])` écrit les coordonnées complètes dans `Directory.Cache` toutes les 30 pts ou 60s. `getPersistedRecordingPoints()` restaure après kill Android.

### Mode Testeur (v5.12.9)
- **7 taps sur `#settings-version`** dans Réglages Avancés → toggle `state.isPro` en RAM (non persisté).
- **Jamais `saveProStatus()`** dans ce flow — non persisté en localStorage par design.
- Taps 4-6 : haptic light + clignotement. Tap 7 : haptic success + toast + couleur accent sur le label version.
- Reset au redémarrage (RAM uniquement).

### Timeline 2D Guard (v5.12.7)
- **Guard** : `TimelineComponent.ts` utilise `state.IS_2D_MODE` (pas `body.classList.contains('mode-2d')`) pour vérifier le mode 2D au clic.
- **NavigationBar** : `syncLowZoomState()` ajoute toujours `body.mode-2d` quand ZOOM ≤ 10, même si `IS_2D_MODE` était déjà `true` depuis localStorage. L'ancien code ne l'ajoutait qu'en cas de changement `false→true`, ce qui laissait la classe absente au démarrage.

### Build Android (Sprint 7)
- **JAVA_HOME** : `C:/Program Files/Android/Android Studio/jbr` (Android Studio bundled JDK).
- **Keystore** : `android/suntrail.keystore` (hors Git). `android/keystore.properties` (hors Git, rempli avec mot de passe réel).
- **Build release** : `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease --no-daemon` depuis `android/`.
- **CI/CD** : `.github/workflows/release.yml` — déclenché sur `git tag v*.*.*`. Nécessite 6 GitHub Secrets : `KEYSTORE_BASE64`, `STORE_PASSWORD`, `KEY_PASSWORD`, `KEY_ALIAS`, `VITE_MAPTILER_KEY`, `VITE_REVENUECAT_KEY`.
- **versionCode** : Incrémenter à chaque upload Play Console. **Toujours consulter le tableau dans `docs/RELEASE.md`** pour la dernière valeur. Dernière valeur : **521**.
- **versionName** : Version sémantique lisible (ex: `5.14.0`), jamais de suffixe dans build.gradle. Le tag git peut avoir un suffixe (`v5.12.9-ct`) mais pas le versionName.
- **CI trigger** : Tag format `v*.*.*` obligatoire (avec `v` au début). Suffixes autorisés. Sans `v` = pas de CI.
- **Play Store** : App `com.suntrail.threejs` — **Closed Testing soumis** (versionCode 519). Dernière version en prod : v5.13.0 (versionCode 520). Voir `docs/RELEASE.md` pour le workflow complet.

## 💰 Monétisation Sprint 8 (v5.14.0)

### Architecture IAP RevenueCat
- **SDK key** : `goog_` prefix = clé Google Play production (dans `.env` → `VITE_REVENUECAT_KEY`). Côté code dans `iapService.ts` → `Purchases.configure({ apiKey: SDK_KEY })`.
- **Service Account JSON** : Lié dans RevenueCat → App Settings → Google Play. Permet la validation serveur des achats. Sans lui, `getOfferings()` échoue avec `ConfigurationError` mais le customer est quand même créé.
- **Customer anonyme** : RevenueCat crée un customer dès le premier démarrage natif. ID visible dans logcat : `$RCAnonymousID:xxxxx`. Retrouvable via recherche dans RevenueCat → Customers.
- **Grant manuel** : RevenueCat → Customers → recherche par anonymous ID → Grant Entitlement → `SunTrail 3D Pro`.
- **Customers vide** : La liste ne montre que les users avec achats actifs. Rechercher l'ID explicitement pour un user gratuit.

### Gate LOD Pro (v5.14.0) — Architecture
- **⚠️ RÈGLE CRITIQUE** : `MAX_ALLOWED_ZOOM` reflète toujours la valeur native du preset (14 eco / 16 balanced / 18 perf+ultra). **Ne jamais l'écraser à 14 pour les gratuits.**
- Le gate LOD gratuit est appliqué dynamiquement dans `scene.ts` et `terrain.ts` : `effectiveMaxZoom = state.isPro ? MAX_ALLOWED_ZOOM : Math.min(MAX_ALLOWED_ZOOM, 14)`.
- Cela garantit que tout changement de `state.isPro` (tester, toggle, IAP, localStorage) est immédiatement effectif sans re-appliquer le preset.
- **Ancien bug (pré-v5.14)** : `applyPreset()` écrasait `MAX_ALLOWED_ZOOM = 14` pour les gratuits → le mode testeur ne débloquait pas le LOD.

### Features Pro Sprint 8
| Feature | Fichier | Gate |
|---|---|---|
| Calendrier solaire (dates passées/futures) | `TimelineComponent.ts` | `if (!state.isPro && !isToday)` → reset + `showUpgradePrompt('solar_calendar')` |
| Inclinomètre numérique | `InclinometerWidget.ts` | Visible si `state.isPro && state.ZOOM >= 13` |
| REC illimité (stats avancées Pro) | `TrackSheet.ts` | Limite 30min supprimée ; upsell post-session si `!state.isPro` |
| Météo jours 2-3 | `ExpertSheets.ts` | `opacity:0.38` + badge PRO + `showUpgradePrompt('weather_extended')` |

## 🚀 Commandes de Maintenance
- `npm test` : Lancer la suite de 190 tests unitaires (Vitest).
- `npm run check` : Vérifier le typage TypeScript (strict).
- `npm run deploy` : Suite complète avant livraison mobile.
- Build AAB release : `JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease --no-daemon` (depuis `android/`).
