# SunTrail - Base de Connaissance (v5.11.0-wip)

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

### Moteur de Tuiles & Performance (`terrain.ts` / `tileLoader.ts`)
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
- **Adaptive DPR (v5.11 Phase 2)** : Sur mobile, `controls 'start'` → `renderer.setPixelRatio(1.0)`. `controls 'end'` + 200ms → restaure `state.PIXEL_RATIO_LIMIT`. Timer effacé si nouveau 'start' avant expiration. Conditionné à `isMobileDevice`. Invisible pour l'utilisateur.
- **VEGETATION_CAST_SHADOW (v5.11 Phase 2)** : Flag dans `PerformanceSettings` + `state`. `false` pour eco/balanced (économise ~18 draw calls shadow pass). `true` pour performance/ultra. Appliqué dans `vegetation.ts` : `iMesh.castShadow = state.VEGETATION_CAST_SHADOW`.
- **ENERGY_SAVER par tier (v5.11)** : eco/balanced → `true` par défaut (mid-range, autonomie prioritaire). **performance/ultra → `false` par défaut** (flagship, 60fps — l'utilisateur a payé pour les perfs). Le toggle manuel dans Réglages Avancés permet à chaque utilisateur d'ajuster. Exception dans `applyPreset()` : eco/balanced mobile force toujours `true` même si localStorage avait `false` (utilisateurs existants).
- **IS_2D_MODE (v5.11)** : `state.IS_2D_MODE: boolean` — flag indépendant du preset. Contrôle l'affichage (mesh plat vs élévation) sans affecter ENERGY_SAVER ni la qualité 3D. Persisté en localStorage. Le preset `eco` met `IS_2D_MODE=true` dans `applyPreset()`. Les tuiles sont TOUJOURS fetchées avec élévation pour LOD > 10 (`fetchAs2D = zoom <= 10`), même en mode 2D — garantit un switch 2D→3D instantané sans re-fetch.
- **Toggle 2D/3D (v5.11)** : Bouton en première position de la nav bar bas. `rebuildActiveTiles()` (terrain.ts) reconstruit les meshes EN PLACE sans vider la scène. **Ne jamais appeler `resetTerrain()` pour un toggle 2D/3D** — `dispose()` détruit les matériaux GPU au lieu de les rendre au `materialPool` → pool vide → recompilation shader → damier noir/clair. Le switch 2D→3D détecte les tuiles sans élévation valide (`!pixelData && zoom > 10`), invalide leur cache et les recharge.
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
- **Cinematic flyTo** : Trajectoire en "cloche" (parabolique) avec interpolation `easeInOutCubic` et vérification anti-collision en temps realtime (v4.6.0).
- **Adaptive Zoom (v5.8.6)** : Logique de saut intelligent de LOD lors des téléportations ou des déplacements rapides. Élimine le délai de chargement des paliers intermédiaires pour une netteté immédiate à l'arrivée.
- **Tilt Parabola** : L'inclinaison maximale de la caméra est dynamique ; elle atteint son pic au LOD 14 et se redresse automatiquement vers le sol à haute altitude pour masquer l'horizon vide (v4.5.56).
- **Navigation Tactile Google Earth (v5.11.0)** : `src/modules/touchControls.ts` — module autonome interceptant les **PointerEvents** (pas TouchEvents) en phase capture avant OrbitControls. Stratégie : désactive `controls.enabled = false` au premier contact, réactive à la fin. Gestes : 1 doigt = pan (avec inertie), 2 doigts centre-X = pan, 2 doigts centre-Y = tilt (phi), spread = zoom, angle = rotation azimut. Paramètres ajustables en tête de fichier : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE`. **Erreur classique à NE PAS reproduire** : intercepter TouchEvents au lieu de PointerEvents — Three.js r160 OrbitControls utilise exclusivement les PointerEvents.

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
| Violation CSP `frame-ancestors` via `<meta>` | Directive valide uniquement en HTTP header | Supprimer `frame-ancestors` du `<meta>` CSP — ne fonctionne que côté serveur. |
| Violations CSP domaines cartographiques | `connect-src` incomplet | Ajouter : `https://*.overpass-api.de` ET `https://overpass-api.de` (wildcard ≠ domaine racine), `https://overpass.kumi.systems`, `https://api.open-meteo.com`, `https://cloud.maptiler.com` (img-src). |
| Stats de performance : toggle ON mais rien ne s'affiche | `toggle()` = flip, désync état↔panel au démarrage | Utiliser `setVisible(val)` (setter exact). `VRAMDashboard.init()` appelle `setVisible(state.SHOW_STATS)`. Le callback de `bindToggle` utilise `setVisible` (v5.11.0). |
| FPS counter absent au démarrage (VRAM table visible) | `VRAMDashboard.init()` s'exécute avant `initScene()` → `state.stats` est null → `stats.dom` skippé | `initScene()` appelle `state.vramPanel?.setVisible(state.SHOW_STATS)` après création Stats.js (v5.11). |
| `ENERGY_SAVER=false` malgré Phase 1 déployée | `loadSettings()` restaure l'ancienne valeur depuis localStorage avant `applyPreset()`. `detectBestPreset()` n'est exécuté que pour les nouveaux utilisateurs. | `applyPreset()` force `ENERGY_SAVER=true` sur mobile (sauf Ultra) indépendamment du localStorage (v5.11). |
| Timeline slider ne met pas à jour les ombres en temps réel | `needsUpdate = false` quand ni animation ni mouvement caméra | Setter `state.isInteractingWithUI = true` dans le handler `input` du slider + debounce 150ms → render loop reste actif (v5.11.0). |
| App Android tuée en background pendant REC | Pas de Foreground Service → Android recycle l'activité | `RecordingService.java` (foregroundServiceType=location) + `RecordingPlugin.java` Capacitor. `startRecordingService()` au début du REC, `stopRecordingService()` à la fin (v5.11.0). |
| Barre de statut Android visible en plein écran | `onResume()` trop tôt — Android reset les insets au focus | Utiliser `onWindowFocusChanged(hasFocus=true)` pour `WindowInsetsController.hide(statusBars())` (v5.11.0). |
| Eau/météo consomme du GPU même sans interaction | `needsUpdate` toujours vrai quand hydro/météo actifs | Accumulateurs `waterTimeAccum` + `weatherTimeAccum` — flag `*FrameDue` conditionne les renders (v5.11 Phase 2). |
| DPR trop élevé pendant le pan/zoom mobile | GPU charge inutile en mouvement | Adaptive DPR : `controls 'start'` → `setPixelRatio(1.0)`, restauré après 200ms idle (v5.11 Phase 2). |
| Végétation projette des ombres sur mobile mid-range | `castShadow=true` par défaut sur tous les InstancedMesh | `iMesh.castShadow = state.VEGETATION_CAST_SHADOW` (false pour eco/balanced, v5.11 Phase 2). |
| Démarrage mobile 10-20s de blanc avant la carte | `setAnimationLoop` appelé APRÈS `await loadTerrain()` → canvas noir pendant le fetch réseau | Render loop démarré AVANT `await loadTerrain()` dans `initScene()`. Event `suntrail:sceneReady` dispatché → ui.ts cache le setup-screen. Double `loadTerrain()` supprimé de `startApp()`. Workers : 4 max mobile (v5.11). |
| Warning Vite `img/maps/... didn't resolve at build time` | Chemins `./img/maps/` relatifs dans des `style=""` inline de `index.html` | Remplacer par `/img/maps/` (chemin absolu — servi depuis `public/`). |
| Warning Vite `tileLoader dynamically imported but also statically` | `ConnectivitySheet` et `SettingsSheet` importent `tileLoader` en statique ET en dynamique pour `setPMTilesSource` | Ajouter `setPMTilesSource` à l'import statique existant, supprimer l'`await import()` redondant. |
| Toggle 2D→3D : tuiles plates et volantes en damier (LOD 14+) | Tuiles chargées en mode 2D sans élévation (`elevUrl=null` → canvas vide). Switch 3D = buildMesh avec canvas vide → moitié flat, moitié elevated | `fetchAs2D = zoom <= 10` uniquement dans `Tile.load()`. `rebuildActiveTiles()` invalide le cache des tuiles sans `pixelData` et les force à recharger (v5.11). |
| Toggle 2D↔3D : écran blanc pendant quelques secondes | `resetTerrain()` vide la scène + détruit les matériaux GPU (via `disposeObject`) → pool vide → recompilation shader + re-fetch réseau | Utiliser `rebuildActiveTiles()` au lieu de `resetTerrain()` pour les toggles mode. Meshes reconstruits en place via pattern `oldMesh` 500ms. Scène jamais vide (v5.11). |
| `apple-mobile-web-app-capable` warning dans Chrome Android | Meta tag Apple déprécié pour Chrome (toujours requis iOS Safari) | Ajouter `<meta name="mobile-web-app-capable" content="yes">` pour Chrome en plus du meta Apple (v5.11). |

## 🚀 Commandes de Maintenance
- `npm test` : Lancer la suite de 188 tests unitaires (Vitest).
- `npm run check` : Vérifier le typage TypeScript (strict).
- `npm run deploy` : Suite complète avant livraison mobile.
