## [5.51.0] - 2026-05-02

### Changed

- **UX planificateur "zero-mode"** : Suppression du mode planificateur et de l'onglet "Itinéraire". Appui long 500ms sur la carte = waypoint posé directement, sans activation préalable. Feedback visuel SVG (cercle qui se remplit). La route se calcule automatiquement (debounce 800ms) dès 2 waypoints.
- **Markers 3D cliquables** : Chaque waypoint est représenté par un sprite Three.js orange numéroté (●1 ●2…) placé sur le terrain. Un tap dessus le supprime.
- **Route bar simplifiée** : Boutons [⚙ Réglages] + [✕ Effacer] — plus de [+ Tap] ni [▶ Calculer]. La barre se masque automatiquement quand un menu est ouvert.
- **Panel réglages inline** : Profil + boucle sur une seule ligne. Liste des waypoints avec boutons ↑↓✕ pour réorganiser ou supprimer. Clé ORS toujours accessible.
- **Trace unique** : `computeRoute` remplace la trace précédente au lieu d'en ajouter une nouvelle — plus de doublons dans "Parcours".

### Added

- `src/modules/routeManager.ts` — module centralisé : markers 3D, auto-compute, gestion barre

### Removed

- `RoutePlannerSheet.ts`, `route-planner.html` — remplacés par `routeManager.ts`
- `state.isPlacingWaypoint`, `state.isRoutePlannerActive` — notion de "mode" supprimée

## [5.50.0] - 2026-05-01

### Added
- **Planificateur d'itinéraire mondial (GRATUIT)** : Nouvel onglet "Itinéraire" dans la navbar. Moteur de routing OpenRouteService `foot-hiking` (avec clé gratuite) + fallback OSRM `foot` (sans clé). Profils : Randonnée, Marche, Vélo, VTT.
- **Waypoints clic carte** : Ajout par clic sur la carte (mode placement), suppression, inversion, boucle retour au départ. Géocodage inverse automatique des waypoints via Nominatim.
- **Rendu 3D automatique** : Réutilisation du pipeline GPX existant (`gpxLayers.addGPXLayer`) — tracé TubeGeometry drappé sur le terrain, stats distance/D+/D-/temps Munter, profil d'élévation.
- **Boucle (↻)** : Option checkbox pour créer un itinéraire aller-retour (A → B → A).
- **Clé ORS** : Saisie optionnelle dans le panel. Stockée dans localStorage. Sans clé, routage via OSRM gratuit.
- **Tests** : 34 nouveaux tests (routingService 27, RoutePlannerSheet 6, state 5 mis à jour).

### Fixed
- **UI Planificateur** : CSS complet dans le thème de l'app (design tokens, glass-morphism, accent).
- **NaN dénivelé** : Correction du parsing ORS — `ascent`/`descent` lus depuis `properties.*` au lieu de `properties.summary.*`.
- **Clic carte bloqué** : L'overlay du sheet n'intercepte plus le mode placement — le sheet se ferme temporairement pendant le clic, se rouvre après.

## [5.40.40] - 2026-04-30

### Added
- **GPX Track : épaisseur zoom-based Komoot** : La trace s'agrandit en dézoomant et s'amincit en zoomant, via formule exponentielle `base × 2^(18-ZOOM)`, cap à 200m (import) / 250m (enregistrement). Fonction partagée `computeTrackThickness()` dans `gpxLayers.ts`.
- **Rebuild épaisseur sur mobile** : `touchControls` dispatche désormais `controls.dispatchEvent({ type: 'end' })` quand le doigt se lève → le `controls.end` handler recalcule le zoom et reconstruit les tracés à la bonne épaisseur.
- **Materials cachés** : Matériau du tracé enregistré mis en cache (`getRecordedMaterial()`) — plus de `new Material` à chaque mise à jour GPS.

### Fixed
- **STOP/Save bloqué sur A53 STD** : Le géocodage réseau (`getPlaceName`) ne bloque plus l'affichage du modal d'enregistrement. Le nom fallback (date locale) s'affiche immédiatement, le géocodage tourne en arrière-plan. Ajout d'un `try/catch` global pour éviter l'UI freeze.
- **Profil d'élévation : touch inactif sur mobile** : Ajout `touch-action:none` sur le conteneur du profil et exclusion de `isInteractingWithUI` du deep sleep — le curseur suit maintenant le doigt en continu.
- **Profil d'élévation : performance** : Recherche binaire O(log n) au lieu de linéaire O(n) dans `onMove`.
- **Rebuild GPX robuste** : `_doUpdateAllGPXMeshes` utilise `for...of` + `try/catch` par layer (`.map()` précédent faisait échouer tous les layers si un seul plantait).
- **Surface offset GPX** : `GPX_SURFACE_OFFSET = 12` utilisé partout (`drapeToTerrain`, `addGPXLayer`, rebuild) au lieu du 30 hardcodé qui causait du Z-fighting.
- **E2E Search** : Correction du bug où le route handler Playwright interceptait `geocodingService.ts` (Vite ajoute `?t=...`), résolu en utilisant `pathname` au lieu de `href` pour la détection `.ts/.js`.
- **Dette technique** : `gpxDrapePoints` supprimé (31 lignes en doublon de `drapeToTerrain` de `analysis.ts`). Import `getAltitudeAt` retiré de `gpxLayers.ts`.

### Housekeeping
- **.gitignore** : Nettoyé des caractères binaires corrompus, ajout `coverage/`.
- **Artefacts supprimés du tracking git** : `coverage/`, `playwright-report/`, `test-results/` retirés du suivi de version.

## [5.40.39] - 2026-04-30

### Fixed
- **Pentes monde entier** : Suppression de la double correction de latitude dans le shader GLSL (`Tile.ts`). La normal map était déjà corrigée dans le worker (`tileWorker.ts` via `pixelSize × cos(lat)`), mais le shader multipliait une seconde fois `normal.y` par `latFactor`. Résultat : une pente réelle de 30° en Suisse (46°N) s'affichait à ~40°. L'erreur augmentait avec la latitude. Fix : suppression de `* uLatFactor` dans les shaders vertex et fragment.

## [5.40.37] - 2026-04-30

### Added
- **Tests (Audit)** : +54 tests unitaires couvrant `gpxService`, `acceptanceWall`, `gpsDisclosure`, `onboardingTutorial`, `workerManager`.
- **Couverture** : Passage de 47.5% à ~51% de lines coverage.

### Fixed
- **Warning Vitest** : `vi.mock("./scene")` déplacé au top-level dans `init_integrity.test.ts` (prépare compatibilité future).
- **E2E Flaky Chromium** : 4 tests E2E stabilisés (weather sheet, connectivity sheet, GPX toggle, trial) via `waitForTimeout`, `scrollIntoViewIfNeeded`, timeout explicite.

### Chore
- **TypeScript strict** : 20 erreurs TS `unused-vars` éliminées dans les nouveaux tests.
- **Docs** : Mise à jour CLAUDE.md.

## [5.40.36] - 2026-04-30

### Fixed
- **Android Notifications** : Le bouton "Arrêter REC" de la notification ne fonctionnait pas sur Galaxy A53 (One UI). Forçage d'une réinscription systématique du BroadcastReceiver à chaque `onStartCommand()`.
- **Profil GPX** : La croix de fermeture du panneau "Profil d'élévation & Pentes" était inactive. Ajout du handler `click` manquant.
- **Profil 2D** : Le point GPX était saccadé en mode 2D (render loop en idle). Ajout de `isInteractingWithUI = true` pendant l'interaction souris/touch sur le graphique.
- **Profil (Listeners)** : Les event listeners `pointermove/pointerdown/...` s'accumulaient à chaque ouverture du profil. Ajout d'un flag guard `profileInteractionsAttached`.

## [5.40.35] - 2026-04-30

### Fixed
- **Worker Timeouts** : Timeout passé de 15s à 45s pour éviter les faux positifs sur les grandes files d'attente (ultra preset, 625 tuiles).
- **Worker Load Balancing** : Ajout du least-loaded scheduling avec cap à 4 tâches concurrentes par worker + file d'attente. Évite la saturation intra-worker et les timeouts en cascade.
- **Vegetation Crash** : Race condition corrigée dans `createForestForTile()` — pendant `await landcoverPromise`, `dispose()` pouvait nullifier `pixelData`. Double null-guard ajouté.
- **Render Loop** : Recompute du `sharedFrustum` déplacé dans le bloc `needsUpdate` (plus exécuté pendant le deep sleep).

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Added
- **Inclinom├¿tre R├®actif** : Distance d'anticipation r├®duite ├á 8m pour une lecture imm├®diate et fid├¿le en mode suivi.
- **Support Rotation GPX** : Redessin automatique du profil d'├®l├®vation GPX lors du basculement portrait/paysage pour assurer une visibilit├® compl├¿te du trac├®.

### Fixed
- **Inclinom├¿tre (Crash)** : Correction d'une erreur de r├®f├®rence sur `ANTICIPATION_DISTANCE_M`.
- **UI Inclinom├¿tre** : Harmonisation de l'affichage (tout en %) et persistance du panneau de d├®tail.
- **Positionnement UI** : D├®calage intelligent de 120px au-dessus de la barre de temps.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Fixed
- **Swiss 3D Buildings** : Passage au Zoom 14 pour les donn├®es vectorielles SwissTopo, garantissant des empreintes de b├ótiments individuelles pr├®cises et corrigeant les effets de "blocs urbains" g├®n├®ralis├®s.
- **Building Density** : Correction du bug de quota de b├ótiments et augmentation de la limite ├á 500 objets par tuile pour les zones denses.
- **Hydrology & Vegetation** : Alignement de la pr├®cision vectorielle sur le Zoom 14 en Suisse pour une coh├®rence g├®ographique totale.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Fixed
- **Recorded Track Cleanup** : Correction du bug o├╣ la trace rouge (REC) persistait apr├¿s avoir ├®t├® effac├®e.
- **Altitude Consistency** : Harmonisation de l'altitude de survol (surfaceOffset) ├á 12m pour tous les trac├®s (GPX et REC) dans tous les modes pour ├®viter les disparit├®s de visibilit├® 2D/3D.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Fixed
- **Mode Toggle Correction** : Suppression syst├®matique des objets 3D (Signalisation, B├ótiments, For├¬ts) lors du passage 2D/3D pour garantir leur plaquage imm├®diat ├á la bonne altitude.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Changed
- **Architectural Stabilization** : Finalisation du d├®coupage modulaire (GPX, Init, Environment) pour la v6.0.
- **Improved Testing** : Correction des types de tests et extension de la couverture ├á 609 tests unitaires.
- **Performance** : Optimisation de la VRAM via des mat├®riaux partag├®s pour les trac├®s GPX.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Added
- **Extended Unit Testing** :
  - `appInit.test.ts` : Validation de la s├®quence orchestr├®e de d├®marrage.
  - `gpxLayers.test.ts` : Test de la simplification RDP adaptative selon les presets de performance.
  - `ui.test.ts` : Refonte pour s'aligner sur la nouvelle architecture modulaire.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Added
- **Integrity Testing** : Introduction de `environment.test.ts` pour valider la structure du graphe de sc├¿ne (Lights, Fog, Sky). Pr├®vient les r├®gressions visuelles silencieuses lors des refactorisations 3D.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Fixed
- **3D Visuals Fix** : Restauration de la luminosit├® solaire et des ombres port├®es suite ├á la modularisation de l'environnement.
  - Correction de l'ajout de la lumi├¿re directionnelle et de sa cible ├á la sc├¿ne 3D.
  - Harmonisation de l'activation du ShadowMap avec l'├®tat global.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Changed
- **Engine Modularization** :
  - **Environment Service** : Extraction de la gestion de l'atmosph├¿re (Ciel, Brouillard dynamique, Lumi├¿res) de `scene.ts` vers un nouveau module `environment.ts`.
  - **Scene Cleanup** : R├®duction de la complexit├® de `scene.ts`, recentr├® exclusivement sur l'orchestration du rendu et la physique de la cam├®ra.

## [5.40.32] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added uHasNormalMap check in fragment shader to ensure slopes only display when data is ready.

## [5.40.31] - 2026-04-29

### Fixed
- UI/UX: Fixed transient red flashes on tiles during rapid zoom/dezoom when slope shading is enabled.
- Rendering: Added `uHasNormalMap` check in fragment shader to ensure slopes only display when data is ready.

## [5.40.30] - 2026-04-29

### Fixed
- Precision: Fixed 30┬░ slope shading accuracy using latitude correction (correcting ~30% error in Alps).
- Rendu: Slope shading now works in 2D mode (Pixel-Perfect Fragment Shader).
- Performance: Fixed dark tiles at low zoom levels by restoring optimized material selection.
- 3D/Inclinometer: Fixed inclinometer accuracy using latitude correction; restored perfect 3D tree/house positioning.
- Stability: All tests pass (613/613).

## [5.40.29] - 2026-04-29
### Changed
- **Architecture Refactoring (v6.0 Preparation)** :
  - **Modular GPX Engine** : Extraction de toute la logique de gestion des trac├®s GPX (rendu 3D, mat├®riaux partag├®s, simplification RDP adaptative) de `terrain.ts` vers un nouveau module `gpxLayers.ts`.
  - **App Orchestration** : Cr├®ation de `appInit.ts` pour centraliser la s├®quence d'initialisation complexe (Services, UI, Sc├¿ne), transformant `ui.ts` en un point d'entr├®e l├®ger.
  - **Cohesion & SRP** : R├®duction de la dette technique en appliquant le principe de responsabilit├® unique (SRP) aux modules fondamentaux du moteur.

### Fixed
- **Test Stability** : Adaptation de la suite de tests (604 tests) pour valider la nouvelle structure d'imports et les espions de modules.

## [5.40.18] - 2026-04-27
### Fixed
- **Zero-Allocation Finalization** : Utilisation effective de l'objet `Date` partag├® dans la boucle d'animation pour supprimer toute allocation d'objet temporelle.
- **Test Integrity** : Mise ├á jour de la suite de tests unitaires pour valider les nouveaux presets de performance (Balanced @ 64 segments).

### Documentation
- **Refonte identit├® visuelle** : Mise en avant du moteur d'ombre unique (projection sur for├¬ts et b├ótiments 3D).
- **Pr├®cision g├®ographique** : Clarification sur la disponibilit├® variable des donn├®es HD selon les pays et l'├®volution constante du projet.

## [5.40.17] - 2026-04-27
### Changed
- **Optimisation Math├®matique Majeure** : Centralisation et mise en cache des calculs de puissances de 2 et des projections Web Mercator (`geo.ts`), r├®duisant la charge CPU globale.
- **Zero-Allocation Pattern** : R├®utilisation d'objets statiques (`Matrix4`, `Date`) dans la boucle de rendu pour minimiser le Garbage Collection et ├®liminer les micro-saccades sur mobile.
- **Calibration des Presets** : Optimisation du preset *Balanced* (r├®solution 64 segments, range 5) pour un meilleur compromis fluidit├®/profondeur de champ.
- **Worker Performance** : Refonte de la g├®n├®ration des Normal Maps via des op├®rateurs binaires (`bitwise`) et un d├®codage RGB inline.

### Fixed
- **Stabilit├®** : Correction des imports circulaires et des r├®f├®rences manquantes introduites lors du refactoring g├®omath├®matique.
- **Pr├®cision** : Remplacement des approximations euclidiennes par la formule de Haversine pour le rafra├«chissement m├®t├®o.

## [5.39.2] - 2026-04-25
### Added
- **Signal├®tique Enrichie** : Introduction d'ic├┤nes diff├®renci├®es pour les belv├®d├¿res (­ƒö¡), les abris (­ƒÅá) et les points d'information (i).
- **Moteur de Textures** : Syst├¿me de g├®n├®ration de textures ├á la demande par cat├®gorie de POI avec mise en cache optimis├®e.
- **Stabilit├® de Structure** : Finalisation du test d'int├®grit├® de l'initialisation pour pr├®venir les r├®gressions HTML.

## [5.39.1] - 2026-04-25
### Fixed
- **UI Stability** : Restauration de la structure HTML s├®mantique (<main>, <header>) pour corriger le rendu CSS et le centrage de l'├®cran de chargement.
- **Initialization Fix** : S├®curisation de updatePerformanceUI pour ├®viter les crashs JS si les ├®l├®ments du DOM ne sont pas encore hydrat├®s.
- **Assets Restoration** : R├®tablissement de l'ic├┤ne 2D/3D originale et masquage automatique des infos de diagnostic technique.

## [5.39.0] - 2026-04-25
### Changed
- **Refactor index.html** : Nettoyage massif du fichier HTML principal (-90% de lignes). Extraction de 14 templates UI vers des fichiers .html individuels charg├®s ├á la demande via Vite.
- **Architecture UI** : ├ëvolution de BaseComponent pour supporter l'injection dynamique de templates HTML via les imports ?raw.

## [5.38.5] - 2026-04-25
### Fixed
- **UI Collision** : Repositionnement automatique de l'inclinom├¿tre en haut de l'├®cran lors de l'ouverture de la barre temporelle (Timeline) pour ├®viter les chevauchements.
- **Stabilit├® de Position** : L'inclinom├¿tre m├®morise d├®sormais les d├®placements manuels par l'utilisateur et d├®sactive l'ajustement auto dans ce cas.

## [5.38.4] - 2026-04-25
### Added
- **Migration PBF Totale (Sommets, POIs, B├ótiments)** : Suppression d├®finitive de l'API Overpass pour ├®liminer les erreurs CORS/406 et fiabiliser l'affichage.
- **Unification du Cache** : Passage ├á l'API Cache du navigateur pour les POIs et Sommets (plus performant et persistant).
- **Optimisation POI (v5.38.4)** : Ajustement de l'altitude automatique en mode 2D (fix parallax) et d├®tection ├®largie de la signal├®tique randonn├®e.

### Improved
- **S├®curit├® du Typage** : Renforcement du typage dans landcover.ts avec des interfaces strictes pour les donn├®es vectorielles.

# Changelog

## [5.40.16] - 2026-04-27
### Fixed
- **Configuration Capacitor** : Unification du `appName` en "SunTrail 3D" pour coh├®rence avec le Store.
- **Final Audit** : Validation finale des types et des tests (604 tests OK).

## [5.40.15] - 2026-04-27
### Improved
- **Typage Strict Web Workers** : S├®curisation compl├¿te du pipeline de chargement des tuiles avec des interfaces TypeScript pour les messages entre les threads.
- **Console Cleanup** : Suppression ou conditionnement (via `state.DEBUG_MODE`) des logs de d├®veloppement dans le code de production pour une console plus propre.

## [5.40.14] - 2026-04-27
### Fixed
- **Audit Google Play Store** : Unification du nom de l'application en "SunTrail 3D".
- **S├®curit├® & Batterie** : Suppression de la permission `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` pour garantir la conformit├® avec les politiques de Google. Le maintien du processus est assur├® par le Foreground Service et le WakeLock.
- **Cleanup Technique** : Suppression du code mort li├® aux optimisations de batterie dans les plugins natifs et les services JS.

## [5.40.13] - 2026-04-27
### Fixed
- **Signal├®tique Suisse** : R├®tablissement de la d├®tection des panneaux dans les couches "label" et "transportation" de SwissTopo.
- **Robustesse POI** : Assouplissement de la d├®tection s├®mantique (tags hiking/guidepost) pour ne rater aucune signal├®tique 3D.
- **Transition 2D/3D** : Suppression instantan├®e des objets 3D lors du passage en mode 2D.

## [5.40.11] - 2026-04-27
### Added
- **Signal├®tique Enrichie** : Restauration des ic├┤nes diff├®renci├®es pour les belv├®d├¿res (­ƒö¡), les abris (­ƒÅá) et les points d'information (i).
- **Moteur de Textures** : Syst├¿me de g├®n├®ration de textures ├á la demande par cat├®gorie de POI.
- **Stabilit├® de Structure** : Restauration du test d'int├®grit├® de l'initialisation pour pr├®venir les r├®gressions HTML.
- **Trail Picking** : Affichage du nom des sentiers au clic (MapTiler & SwissTopo).

Toutes les modifications notables de ce projet seront document├®es ici.

Le format est bas├® sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.38.3] - 2026-04-21
### Fixed
- **Robustesse Enregistrement GPS (Samsung A53)** : Correction du bug de la "ligne droite" et du d├®but de parcours manquant.
  - Impl├®mentation d'un filtre de rejet des positions "stale" (anciennes) au d├®marrage.
  - Maintien forc├® de la `HIGH_ACCURACY` tant que l'utilisateur est en mouvement (├®vite le basculement en mode ├®co/Cell qui coupait le GPS en arri├¿re-plan sur Galaxy A53).
  - Assouplissement temporaire du filtre de pr├®cision (100m) pour les 5 premiers points afin de garantir un accrochage imm├®diat de la trace.
  - Ajustement des seuils de vitesse pour l'intervalle adaptatif, mieux adapt├® ├á la randonn├®e lente en forte pente (seuil abaiss├® ├á 1.8 km/h).

## [5.38.2] - 2026-04-21
### Added
- **Optimisation du Panoramique (Tuiles)** : Augmentation du rayon de chargement forc├® (5x5) pour les presets High/Ultra et ├®largissement de la marge de visibilit├® (60%) pour les presets Eco/Balanced. Mode 2D Mobile ultra-g├®n├®reux (100% de marge) pour une fluidit├® parfaite sans "pop-in".
- **Mode Topo (Auto)** : Renommage du fond de carte "Topo CH" en "Topo (Auto)" pour refl├®ter la s├®lection dynamique et intelligente de la meilleure source topographique selon la position.
- **Support Officiel de l'Italie** : Int├®gration de la r├®gion Italie et utilisation syst├®matique d'OpenTopoMap (LOD 11-17) pour garantir un rendu montagneux homog├¿ne et pr├®cis.
- **Indicateur de Source Dynamique** : Le label de statut en haut ├á gauche affiche d├®sormais la source r├®elle au centre de l'├®cran (SWISS, IGN FR, ITALY, WORLD, SAT).

### Fixed
- **Build Android** : Correction d'une erreur de syntaxe (backslashes parasites) dans le fichier `build.gradle` emp├¬chant la compilation.
- **Lisibilit├® des ├ëtiquettes (IGN/OpenTopo)** : Impl├®mentation d'un "effet Loupe" (boost 0.5) pour les sources non-suisses. Cela d├®cale l'affichage d'un niveau de zoom (LOD) complet pour doubler la taille visuelle des noms de villes et villages, compensant la petite taille native des polices IGN et Italiennes.
- **Transitions Frontali├¿res (Aoste/Chamonix)** : Affinage chirurgical des segments g├®ographiques (BBoxes) pour ├®pouser les fronti├¿res r├®elles et supprimer d├®finitivement les tuiles blanches ou les m├®langes de styles ├á Aoste et dans les Alpes.
- **Unification Visuelle LOD 11** : Extension de la source mondiale unique jusqu'au LOD 11 pour supprimer le "patchwork" visuel lors de la transition vers les cartes haute r├®solution.
- **S├®curit├® des Packs Hors-ligne** : Les packs Suisse et France sont d├®sormais brid├®s g├®ographiquement pour ne plus polluer les territoires voisins avec leurs styles locaux.
- **Fiabilit├® LOD 12+** : Correction d'une erreur de comparaison inclusive dans la d├®tection g├®ographique, restaurant le chargement complet de SwissTopo en Suisse centrale.

## [5.38.1] - 2026-04-21

## [5.38.0] - 2026-04-20
### Added
- **Optimisation M├®moire V├®g├®tation** : Remplacement des objets `Matrix4` par des `Float32Array` plats pour les instances d'arbres, r├®duisant drastiquement le travail du Garbage Collector et le *stuttering*.
- **Acc├®l├®ration Spatiale Landcover** : Impl├®mentation d'une grille spatiale 16x16 pour la d├®tection des for├¬ts, passant d'une recherche $O(N)$ ├á $O(1)$.
- **G├®n├®rateur de B├ótiments Optimis├®** : Nouveau syst├¿me de g├®n├®ration 3D manuel utilisant `ShapeGeometry` pour les toits et un loop de murs ultra-rapide. Temps de g├®n├®ration CPU r├®duit de >60%.
- **Robustesse B├ótiments** : Gestion compl├¿te des cours int├®rieures (trous) et filtrage spatial par BBox pour ├®viter les empilements massifs sur les tuiles urbaines.

### Fixed
- **R├®seau Overpass (CORS/406)** : Suppression du header `User-Agent` bloqu├® par les navigateurs et correction de l'identification des requ├¬tes pour restaurer l'affichage des sommets et POIs.
- **G├®om├®trie des B├ótiments** : Correction des toits volants, des murs invisibles et des glitches visuels ("flying gray lines") via une synchronisation stricte des rep├¿res locaux.
- **Int├®grit├® des Tests** : Mise ├á jour et enrichissement de la suite de tests unitaires pour couvrir les nouvelles optimisations.

## [5.34.8] - 2026-04-19
### Fixed
- **Hotfix Build Android** : Correction d├®finitive de la syntaxe du fichier `build.gradle` (guillemets mal ├®chapp├®s sur le `versionName`) pour d├®bloquer la CI.
...
