## [5.77.0] - 2026-06-19

### Fixed
- **Sync REC bloquée (perf)** : `syncPoints()` re-nettoie désormais uniquement les nouveaux points avec contexte de bordure (2 derniers points), au lieu de re-traiter l'intégralité de `state.recordedPoints` via `cleanGPSTrack()` à chaque broadcast — évite la saturation du thread JS sur les longues randos.
- **Mutex `syncPoints()`** : ajout d'un verrou `_syncing` pour empêcher les exécutions concurrentes (race condition sur broadcasts fréquents ~1 Hz).
- **Normalisation de types** : `NativeGPSPoint→LocationPoint` avant stockage dans `state.recordedPoints` (filtrage des champs `id`/`accuracy`).
- **Temps aberrant notification** : `getElapsedTimeString()` protégé contre `mStartTime=0`, négatif ou futur — retourne `"0min"` au lieu d'afficher des heures absurdes (fixe le bug `2543659875h`).
- **`calculateTrackStats()`** : paramètre `skipCleaning=true` évite le re-calcul `cleanGPSTrack` complet toutes les 10s (utilisé par le interval notification).

### Changed
- **`geoStats.ts`** : `calculateTrackStats(points, threshold, skipCleaning)` — la déduplication par timestamp remplace `cleanGPSTrack` complet quand les points sont déjà nettoyés.

### Tests
- **`nativeGPSService.test.ts`** : +4 tests (lock concurrence, sync incrémental, normalisation types, gestion bordures).
- **`geoStats.test.ts`** : +3 tests (skipCleaning distance/déduplication/D+/D-).

- Tous les tests passent : 1157/1157 (105 files, 5 skip flaky).

## [5.76.0] - 2026-06-18

### Fixed
- **Race condition clé MapTiler/ORS** : le fast-path `.env` (quota exceeded) était appliqué avant le chargement du Gist de rotation :
  - `appInit.ts` : `await resolveMapTilerKey()` au lieu de `void` — plus de 403 avant le Gist.
  - `config.ts` : `resolveMapTilerKey()`/`resolveORSKey()` réinitialisent `isDisabled=false` et émettent `serviceDegraded:{disabled:false}` quand une clé valide est trouvée dans le pool Gist.
  - Résultat : l'icône réseau jaune ne s'affiche plus au démarrage, le 3D fonctionne immédiatement.

### Added
- **État DÉGRADÉ dans la carte Réseau** : le statut `#net-status` affiche désormais 3 états :
  - `ONLINE` (vert) → tout OK
  - `DÉGRADÉ` (jaune) → `isMapTilerDisabled` ou `isORSDisabled` actif
  - `OFFLINE` (rouge) → pas de réseau
- **Tests config.ts** : 2 tests pour la récupération de `isMapTilerDisabled` après chargement Gist.

### Changed
- **i18n** : clés `connectivity.status.degraded` ajoutées (fr/en).
- **CSS** : classe `.conn-status-degraded` avec `color: var(--warning)`.

- Tous les tests passent : 1148/1148 (105 files, 5 skip flaky).

## [5.75.0] - 2026-06-18

### Changed
- **Refactoring dette technique** : audit et corrections des doublons critiques :
  - `config.ts` : extraction générique `extractKeys()`, `fetchGistConfig()`, `pickRandomFromPool()`, `rotateServiceKey()` (élimine 80% du miroir MapTiler/ORS, -50 lignes).
  - `geo.ts` : `tilePixelToLatLon()` et `getFiveSamplePoints()` extraits, utilisés dans les 3 fonctions tile-in-country. `yNormToLat()` réutilisé dans `worldToLngLatTarget()`.
  - `packManager.ts` : `isTileInPackRegion()` utilise `tilePixelToLatLon()` de `geo.ts` au lieu de sa copie inline.
  - `scene.ts` : `computeEffectiveDistance()` et `computeTargetZoom()` extraits, utilisés dans `forceImmediateLODUpdate()`, `controls.end` et `throttledUpdate()`.
  - `appInit.ts` : `resetCoordsPillPosition()` et `screenToRaycaster()` extraits ; fonction vide `handleGlobalClick()` supprimée.

### Fixed
- **Fuites mémoire Three.js** : ajout de `disposeEnvironment()` dans `environment.ts` (dispose Sky, sunLight, ambientLight) + cleanup camera, controls, stats DOM dans `disposeScene()`.
- **403 MapTiler incohérent** : `tileLoader.ts:fetchWithCache()` appelle désormais `rotateMapTilerKey()` avant de désactiver le service (aligné avec le worker path).
- **403 gaps sites** : `peaks.ts`, `poi.ts`, `landcover.ts` appellent désormais `rotateMapTilerKey()` sur 403/429 au lieu du `return null` silencieux.
- **Flood « All keys banned »** : `config.ts:rotateServiceKey()` ne retraite pas une clé déjà bannie sans alternative, et n'affiche le message qu'une seule fois (reset au cooldown 2min).
- **Catch muet** : `fetchWithCache()` outer catch log désormais un `console.warn` au lieu de `return null` silencieux.
- **Icône « Mode Dégradé »** : `TopStatusBar` affiche une icône réseau orange quand un service tiers (MapTiler/ORS) est indisponible, via `eventBus:serviceDegraded`.

### Changed (UI)
- **Templates weather.html + solar-probe.html** : sections PRO/free/stats/forecast déplacées dans les templates (55% de createElement en moins dans `makeStat`/`addStat`).

- Tous les tests passent : 1147/1147 (105 files).

## [5.74.0] - 2026-06-13

### Added
- **Tests P0** : `initCacheLayer`, `resetTileLoaderState`, `hasInstalledPackForCountry`, `getMinPackZoom`, `inPackZone` data-driven (+20 tests).
- **Offline cache retention test** : vérifie que les tuiles offline survivent à l'éviction du cache normal (+3 tests).
- **WeatherSheet** : `computeTemperatureChartData()` et `getComfortCategory()` extraites dans `weatherUtils.ts` (+12 tests).
- **SolarProbeSheet** : `findStrongExposureSegments()` extrait dans `solarRoute.ts` (+9 tests).
- **Tests UI** : UpgradeSheet (+4 tests) et PacksSheet (+3 tests).
- **i18n** : clé `terrain.toast.noRelief3D` ajoutée (fr/en/de/it).

### Changed
- **Refactoring** : `packCatalog.ts` extrait de `packManager.ts` (770→629 lignes). Le catalogue est désormais un module séparé, testable.
- **packManager.ts** : `getMinPackZoom()` et `hasInstalledPackForCountry()` délégués à la logique de pack.

### Fixed
- **Pack couleur LOD 8-10** : OpenTopoMap était remplacé par la source HD du pack (IGN France) dès LOD 8 au lieu de LOD 11. Le pack couleur suit maintenant la même règle que `getColorUrl()` : OpenTopoMap mondial jusqu'à LOD 10 inclus, pack couleur à partir de LOD 11.
- **npm audit** : 9 vulnérabilités corrigées → 0. `uuid` ajouté aux `overrides` dans `package.json`.

## [5.73.0] - 2026-06-13

### Added
- **Pack Autriche v2 multi-source** : OpenTopoMap LOD 8-11 + basemap.at HD LOD 12-14 dans le même PMTiles.
- **Filtre polygone assoupli** : 2/5 points au lieu de 3/5 pour combler les trous frontaliers aux LOD 10-11.
- **`packManager.hasInstalledPackForCountry()`** : détection data-driven des packs pays (plus de CH/FR codé en dur).

### Changed
- **`tileLoader.ts`** : `inPackZone` data-driven via `hasInstalledPackForCountry()` au lieu de `(inCH||inFR)`.
- **`tileLoader.ts`** : seuil pack abaissé à `getMinPackZoom()` (LOD 8) au lieu de 12.
- **`appInit.ts`** : `initCacheLayer()` appelé AVANT `loadTerrain()` pour éviter la race condition cache.
- **AT `tileSources.ts`** : `minZoom` 10 → 12 (OpenTopoMap LOD 5-11, HD LOD 12+).

### Fixed
- **Race condition cache** : les caches étaient null au premier `loadTerrain()` → 100% réseau.
- **Pack Autriche ignoré** : `inPackZone` ne permettait que CH/FR, AT était exclu.
- **Trous LOD 10-11** : filtrage polygone trop strict (3/5) pour les tuiles frontalières, passé à 2/5.
- **`tileLoader.blocking.test.ts`** : mock packManager incomplet.

## [5.72.0] - 2026-06-09

### Added
- **Pack Autriche v1** (980 Mo) : basemap.at, uploadé sur R2, catalog v4, locales.
- **Timeout 30s** sur `tile.load()` : empêche le blocage infini si une tuile ne répond pas.

### Fixed
- **Drapeau pack** : PacksSheet affiche maintenant le bon drapeau via `countryCodeToFlag()`.
- **Filtrage Autriche** : Natural Earth AT supporté, build script source `basemap_at` ajouté.

## [5.71.0] - 2026-06-09

### Changed
- **Build script v6** : cache source `.raw` (re-encodage sans re-download), elevation lossy WebP Q40.
- **Pack Suisse v3** : 664 Mo (down from 716 Mo v2), uploadé sur R2.
- **Catalog.json** : version 3 déployée sur CDN, embedded catalog synchronisé.
- **TileLoader mock** : fix type `Request[]` pour passer `tsc --noEmit`.

### Fixed
- **Build polygon filter** : Natural Earth seul (conservateur), plus de duplication OSM+NE.
- **ESLint** : `no-useless-assignment` dans ConnectivitySheet, `prefer-const` dans tileLoader.

## [5.70.0] - 2026-06-09

### Added
- **Badge LOD cliquable** : clic sur `(#top-pill-lod)` ouvre PacksSheet si pack disponible sur la zone, sinon LayersSheet.
- **Indicateur visuel pack** : badge affiche 📦 (disponible) ou ✓ vert (installé) devant le nom de la source.
- **PackHighlight event** : `packHighlight: { packId }` → scroll + surlignage du pack dans PacksSheet.
- **`packManager.findPackContaining(lat, lon)`** : détection publique du pack couvrant une position.
- **Système & Données** : nouvelle section "Données embarquées" avec badge statut pack courant.
- **Clé i18n** : `connectivity.section.embeddedData`, `connectivity.label.packAvailable`.

### Changed
- **TopStatusBar HTML** : `#top-pill-lod` passe en `role="button" tabindex="0"`.
- **Style** : `.lod-badge` transition couleur + `[data-pack-state="installed"]` vert (`#22c55e`).
- **EventMap** : nouveau type `packHighlight` pour le typage fort eventBus.

## [5.62.3] - 2026-06-09

### Changed
- **Pastille REC** déplacée de la barre droite vers la gauche du top-bar.

## [5.62.2] - 2026-06-09

### Fixed
- **Race condition cleanup caches** : `cleanupOldCaches()` passait en `void` (fire-and-forget) pendant que `caches.open()` créait les nouveaux caches → pouvait bloquer indéfiniment sur mobile après mise à jour Play Store. Remplacé par `await` + suppression séquentielle.

## [5.62.1] - 2026-06-09

### Changed
- **Pools adaptatifs par preset** : matériaux (eco:6 → ultra:24) et géométries (eco:32 → ultra:128). Évite la création/destruction de matériaux sur les presets élevés.

## [5.62.0] - 2026-06-09

### Added
- **Cache offline partitionné** : `OFFLINE_CACHE_NAME` séparé du cache navigation. Les zones hors-ligne ne peuvent plus être évincées par le cache normal (P1).
- **Index mémoire CacheStorage** : `Map<string, boolean>` pour lookups O(1) au lieu de `caches.match()` O(n). Warmup au démarrage via `cache.keys()` (P2).
- **Normal map RG compact** : stockage 2 canaux (RG) au lieu de 4 (RGBA). Z reconstruit côté GPU via `sqrt(1 - x² - y²)` + signe. Gain VRAM ~50% sur les normal maps (P5).

### Changed
- **Overview APK** : WebP qualité 80 au lieu de 90 → fichier généré ~20 Mo au lieu de ~30 (-34%) (P3).
- **Country Packs (élévations)** : WebP lossless au lieu de PNG niveau 9 → ~25-35% plus petit pour les tuiles d'élévation (P4).

### Performance (milieu de gamme)
- **VRAM** : -6 à -12 Mo sur les normal maps visibles (P5)
- **CPU** : -1 à -3 ms par cycle de chargement de tuile (P2)
- **Stockage** : -10 Mo APK (P3), -80 Mo par pack pays (P4)
- **Fiabilité** : zones offline protégées contre l'éviction par le navigateur (P1)

## [5.61.3] - 2026-06-09

### Added
- **Marqueur 3D orange au clic** sur la carte (anneau TorusGeometry) — visible immédiatement pour savoir où la sonde solaire va être lancée.
- **Debounce 200ms hide-on-move** : les clics simples ne déclenchent plus `ui-moving` → fini le flicker UI. Seuls les drags/zooms cachent l'interface.

### Changed
- **Auto-hide suspendu** quand le coords-pill est visible (`hasLastClicked`).

### Fixed
- **Redeclaration wheelHideTimer** dans scene.ts.

## [5.61.2] - 2026-06-08

### Changed
- **Top bar refactored** : 3 zones séparées — météo à gauche (clic → panneau), MAP·LVL au centre (informatif), boutons à droite. Fini le pill tout-en-un.

## [5.61.0] - 2026-06-08

### Added
- **Zones tactiles 44px** (`.touch-hit-target`) pour les icônes ⓘ dans TrackSheet, SolarProbeSheet, WeatherSheet — accessibilité grand public.
- **`role="button" tabindex="0" aria-label`** sur toutes les icônes info — navigation clavier + lecteurs d'écran.
- **Bouton repli/dépliage barre haute** (tiroir) : flèche `>` quand la barre est visible (pousse à droite/ferme), `<` quand cachée (tire depuis la droite/ouvre). Animation GPU-composited (`translateX(100%)` + `opacity`).
- **Masquage UI au déplacement** (`HIDE_UI_ON_MOVE`, ON par défaut) : masque toute l'interface pendant le drag/zoom molette/tactile. Option dans Paramètres Avancés.
- **Skeleton shimmer** sur le titre de géocodage SolarProbeSheet (remplace le `...` statique).
- **Support `prefers-reduced-motion`** : toutes les animations respectent la préférence utilisateur.

### Changed
- **Barre de chargement des tuiles** : 3px → 5px + `box-shadow` pour meilleure visibilité.
- **`font-size` normalisée** : 14 occurrences de 9-11px inline → `var(--text-xs)` dans 7 composants.
- **Section Clés API unifiée** : ORS utilise les mêmes classes CSS que MapTiler (`.api-key-form`, `.api-key-input`, `.api-key-hint`).
- **`HIDE_UI_ON_MOVE`** déplacé dans Paramètres Avancés (supprime l'ancienne section Interface vide).
- **Vue `.ui-moving`** : masquage sans `scale(0.92)` (optimisé pour vieux GPU), désactive `backdrop-filter` en mode éco.

### Fixed
- **Overlap toggle/timeline** : le bouton de repli n'était plus positionné en absolute mais en frère flex, plus de chevauchement.
- **Animation slide-out** : suppression de `display:none` sur les enfants qui cassait le calcul de `translateX(100%)`.
- **Fleche inversée** : `>` visible / `<` caché (logique tiroir).

## [5.60.2] - 2026-06-08

### Fixed
- **Calibration benchmark micro recalibrée** (`benchmark.ts:36-39`) : Facteurs de normalisation ajustés CPU `×0.8`→`×0.5`, GPU `×2.5`→`×2.0` pour éviter la saturation du S23 (CPU/GPU à 100). Les scores reflètent maintenant une vraie différenciation entre S23 (performance ~80), Tab S8 (performance ~62) et Snapdragon Elite (ultra ~99).
- **Seuil performance abaissé** (`benchmark.ts:49`) : `65`→`60` pour stabiliser le Tab S8 qui oscillait entre balanced et performance (total ~62).
- **Premier lancement sans micro-benchmark à froid** (`appInit.ts:107-131`) : La détection statique GPU (`detectBestPreset()`) est appliquée immédiatement au lieu d'attendre le benchmark qui donnait des scores bas en période d'initialisation. Le micro-benchmark réel est différé à +15s quand le système est stable.
- **Benchmark différé simplifié** (`appInit.ts:169-195`) : Remplacé le re-benchmark à +8s avec seuil des 30% par un benchmark unique à +15s qui upgrade le preset si nécessaire.
- **Fix TS2683** (`SettingsSheet.test.ts:36`) : `this` implicite typé dans `mockImplementation`.

### Changed
- **`AI_PERFORMANCE.md`** : Mise à jour des seuils et facteurs de normalisation.

### Tests
- 61 tests passants (benchmark, performance, state, appInit).

## [5.60.1] - 2026-06-07

### Changed
- **Réorganisation des paramètres** (`settings.html`, `SettingsSheet.ts`) : Clé MapTiler, Clé ORS, GPU/CPU/Preset détecté et ID Testeur déplacés dans `⚙️ Paramètres Avancés`. Suppression des clés API de "Système & Données" et du panneau itinéraire.
- **Nettoyage** (`connectivity.html`, `app.html`, `appInit.ts`, `style.css`) : Code et CSS orphelins retirés après le déplacement des formulaires de clés.

### Tests
- 3 nouveaux tests unitaires pour les infos matériel, la sauvegarde ORS et l'affichage ID Testeur.
- Tous les tests unitaires (1084) sont passants.

## [5.60.0] - 2026-06-07

### Fixed
- **Zones noires aux frontières (AT, ES, NO)** : Ajout d'un seuil strict (`strictAtHighZoom`) pour le fallback vers OpenTopoMap au-delà du zoom 14, corrigeant l'affichage de tuiles vides/noires à haute résolution.
- **Bouton STOP sans feedback** (`TrackSheet.ts`) : Ajout de `btn-loading` + `disabled` + `aria-busy` pendant l'arrêt, évite les doubles-clics sans retour visuel.
- **Inclinomètre affichait 0° sans données** (`InclinometerWidget.ts`) : Affiche `—° (—%)` quand `getAltitudeAt` retourne 0 partout (offline / pas de relief), au lieu de `0°` trompeur.
- **Zone selection — rotation non prise en compte** (`ZoneSelector.ts`) : Remplacement du plan horizontal unique `baseY` par `findTerrainIntersection()` par coin dans `getViewportBBox()`. La bbox correspond maintenant exactement au cadre orange, même avec la carte tournée.
- **Fly to zone téléchargée trop proche** (`ConnectivitySheet.ts`) : Calcule la distance via la diagonale de la zone + FOV 45° pour voir tout le cadre bleu, au lieu d'utiliser `getDistanceFromZoom(zone.maxLod)` qui zoomait au LOD max.

### Added
- **Toast 3D sans relief** (`NavigationBar.ts`) : Affiche un toast "Relief indisponible en 3D" quand l'utilisateur passe en mode 3D sans données d'élévation (offline zone non téléchargée).
- **Documentation chaîne de cache** (`tileLoader.ts`) : Priorité documentée : embeddedPMTiles > Pack HD > Cache manuel > Réseau.
- **Test inclinomètre sans données** : Nouveau test `should display --° when no elevation data is available`.

### Changed
- **Internationalisation (i18n)** : Correction de la structure JSON (suppression des doublons) et ajout des clés manquantes signalées par l'audit (`gpx.importError`, `gpx.imported`, `track.manual.title`).

### Maintenance
- **Qualité de code** : Formatage automatique avec Prettier sur les fichiers de configuration et modules UI.
- **Audit i18n** : Vérification complète pour assurer la cohérence entre le code et les fichiers de traduction.

### Tests
- Tous les tests unitaires (1081) sont passants.


## [5.58.0] - 2026-06-07

### Features
- **Rotation de clés ORS** (`config.ts`, `routingService.ts`, `appInit.ts`, `state.ts`) : Les clés OpenRouteService sont chargées depuis le GitHub Gist partagé, avec rotation automatique sur 403/429 et fallback silencieux vers OSRM quand toutes les clés sont épuisées. Priorité : localStorage (clé manuelle) > Gist rotation. Même mécanisme que la rotation MapTiler existante.

### Changed
- **computeRoute()** (`routingService.ts`) : Code ORS/OSRM dédupliqué en un seul bloc de traitement commun. Fallback OSRM transparent si ORS échoue.

### Fixed
- **Catch blocks JSON** (`config.ts`) : Les erreurs de parsing du Gist sont maintenant logguées en console au lieu d'être ignorées silencieusement.
- **Race condition** (`appInit.ts`) : `resolveORSKey()` chaîné après `resolveMapTilerKey()` via `.finally()` pour garantir le partage de `gistData` sans double requête.

### Tests
- **routingService.test.ts** : Test `fall back to OSRM silently` mis à jour. Mock `rotateORSKey` ajouté.
- Total : **1080 tests** (101 fichiers).

## [5.57.7] - 2026-06-07

### Features
- **Nommage des zones téléchargées** (`ZoneSelectToolbar.ts`) : Utilisation de `getPlaceName()` pour nommer les zones hors-ligne avec le nom de la ville/région réelle au lieu du générique "Zone visible". Exemple : `"Chamonix (LOD 5→14)"`.
- **Annulation du téléchargement de zone** (`tileLoader.ts`, `ZoneSelectToolbar.ts`, `style.css`) : Pendant un téléchargement, le bouton "Annuler" devient "⏹ Annuler le téléchargement" (rouge). Un clic interrompt le téléchargement et nettoie les tuiles déjà sauvegardées du CacheStorage.

### Fixed
- **Rien n'était cassé.** Le gate Free 1 zone était correct. Comportement S23 dû à un accès Pro actif sur le device.

### Tests
- **ZoneSelectToolbar.test.ts** : 4 tests annulation + 1 test geocode (nom de lieu dans la zone).
- Total : **1080 tests** (101 fichiers).

## [5.57.6] - 2026-06-07

### Tests
- **tileLoader.test.ts** : 7 nouveaux tests pour `getOfflineZoneCount`, `incrementOfflineZoneCount`, `decrementOfflineZoneCount` — fallback, sync, floors.
- Total : **1083 tests** (101 fichiers).

## [5.57.5] - 2026-06-07

### Fixed
- **Panel Parcours Free ne saute plus** (`style.css`) : `overflow-y: auto` → `scroll` sur `.bottom-sheet` + `min-height: 1.2em` sur `.stat-card-value` pour éliminer l'oscillation scrollbar/reflow en mode Free.
- **Écran noir après mise à jour Play Store** (`app.html`, `appInit.ts`, `main.ts`) : L'overlay `#map-loading-overlay` est désormais visible dès le chargement HTML. Un timeout 10s dans `launchScene()` affiche "Erreur de chargement" + bouton Réessayer si `suntrail:sceneReady` n'arrive jamais. Détection de changement de version dans `main.ts` avec nettoyage des précaches Workbox uniquement (préserve les caches runtimes tiles).
- **Reset erreur si sceneReady arrive tard** (`appInit.ts`) : `resetLoadingError()` nettoie l'état d'erreur si la scène se prépare après le timeout.
- **Nettoyage caches Workbox uniquement** (`main.ts`) : Filtre `k.startsWith('workbox-')` pour ne pas effacer les tuiles offline des caches runtimes (MapTiler, SwissTopo).

### Docs
- **MONETIZATION.md** : Précision que le compteur offline zones Free est un soft limit client-side (localStorage).

### Tests
- **appInit.test.ts** : 3 nouveaux tests pour `showLoadingError` / `resetLoadingError` (affichage erreur, restauration, no-op).
- Total : **1076 tests** (101 fichiers).

## [5.57.4] - 2026-06-06

### Fixed
- **Leak classe `is-pro` au stop REC** (`TrackSheet.ts`) : La classe CSS `is-pro` n'était pas retirée quand l'enregistrement s'arrêtait.
- **Pré-incrémentation du compteur zone offline** (`ZoneSelectToolbar.ts`) : Le slot gratuit est réservé avant téléchargement, libéré en cas d'échec. Plus de double-download possible si `localStorage.setItem` échoue.
- **Suppression zone libère le slot gratuit** (`cachedZones.ts`) : `removeCachedZone()` décrémente désormais `getOfflineZoneCount()`.
- **Stale Pro status si RevenueCat indisponible** (`iapService.ts`) : `state.isPro` est réinitialisé à `false` quand la clé API RevenueCat est manquante, évitant un faux Pro hérité du localStorage.
- **Appel redondant `updateRecUI()` supprimé** (`TrackSheet.ts`) : La souscription `state.isRecording` le couvre déjà.

### Performance
- **Parallélisation CacheStorage** (`tileLoader.ts`) : Les 3 appels `getCachedBlob` (color, elev, overlay) s'exécutent en `Promise.all` au lieu de séquentiel.

### Tests
- **ZoneSelectToolbar.test.ts** : 21 tests (render, updateLabels, gate Pro/Free, slot pré-incrémentation, succès/échec/erreur, cancel).
- **ZoneOverlay.test.ts** : 14 tests (show/modes, setMode, hide, updateFromBBox, isLocked, bordures).
- **tileLoader.test.ts** : 2 tests CacheStorage (Promise.all, cache miss).
- **TrackSheet.test.ts** : Nettoyage (-4 redondants, +2 nouveaux : cleanup is-pro, has-notif navTab).
- **TopStatusBar.test.ts** : 3 tests REC indicator (affichage, cache, timer).
- Total : **1073 tests** (101 fichiers).

## [5.57.3] - 2026-06-06

### Fixed
- **STOP button sans clignotement ni mouvement panneau** (`TrackSheet.ts`, `track.html`, `style.css`) : Classe CSS `#track.recording` au lieu de DOM manipulation. Plus de reflow. Banner upsell en `visibility` (hauteur réservée) avec `max-height` animé.
- **REC indicator ne pousse plus la timebar** (`style.css`) : Passage en `position: absolute` sous la barre de statut, à droite. Ne prend plus de place dans la rangée du haut (fix Galaxy A53).
- **Bouton REC sans message PRO erroné** (`style.css`) : Retrait du `!important` qui empêchait le JS de cacher le banner pour les PRO.
- **Timebar mémorise son état 3D** (`TimelineComponent.ts`) : Plus d'ouverture automatique en 3D, restaure l'état précédent.
- **Bbox téléchargement = cadre orange** (`ZoneSelector.ts`, `ZoneOverlay.ts`) : Calcul depuis les pixels du cadre CSS + `getAltitudeAt` au centre écran. Plus de décalage orange/bleu.
- **CacheStorage sur main thread** (`tileLoader.ts`) : Blobs des zones offline injectés directement au worker, bypass réseau même en online lent.
- **Panneau zone-sélection remonté** (`style.css`) : Au-dessus de la nav-bar.

### Tests
- 4 tests `updateRecUI` (classe `.recording`, banner Free/Pro).
- 3 tests REC indicator (affichage, cache, timer).
- 4 tests mémorisation `IS_2D_MODE` timebar.
- Total : 1036 tests (99 fichiers).

## [5.57.2] - 2026-06-06

### Fixed
- **Bouton STOP sans micro-saccades** (`TrackSheet.ts`, `track.html`, `style.css`) : Les icônes SVG sont statiques dans le template, basculées via CSS. `updateRecUI` ne remplace plus l'`innerHTML`.
- **Cache respecté même en online lent** (`tileLoader.ts`) : Vérification CacheStorage sur le main thread avant dispatch worker.
- **Rectangle de sélection unifié + cadre orange fixe** (`ZoneOverlay.ts`, `ZoneSelector.ts`, `ZoneSelectToolbar.ts`, `style.css`) : Cadre CSS 85%×55% comme indicateur unique. Bbox calculé depuis les pixels du cadre.
- **Panneau zone-sélection remonté** (`style.css`) : Au-dessus de la nav-bar.

### Tests
- 4 tests mémorisation `IS_2D_MODE` timebar. Total : 1027 tests (99 fichiers).

## [5.57.1] - 2026-06-06

### Changed
- **Cadre reduit a 50% du viewport** (`ZoneSelector.ts`) : Le rectangle de selection est desormais centre a l'ecran avec des marges de ~25%, le rendant toujours visible en plein ecran. S'adapte automatiquement au format portrait/paysage via NDC.
- **Comptage securise sans OOM** (`ZoneSelector.ts`) : `computeZoneSelection` compte d'abord les tuiles par arithmetique avant d'allouer les tableaux. Plus de crash en dezoomant avec slider max a LOD18.
- **Bouton lock Free** (`ConnectivitySheet.ts`) : Si zone deja utilisee et non-Pro, le bouton affiche un cadenas 🔒 grise. Clic → upgrade prompt.
- **tooLarge assoupli** : Les LODs excedentaires sont ignores, les autres restent telechargeables. Message "Certains niveaux ignores (limite 2000 tuiles)".
- **Tests** : 2 nouveaux tests de verification du cadre de telechargement. Total : 1023 tests (99 fichiers).

## [5.57.0] - 2026-06-06

### Added
- **Selection visuelle de zone offline** (`ZoneSelector.ts`, `ZoneOverlay.ts`, `ZoneSelectToolbar.ts`) : Nouveau mode de selection interactif avec rectangle vert semi-transparent sur le terrain, bordures blanches en mesh, et toolbar flottante avec slider LOD min-max (LOD 5→18).
- **Viewport frustum** : La zone selectionnee correspond exactement a ce qui est visible a l'ecran (intersection frustum camera + plan du sol), pas a l'ensemble des tuiles chargees.
- **Limites intelligentes** : 3 paliers — warning orange a 500 tuiles, hard warning a 1000, blocage a 2000 tuiles totales (tous LOD confondus).
- **Cached zones** (`cachedZones.ts`) : Stockage en localStorage des zones telechargees (bbox, plage LOD, taille, date). Affichage dans le panneau Systeme & Donnees.
- **Fly to cached zone** : Clic sur une zone en cache → la camera vole au centre de la zone au LOD max avec overlay bleu.
- **Feedback visuel pendant download** : Opacite du calque augmentee (0.08→0.25) pendant le telechargement, puis passage en bleu (cached) pendant 3s.
- **Tests** : `ZoneSelector.test.ts` (10 tests — bbox, comptage, paliers). `cachedZones.test.ts` (6 tests — CRUD localStorage).
- **Bouton reordonne** : Telecharger Zone avant Vider le Cache dans le panneau.

### Changed
- **Limites securisees** (`ZoneSelector.ts`) : `computeZoneSelection` ne genere plus les tableaux de tuiles au-dela de 2000 — calcule d'abord le comptage par plage (arithmetique), evite le OOM quand on dezoome avec slider max a LOD18.
- **Bouton lock Free** (`ConnectivitySheet.ts`) : Si deja 1 zone utilisee et non-Pro, le bouton affiche un cadenas 🔒 avec effet grise. Le clic ouvre l'ecran d'upgrade (comme bulletin meteo).
- **tooLarge assoupli** : Le flag n'empeche plus le telechargement. Les LODs excedentaires sont ignores, les autres sont telechargeables. Message "Certains niveaux ignores (limite 2000 tuiles)".

## [5.56.26] - 2026-06-06

### Added
- **LOD5 disponible** (`scene.ts`, `cameraManager.ts`) : Le zoom minimum passe de 6 à 5. Les tuiles LOD5 déjà présentes dans `europe-overview.pmtiles` sont désormais accessibles.

### Changed
- **Qualité overview améliorée** (`build-overview-tiles.ts`) : WebP quality 80→90. Texte et écritures nettement plus lisibles.

## [5.56.25] - 2026-06-05

### Changed
- **Benchmark plus fiable** : Durées de test doublées (CPU 100→200ms, GPU 150→300ms) + warmup CPU avant mesure + frame warmup GPU. Normalisation GPU ajustée (`*5`→`*2.5`) pour compensation.
- **Re-benchmark automatique** (`appInit.ts`) : 8s après le lancement de la scène sur premier démarrage, si le score grimpe de ≥30% → upgrade automatique du preset.

## [5.56.24] - 2026-06-05

### Fixed
- **Boutons Enregistrer/Annuler bloqués** (`TrackSheet.ts`) : Cancel utilisait `finalName || suggestedName` → null devenait le nom suggéré. Fix : `if (finalName !== null)` + garde anti-double-clic `_saving`.

### Added
- **Tests showSaveTrackPrompt** (`TrackSheet.test.ts`) : 7 tests unitaires (confirm, cancel, Escape, Entrée, input vide, clic fond, cleanup DOM).
- **Dialog plus robuste** : Escape dismiss, clic sur fond = annuler, nettoyage des listeners.

## [5.56.23] - 2026-06-05

### Changed
- **Filtrage textures sans mipmap** : `colorTex` et `overlayTex` passent de `LinearMipmapLinearFilter` + mipmaps (défaut Three.js, flou) à `LinearFilter` sans mipmap. Texte et lignes nettement plus nets en 2D comme en 3D.

## [5.56.22] - 2026-06-05

### Changed
- **Tone mapping** : `AgXToneMapping` → `NoToneMapping`. Les tuiles (sRGB) ne sont plus délavées par un tone mapping filmique. Couleurs fidèles à OpenTopoMap original.
- **Éclairage solaire recalibré** : `sunIntensity` max réduite de 10.0→5.0 avec une courbe plus plate (`1.5 + t*3.5`) pour éviter le crâmage blanc à midi sans voile sombre matin/soir. `ambientIntensity` remontée de 0.25→0.6 pour garder les ombres lisibles.
- **Zoom molette plus rapide** : `controls.zoomSpeed = 3.0` (×3 vs défaut).

### Fixed
- **3D surexposé au soleil** : Avec `NoToneMapping`, la DirectionalLight (max 10.0) clippait tout en blanc. Réduction + recalibrage de la courbe d'intensité diurne.
- **Voile sombre matin/soir** : La base d'intensité à l'aube passée de 0.7→1.5 pour éviter le rendu terne aux heures basses.

## [5.56.21] - 2026-06-05

### Changed
- **Fallback global réordonné** : OpenTopoMap (gratuit, optimisé rando) → MapTiler outdoor → OpenStreetMap. Avant : MapTiler topo-v2 → OpenTopoMap. OpenTopoMap est désormais prioritaire sur MapTiler (nécessite clé API).
- **MapTiler outdoor remplace topo-v2** : Le style MapTiler passe de `topo-v2` (fade) à `outdoor` (sentiers, courbes de niveau, relief). La tuile d'élévation (Terrain-RGB) reste inchangée.

### Fixed
- **OpenTopoMap écrasé par mode auto** (`appInit.ts`) : `opentopomap` retiré de `AUTO_SOURCES`. Le choix manuel OpenTopoMap est maintenant respecté — l'auto-détection ne l'écrase plus au moindre déplacement.
- **Badge LOD affichait le pays même en OPENTOPO** (`TopStatusBar.ts`) : Ajout du cas `MAP_SOURCE === 'opentopomap'` → badge `OPENTOPO · LVL XX` au lieu de `SWISS · LVL XX`.
- **getColorUrl ignorait le mode opentopomap** (`tileLoader.ts`) : Ajout d'une branche explicite pour `MAP_SOURCE === 'opentopomap'` — utilise OpenTopoMap directement, sans passer par le fallback MapTiler visuellement identique à SwissTopo.
- **autoSelectMapSource changeait MAP_SOURCE en opentopomap** (`terrain.ts`) : En mode auto, `MAP_SOURCE` reste toujours `'swisstopo'`. Le fallback vers les sources non-HD est géré en interne par `getColorUrl` via son data-driven `COUNTRY_SOURCES`. Suppression de la manipulation DOM directe (.layer-item) qui entrait en conflit avec le système réactif.
- **Pack pays Suisse bypassait getColorUrl** (`tileLoader.ts:483`) : Le blob SwissTopo extrait du pack était injecté directement au worker (priorité absolue dans `fetchTile`), ignorant l'URL OpenTopoMap générée par `getColorUrl`. Fix : garde `state.MAP_SOURCE !== 'opentopomap'` — le pack est ignoré quand l'utilisateur a choisi OpenTopoMap.
- **Packs/PMTiles inaccessibles pour les URLs KVP** (`tileLoader.ts`) : `fetchWithCache` parse désormais les coordonnées de tuile via paramètres explicites `(z, x, y)` au lieu d'une regex sur l'URL (qui échouait sur `?tileMatrix=14&tileRow=4757&...`). Tous les formats d'URL fonctionnent (XYZ, RESTful, KVP).

### Added
- **Documentation des correctifs** (`docs/AI_PERFORMANCE.md`) : nouvelle section `1f. Benchmark v2.1 — Intel IGP & UMA Corrections`.

## [5.56.19] - 2026-06-05

### Added
- Journée photo in Cube — ROADMAP.md section Photography & Light Planning

## [5.56.16] - 2026-06-04

### Fixed
- **Redirection Web (Bypass Login)** : Mise en place d'une redirection temporaire vers le Google Play Store sur `login.html`, `404.html`, `guest-purchase-modal.html`, ainsi que des liens directs dans `index.html` et l'interface Pro (`upgrade.html`) pour contourner la page de connexion défectueuse.

## [5.56.15] - 2026-06-02

### Fixed
- **Double chargement carte au 1er démarrage** (`appInit.ts`) : le benchmark GPU/CPU s'exécutait en parallèle de la création de la scène. Quand il se terminait, `applyPreset()` détruisait toutes les tuiles via `refreshTerrain(true)` et les rechargeait — écran noir + "Chargement de la carte..." puis carte qui réapparaît. Fix : le benchmark est attendu avant `launchScene()`.
- **Tuiles mélangées aux frontières CH à LOD12+** (`tileLoader.ts`, `geo.ts`) : le polygone OSM 54 pts coupait certaines zones hors de Suisse (Bonfol, Damphreux, Aigle, Monthey) → IGN ou OpenTopoMap appliqué au lieu de SwissTopo. Fix : fusion des polygones OSM + Natural Earth (172 pts), logique pro-CH (≥1 point CH → SwissTopo), strictAtHighZoom assoupli (5/5→4/5).

### Changed
- **Démarrage accéléré** (`appInit.ts`) : clé MapTiler `.env` en fast-path immédiat, `packManager.fetchCatalog()` en arrière-plan au lieu de bloquer la scène.
- **Fuite canvas DOM** (`scene.ts`) : `disposeScene()` retire l'ancien `<canvas>` du DOM et nullifie `state.renderer`.
- **needsInitialRender** 60→20 (`scene.ts`) : moins de rendus inutiles sur scène vide.
- **Fallback overlay** 2s→4s (`appInit.ts`) : évite disparition prématurée de l'overlay de chargement.

### Added
- `countPointsInCountry()` dans `geo.ts` — compte les points d'échantillonnage dans un pays.
- 3 tests `countPointsInCountry` dans `geo.test.ts` (total 26 tests).

## [5.56.14] - 2026-06-02

### Fixed
- **Toast manquant à l'export GPX** (`TrackSheet.ts:999-1018`) : le bouton d'export d'un tracé existant (icône flèche ↑) dans le panneau Parcours ne montrait aucun feedback. Fix : ajout de `showToast(i18n.t('track.toast.exported'))` après un export réussi, et `track.toast.exportError` en cas d'erreur. Les clés i18n (`exported`, `exportError`) existaient déjà dans les 4 locales mais n'étaient jamais utilisées.

## [5.56.13] - 2026-06-01

### Tests
- +1 test pour le verrou `_isSaving` dans `recordingService.test.ts` (vérifie qu'un appel concurrent ne sauvegarde pas deux fois).
- 971 tests passants.

## [5.56.12] - 2026-06-01

### Fixed
- **Save REC — verrou anti-doublon** (`recordingService.ts`) : ajout de `_isSaving` flag dans `stopRecording()` pour empêcher les sauvegardes multiples quand l'utilisateur clique plusieurs fois sur le bouton.
- **Save REC — toast de confirmation** (`recordingService.ts:119`) : remplace `⏹️ Recording stopped` par un toast clair `✅ Parcours enregistré` (i18n `track.toast.recSaved` dans les 4 locales).

## [5.56.11] - 2026-06-01

### Fixed
- **Slider timeline vraiment corrigé** : le fix v5.56.9 (check `EventTarget` dans `touchControls`) était un leurre — le canvas et le slider sont dans des branches DOM distinctes, la phase capture ne passe pas par le canvas pour les touches UI. La cause réelle est un conflit CSS : `.timeline-drag-handle` (`touch-action: none`) + `#bottom-bar` (`overflow: hidden`) interfèrent avec le comportement natif du `<input type="range">` sur Chrome mobile.
  - Fix : `touch-action: auto` sur `input[type='range']` dans `style.css`.
  - Revert du check `closest('input,...')` dans `touchControls.ts` (red herring).

## [5.56.10] - 2026-06-01

### Fixed
- **Leak listeners `SheetManager`** (`ui/core/SheetManager.ts`) : `attachSwipeGesture()` ajoutait 4 listeners (`pointerdown/move/up/cancel`) à chaque `open()` sans jamais les retirer au `close()`. Accumulation silencieuse → comportement erratique après plusieurs ouvertures. Fix : stockage des callbacks + nouvelle méthode `detachSwipeGesture()` appelée au `close()`.
- **Leak listeners `profile.ts`** (`closeElevationProfile`) : Les 5 listeners du profil (pointerdown/move/up/leave/cancel) n'étaient jamais retirés. Fix : stockage + cleanup dans `closeElevationProfile()` + reset `profileInteractionsAttached` / `swipeAttached`.

### Changed
- **`console.log` protégés** : `tileLoader.ts` (PMTiles source chargée) et `packManager.ts` (pack monté) — ajout `if (state.DEBUG_MODE)`.

## [5.56.9] - 2026-06-01

### Fixed
- **Slider timeline bloqué en 3D** (`touchControls.ts:258-267`) : `onPointerDown` ne vérifiait pas `event.target` et interceptait tous les pointerdown via `{ capture: true }` sur le canvas. Quand l'utilisateur touchait le slider (`<input type="range">`), les touch controls pannaient la carte en même temps → conflit → slider inutilisable.
  - Fix : `e.target.closest('input, button, select, textarea')` → les éléments de formulaire sont ignorés par touchControls.
  - Fonctionne aussi pour les boutons et selects de l'UI.

## [5.56.8] - 2026-06-01

### Performance (Audit complet 7 optimisations)

- **`scene.ts:803`** — `shadowMap.autoUpdate = true` supprimé du render loop. Évitait un recompute GPU de shadow map à chaque frame rendue (impact Ultra: 4096² shadow map).
- **`terrain.ts:53,357`** — `_terrainMatrix` singleton dans `updateVisibleTiles`. Élimine `new THREE.Matrix4()` par frame.
- **`tileQueue.ts:19-21,73-80`** — `_queueMatrix`, `_queueFrustum`, `_visCache` singletons. Élimine 3 allocations par cycle de queue (impact Ultra: files 500+ tuiles).
- **`tileQueue.ts:123`** — Compteur `for...of` remplace `.filter().length`. Élimine la création d'un tableau temporaire par cycle.
- **`InclinometerWidget.ts:60-61,259-260`** — `_raycaster` + `_ndc` membres de classe. Élimine 2 allocations toutes les 200ms en mode libre.
- **`scene.ts:873-875`** — `new Date(+state.simDate)` évite la conversion string interne (coût Date dans l'animation solaire).
- **`analysis.ts:12,274-284`** — `_hitPoint` singleton + `.clone()`. Élimine jusqu'à 2 Vector3 par itération dans la boucle `findTerrainIntersection` (jusqu'à 5000 itérations).

### Tests
- 970 tests passants (95 test files, 5 skipped).
- Lint et TypeScript : clean.

## [5.56.7] - 2026-05-31

### Fixed
- **Particules météo bloquées visibles** (`scene.ts:850`) : `updateWeatherSystem` n'était appelée que quand `isWeatherActive` était vrai. Si la météo passait de "pluie" à "clair", les particules restaient visibles indéfiniment. Correction : `updateWeatherSystem` appelée à chaque `weatherFrameDue`, sans condition.
- **Particules météo `uTime` figé entre activations** (`weather.ts:323`) : `tickWeatherTime()` retournait tôt si `weatherPoints.visible === false`. Supprimé le guard — `uTime` avance en continu pour des transitions fluides.
- **Allocation Vector3 évitée** (`weather.ts:355`) : `new THREE.Vector3()` à chaque appel → hoisté en module scope (`_windVec`).

### Changed
- **`updateWeatherSystem` déclenché** : `weatherFrameDue` ajouté à `needsUpdate` (ligne 830) pour garantir que le rendu se déclenche même sans `isWeatherActive`.

### Tests
- 965 tests passants (95 test files, 5 skipped).
- Lint et TypeScript : clean.

## [5.56.6] - 2026-05-31

### Added
- **Module tooltip enrichi** (`tooltip.ts`) : Nouveau paramètre `trigger: 'auto' | 'click' | 'hover'` — détection automatique (hover desktop, click tactile). Accessibilité clavier (focus/blur), délai anti-flicker 150ms, fermeture au `touchstart` extérieur. 32 tests (+9).
- **Info-bulles ⓘ WeatherSheet** : Isotherme 0°C, point de rosée, visibilité, index UV (échelle 0-11+).
- **Info-bulles ⓘ SolarProbeSheet** : Azimut (direction du soleil) et élévation (hauteur au-dessus de l'horizon).
- **Info-bulles ⓘ TrackSheet** : D+ (dénivelé positif), D− (dénivelé négatif), durée estimée (4 km/h), points GPS.
- **Info-bulles ⓘ SettingsSheet** : Exagération relief, distance de brouillard, résolution LOD, rayon de rendu, densité végétation, économie d'énergie, intensité/vitesse/opacité météo.
- **Info-bulle ⓘ TopStatusBar** : Badge LOD — source cartographique et niveau de zoom.
- **i18n** (4 locales) : 20 nouvelles clés tooltip (`weather.mountain.*`, `solar.stat.*`, `track.stats.*`, `settings.label.*`, `topbar.*`).

### Changed
- `tooltip.ts` : `show()` annule désormais le `hideTimer` en attente avant l'early return (anti-flicker renforcé).
- `WeatherSheet.ts` : Le listener click manuel sur la rangée Confort Rando est supprimé — le module tooltip gère son propre déclenchement.
- `SolarProbeSheet.ts` : Ajout `disposeStatTooltips()` sur re-render et `dispose()`.

### Tests
- 965 tests passants (95 test files, 5 skipped).
- Lint et TypeScript : clean.

## [5.56.5] - 2026-05-31

### Added
- **Confort Rando enrichi** (`weatherUtils.ts`) : Nouveaux paramètres optionnels `weatherCode`, `visibility`, `cloudCover`. Le score intègre désormais le code météo WMO (orage −3, pluie forte −2, neige −1), la visibilité (<10km jusqu'à −2), la couverture nuageuse (>70% jusqu'à −1) et une pénalité humidité directe au-delà de 70% (−0.03/% excédentaire). Tooltip i18n mis à jour (4 locales, +3 lignes formule).
- **Couverture nuageuse** affichée dans les stat grids (free + pro) — `weather.clouds` déjà traduit.
- **Isotherme 0°C** affiché en version gratuite (utile pour la sécurité en montagne).
- **Spinner de chargement** météo quand `weatherData` est null (feedback utilisateur immédiat).
- **Accessibilité** : Bouton fermeture météo `<div>` → `<button>` focusable au clavier, `padding:0` reset.
- **i18n** (4 locales) : 4 nouvelles clés `weather.mountain.comfortFormula{Storm,Vis,Cloud,Humidity}`.

### Fixed
- **Flèche vent inversée** (`WeatherSheet.ts:672`) : `+180°` — la flèche pointe désormais dans la direction où le vent souffle (convention météo standard).
- **WMO brouillard (45, 48)** (`weather.ts:220`) : Icône `🌫️` au lieu de `☁️`.
- **Texte nearFreezing** : Parenthèse ouvrante retirée des 4 locales (fr: `"Neige possible près de votre position — isotherme à"`, sans `(`).
- **Coordonnées sunrise/sunset** (`WeatherSheet.ts:120`) : Utilise `lastWeatherLat/Lon` au lieu de `lastClickedCoords` (incohérent avec la zone météo fetchée).
- **Valeurs manquantes stats Pro** : `"—"` affiché quand dewPoint/gusts/visibility sont absents (évite "0 km" trompeur).
- **Seuil précipitations graphique** : 30% → 10% (barres visibles dès les faibles probabilités).
- **Locale dates quotidiennes** : `i18n.getLocale()` au lieu de `undefined` (browser locale par défaut).
- **Altitude fallback montagne** (`WeatherSheet.ts:417`) : `controls.target.y` au lieu de `0` quand `hasLastClicked` est false.
- **SunCalc non protégé** : Wrappé dans `try/catch` pour éviter un crash du rendu.
- **Confort rando désormais réaliste** : Exemple 18°C, orage, visibilité 1km → 1.4/10 (était 7.2/10).
- **Particules météo bloquées visibles** (`scene.ts:850`) : `updateWeatherSystem` n'était appelée que quand `isWeatherActive` était vrai. Si la météo passait de "pluie" à "clair", les particules restaient visibles indéfiniment. Correction : `updateWeatherSystem` appelée à chaque `weatherFrameDue`, sans condition. `weatherFrameDue` ajouté à `needsUpdate` (ligne 830) pour garantir que le rendu se déclenche même en météo claire.

### Tests
- 956 (+11) tests passants. Nouveaux tests : codes brouillard (×2), confort étendu paramètres optionnels (×5), weatherCode penalty (×2), visibilité (×2). 5 tests `weatherPro.test.ts` ajoutés.

## [5.56.4] - 2026-05-31

### Added
- **Confort Rando amélioré** (`weatherUtils.ts`) : Nouvelle formule asymétrique. Température idéale 5-22°C (froid −0.25/°C, chaud −0.5/°C × facteur humidité), vent effectif /20 (rafales à 30%), pluie probabilité ×4, UV progressif (UV-3)×0.4. 4 nouveaux paramètres utilisés (humidity, precProb, windGusts) — déjà disponibles dans l'API Open-Meteo.
- **Info-bulle Confort Rando** (`src/modules/ui/tooltip.ts`) : Clic sur le score ouvre un popover fixé sur `<body>` avec explication des 5 facteurs + formule détaillée. Positionnement auto (au-dessus si pas assez de place en bas). Fermeture au clic extérieur. Classes `.rich-tooltip` (wrapper générique) + `.comfort-tooltip-*` (contenu spécifique).
- **Utilitaire tooltip réutilisable** : `createTooltip(anchor, content)` → `{ show, hide, toggle, dispose }`. Prêt à l'emploi pour toute future info-bulle dans l'app. `src/modules/ui/tooltip.ts`.
- **i18n** (4 locales) : 6 clés sous `weather.mountain.*` pour le contenu de l'info-bulle (description, 5 lignes formule, échelle).
- **Tooltip tests** (+23) : Création, show/hide/toggle, positionnement (haut/bas/forcé), clamp gauche, clic extérieur, dispose, coexistence multiple. `src/modules/ui/tooltip.test.ts`.
- **Tests confort rando** mis à jour (+3) : asymétrie chaud/froid, amplification humidité, rafales, pluie progressive, UV progressif.
- **ESLint + Prettier configurés** : `eslint.config.mjs` + `.prettierrc`. 3 nouveaux scripts npm (`lint`, `lint:fix`, `format`). Le check CI inclut désormais la vérification de formatage et de lint.
- **Tests tileSources** (+26) : Couverture exhaustive des 16 builders d'URL et de la config `COUNTRY_SOURCES`.
- **Tests benchmark** (+5) : Validation des seuils de scoring (ultra/performance/balanced/eco).
- **Tests GPX import** (+2) : Détection des imports en double + acceptation de GPX différents.
- **Détection doublon GPX** : `handleGPXImport()` calcule un hash des points (first/last 5 + count). Si un layer existant a le même hash, toast + refus sans importer.
- **i18n `gpx.alreadyImported`** : Clé de traduction dans les 4 locales (fr/en/de/it).
- **Tests météo (+11)** : WMO 80/82/95 → rain, WMO 71 températures, codes lourds 57/67/82 density, hourly null safety, WEATHER_RAIN_OPACITY.
- **Tests getWeatherIcon (+8)** : Codes 78, 79, 80, 82, 85, 86, 99 — couverture complète des plages WMO.
- **Slider opacité pluie** : Nouveau slider `OPACITÉ` dans Réglages → Météo (range 0.1–1.0, défaut 0.55). Contrôle la transparence des particules de pluie. `state.WEATHER_RAIN_OPACITY`.

### Fixed
- **Particules météo affichant de la neige à 19°C avec pluie** : Les codes WMO 80-82 (averses) et 95-99 (orages) étaient classés comme `snow`. Mapping corrigé en plages explicites + garde-fou température (>5°C → pluie forcée). `weather.ts:136-147`.
- **Crash potentiel `data.hourly` null** : `data.hourly?.time?.findIndex(...) ?? -1`. `weather.ts:85`.
- **Icônes WMO 78-79** : `getWeatherIcon()` mappait 78-79 sur `🌦️` (pluie) au lieu de `🌨️` (neige). `weather.ts:214`.
- **Angle du vent inversé** : `windDir - 90` → `windDir + 90` (le vent du Nord poussait vers -Z/Nord au lieu de +Z/Sud). `weather.ts:346`.
- **Particules saccadées** : `tickWeatherTime()` jamais appelée → ajoutée à la render loop chaque frame. `scene.ts:742`.
- **Opacité pluie trop faible** : 0.4 → pilotée par `state.WEATHER_RAIN_OPACITY` (défaut 0.55).
- **Codes lourds ignorés** : 57 (freezing drizzle), 67 (freezing rain), 82 (violent rain) → 10000 particules au lieu de 4000. `weather.ts:149-152`.

### Changed
- **`fmtWindDir`** : `SO` → `SW`, `O` → `W`, `NO` → `NW` (abréviations anglaises standard). `weatherUtils.ts:52`.
- **Nettoyage state.ts** : Suppression `weatherIntensity` (dead code) et `windDirDeg` (redondant avec `windDir`). `precip?: number` → `precip: number`.

### Tests
- **919 tests passent** (+11 vs v5.56.4). Zéro régression.

### Changed
- **Refactoring SolarProbeSheet** : Extraction de `SolarTimeline.ts` et `SolarLockedItem.ts` dans `solarprobe/` (préparation pour extraction complète).
- **Corrections qualité code** (42 erreurs ESLint) : empty catch blocks documentés, `@ts-ignore` avec descriptions, `no-useless-assignment` nettoyés, `no-case-declarations` fixés, `no-unused-expressions` corrigés, `no-self-assign` supprimé.
- **`check` script** : Inclut désormais `prettier --check` et `eslint` en plus de `tsc --noEmit`.

### Added
- **Bouton refresh météo** (🔄) : Dans le header du bulletin, icône SVG synchro. Force `fetchWeather()` sur la position caméra actuelle. Re-fetch auto à l'ouverture du bulletin.
- **Format GPX `Ville (Pays)`** : La liste des parcours importés affiche désormais le pays entre parenthèses quand la ville et le pays sont connus.

### Changed
- **Unification geocoding** : `fetchWeather()` utilise `getPlaceName()` + `getCountryName()` au lieu de `fetchGeocoding()` + `extractLocationName()` directement. Suppression de `extractLocationName()` (code mort). `COUNTRY_NAMES` déplacé de `gpxHistoryService.ts` vers `geo.ts`.
- **Seuil re-fetch météo** : 5 km → 3 km pour une meilleure réactivité en montagne.
- **`getPlaceName()`** : Corrigé — gérait mal le format retourné par `fetchGeocoding()` pour MapTiler (chemin Nominatim seulement fonctionnel).

### Fixed
- **Label source carte bloqué** : Le badge LOD en haut à gauche (`Swiss · LVL 14`) ne se mettait pas à jour après le clic GPS si le zoom restait identique. Ajout des souscriptions `MAP_SOURCE` et `TARGET_LAT` dans `TopStatusBar.ts`.
- **Bouton refresh écrasé par i18n** : `data-i18n` remplaçait le SVG par le texte de traduction. Passage à une attribution via JS dans `WeatherSheet.ts`.

### Tests
- **-15 tests** : `extractLocationName()` supprimé (code mort, 9 cas de test retirés de `weather.test.ts`).
- **920 tests passent** : Aucune régression. Tests `gpxHistoryService.test.ts` adaptés au déplacement de `COUNTRY_NAMES`.

## [5.56.2] - 2026-05-31

### Added
- **Historique GPX persistant** : Les 5 derniers GPX importés ou REC sauvegardés sont conservés en localStorage et affichés dans une liste unifiée (`gpxHistoryService.ts`).
- **Mini-carte de prévisualisation** : Canvas avec tuiles OpenTopoMap + polyline du tracé pour chaque entrée d'historique (64×45 px, retina).
- **Nom de lieu automatique** : Reverse geocoding (MapTiler/OsmNominatim) + fallback pays via base interne de 55 polygones (`getCountryCode`). Affiche ville/région + pays + date.
- **Bouton profil avec état actif** : Icône bleue remplie quand le panneau d'élévation est ouvert pour ce tracé. Toggle ouvrir/fermer.
- **Module de types centralisé** : `gpxTypes.ts` avec `GeoPoint`, `GPXRawData`, `isValidGeoPoint()`, `getElevation()` — remplace `Record<string, any>` et `(p: any)` dans tout le pipeline GPX.

### Changed
- **Fusion des panneaux GPX** : L'ancien "Tracés importés" et le nouveau "Récents" sont fusionnés en une seule liste unifiée. Les routes manuelles (planificateur) sont affichées séparément en dessous.
- **Robustesse du mesh REC** : Le mesh enregistré est construit AVANT de disposer l'ancien — plus de perte de tracé si la reconstruction échoue.
- **Extraction de code dupliqué** : `disposeTrackMesh()`, `getPerformanceEpsilonMultiplier()`, `createGlassModal()`.
- **Cache mémoire pour l'historique** : `loadHistory()` utilise un cache invalidé par `persistHistory()`/`clearHistory()`.
- **Remplacement `setTimeout(0)` → `requestAnimationFrame`** dans `addGPXLayer`.
- **Guard `GPX_COLORS` vide** : Évite un crash si le tableau de couleurs est vide.

### Fixed
- **Suppression de tracé** : `removeFromHistory()` est appelé avant `removeGPXLayer()` pour éviter qu'une entrée fantôme réapparaisse.
- **`getCountryCode` sans try/catch** : Wrappé dans un try/catch pour éviter de perdre le save si la détection pays échoue.
- **Nom trompeur** : `simplifyPointsRDP` renommé `simplifyPointsUniform` (n'implémente pas RDP).

### Tests
- **+21 tests** : `src/test/gpxHistoryService.test.ts` — save, load, dedup ID/hash, FIFO, country, malformed entries, update location, cache. Suite complète : 880 tests passent.

## [5.56.1] - 2026-05-26

### Added
- **Sources cartographiques HD par pays** : Système data-driven `COUNTRY_SOURCES` dans `tileSources.ts`. Ajout de 3 nouvelles sources gouvernementales gratuites :
  - 🇦🇹 **Autriche** : basemap.at (`geolandbasemap` + `bmaporthofoto30cm`) — CC-BY 4.0, zoom max 20
  - 🇩🇪 **Allemagne** : BKG TopPlusOpen (`sgx.geodatenzentrum.de`) — dl-de/by-2-0, zoom max 18
  - 🇪🇸 **Espagne** : IGN España Mapa Base (`IGNBaseTodo-nofondo`) — CC-BY 4.0 scne.es, zoom max 20
- **Détection automatique** : Basculement transparent vers la source HD quand l'utilisateur se déplace dans un pays couvert.
- **Architecture extensible** : Ajouter un pays = une entrée dans `COUNTRY_SOURCES` + une fonction helper URL. Zéro changement dans `tileLoader.ts` ou `geo.ts`.

### Tests
- **+5 tests** : tileLoader (AT×3, DE×1, ES×1) et terrain.source (AT, DE, ES auto-sélection). Suite complète : 859 tests passent.

## [5.55.4] - 2026-05-26

### Changed
- **Frontières vectorielles (Polygone Suisse OSM)** : Remplacement des 5 rectangles CH chevauchants par un polygone simplifié de 54 points (OSM relation 51701, Ramer-Douglas-Peucker ~2 km de précision). Suppression des `REGIONS.CH`.
- **Sélection multi-points par tuile** : `isTileInCountry()` teste centre + 4 coins (seuil 3/5 pour LOD ≤ 14, 5/5 pour LOD > 14). Élimine l'oscillation de source entre LODs aux frontières.
- **LOD cap 14 Swisstopo** : Si `zoom > 14` et la tuile n'est pas STRICTEMENT en Suisse (5/5), bascule automatique sur IGN (France) ou MapTiler. Zéro tuile vide aux frontières.

### Fixed
- **Tessin/Chiasso** : La pointe sud du Tessin (~45.83°N, 9.03°E) est maintenant correctement classée en Suisse (point manquant dans le polygone simplifié corrigé).
- **Issenheim (Alsace)** : Les tuiles à LOD 14+ affichent désormais IGN au lieu de blanc (Swisstopo expire à LOD 14 hors CH).

### Architecture
- **Système extensible** : `COUNTRY_POLYGONS` / `COUNTRY_BBOX` dans `geo.ts` permet d'ajouter n'importe quel pays en polygone (FR, IT, AT...). `isPointInPolygon()` ray-casting O(n) zéro allocation. Pré-filtre BBox calculé une seule fois au chargement du module.
- **Tests** : +28 tests `geo.test.ts` (polygone, 31 localisations réelles, Issenheim, Chiasso, LOD consistency). +1 test LOD cap dans `tileLoader.test.ts`. Suite complète : 828 tests passent.

## [5.55.3] - 2026-05-19

### Fixed
- **Menus (High/Ultra)** : Correction de la transparence (glassmorphism) — uniformisation de l'opacité (0.95) pour une lisibilité constante en mode portrait et paysage, quel que soit l'appareil.

---
## [5.55.2] - 2026-05-17

### Fixed
- **Trial Period Harmonization** : Clarification des essais gratuits (7 jours) dans l'interface et suppression des mentions obsolètes "3 jours" (Discovery Trial).
- **Traductions** : Correction des erreurs de syntaxe JSON dans `en.json` et `fr.json`.

---
## [5.55.1] - 2026-05-17

### Fixed

- **Carte noire au démarrage (Race Condition)** : Correction d'un conflit entre le benchmark initial et le chargement de la scène. `refreshTerrain(true)` force désormais une mise à jour même si une autre est en cours, garantissant l'affichage de la carte dès la fin du benchmark.
- **Initialisation Longitude** : Correction d'une faute de frappe dans l'état initial où `initialLon` prenait la valeur de la latitude.
- **Robustesse chargement tuiles** : Les tuiles passent désormais en état `failed` au lieu de rester bloquées en `loading` si aucune donnée n'est renvoyée (timeout/erreur worker).
- **Récupération WebGL mobile** : Ajout d'un rechargement automatique de la page après 2 secondes en cas de perte du contexte WebGL (manque de mémoire GPU), permettant à l'application de se relancer proprement.

### Added

- **Tests de non-régression** : Ajout de tests pour vérifier le forçage du rafraîchissement terrain et la validité des coordonnées initiales.

## [5.55.0] - 2026-05-16

### Added

- **Benchmark de performance dynamique v2.0** :
  - Remplacement de la détection statique par un micro-benchmark (<500ms) au premier démarrage (test CPU/GPU/Mémoire).
  - Calibration automatique des presets (Eco, Balanced, Performance, Ultra) basée sur le score réel de l'appareil.
  - Ajout d'une section "Test de Performance" dans les Réglages Avancés permettant de relancer le test et d'afficher les scores techniques (CPU/GPU/Total).
  - Intégration d'un système de synchronisation réelle (`gl.readPixels`) pour éviter les scores artificiels sur mobile.
  - Classification intelligente : S23 (Adreno 740/750) classé en 'Performance' (High) par défaut ; 'Ultra' réservé aux stations de travail.

### Changed

- **Ajustement des seuils de preset** :
  - Seuil 'Ultra' relevé à 92+.
  - Seuil 'Performance' ajusté à 65+.
  - Seuil 'Balanced' à partir de 30+.
  - Réduction de la pondération de la liste GPU statique au profit du benchmark réel.

### Fixed

- **Granularité CPU** : Correction du test CPU pour éviter les scores à 0 sur mobile grâce à une boucle de mesure plus fine (1024 ops).
- **Stabilité GPU** : Forçage de synchronisation (readPixels) pour mesurer les frames réelles et éviter la saturation du buffer.

## [5.54.4] - 2026-05-12

### Fixed

- **Authentification Google (temporaire)** : Masquage de l'UI de connexion et des options de compte en raison de problèmes de stabilité. Les tests unitaires associés sont également ignorés.
- **Fuites mémoire DeviceOrientation** : Correction des listeners d'orientation mobile dans `location.ts` (ajout d'un cleanup systématique).
- **Build TS (TS6133)** : Suppression des imports et méthodes inutilisés suite au masquage de l'auth.
- **Manifest PWA** : Correction des chemins des icônes pour une compatibilité multi-plateforme (Web & Android). Utilisation de chemins relatifs (`./assets/...`) au lieu de chemins absolus.
- **Dom Warning (ORS Key)** : Correction de l'avertissement console "Password field is not contained in a form". Le champ est désormais enveloppé dans un formulaire `<form>`.

### Added

- **Robustesse OAuth Supabase** : Amélioration de la récupération de session après redirection Google (gestion des fragments hash et handshake localStorage).
- **Centralisation Storage** : Migration vers `STORAGE_KEYS` pour tous les accès `localStorage` afin d'éviter les collisions et les chaînes magiques.
- **Cache Tuiles v30** : Synchronisation de la version du cache entre le worker et le loader principal pour assurer la cohérence des données.

### Changed

- **Logs MapTiler** : Réduction du bruit dans la console en limitant les logs non-essentiels au mode DEBUG.

## [5.54.3] - 2026-05-07

### Fixed

- **Profil/pentes restant visible après suppression tracé** : Quand `removeGPXLayer` supprimait le dernier layer GPX, il ne faisait que `prof.style.display = 'none'` sans appeler `closeElevationProfile()`. Résultat : la classe `is-open` restait, le marker 3D (`profileMarker`) restait actif sur la scène, et la pastille continuait à bouger en interactif sur l'ancienne trace. Fix : appel à `closeElevationProfile()` qui nettoie l'état complet (retire `is-open`, cache marker 3D, dispose géométrie).

### Added

- **Tests removeGPXLayer** : 6 tests pour couvrir tous les cas (fermeture profil dernier layer, mise à jour reste, suppression mesh, id inconnu, bascule activeGPXLayerId, reset à null). Impact : tous les chemins de suppression (route manuelle, imports GPX, enregistrements) dorénavant testés.

## [5.54.2] - 2026-05-07

### Fixed

- **Fuite mémoire Capacitor listeners** : `nativeGPSService.setupListeners()` ne stockait pas les handles retournés par `RecordingPlugin.addListener()`, empêchant le cleanup des 3 listeners (onNewPoints, onLocationUpdate, onServiceStopped). Fix : stockage dans tableau `_listenerHandles[]` et cleanup systématique avant `removeAllListeners()`.
- **Listener orphelin iapService.addListener('message')** : Le listener créé dans `purchase()` pour la modale guest persistait si l'utilisateur naviguait pendant l'attente. Fix : fonction `cleanup()` centralisée + event `pagehide` comme filet de sécurité. Stockage dans `_purchaseCleanup` pour cleanup dans `resetForTest()`.
- **Promesses fire-and-forget silencieuses** : `iapService.initialize()`, `packManager.syncPackPurchases()`, `packManager.mountPack()` n'étaient pas loggées en cas d'échec. Fix : logging DEBUG en cas d'erreur.
- **Erreurs géométrie bâtiments non loggées** : Catch vides dans `buildings.ts` empêchaient de détecter les erreurs de rendu. Fix : warn DEBUG sur `renderBuildingsPBF()` et `createBuildingManualGeometry()`.
- **npm audit : 7 vulnérabilités** : @xmldom/xmldom (3 high), fast-xml-parser + postcss + protocol-buffers-schema (4 moderate). Fix : `npm audit fix` (ajout @xmldom@>=0.8.13, fast-xml-parser@>=5.7.0, etc.). 0 vulnérabilité restante.

### Added

- **Tests haptics, theme, toast, weatherUtils** : Couverture complète des 4 modules manquants. +66 tests (814 total, 90 fichiers).
- **Centralisation clés localStorage** : Nouveau fichier `src/constants/storage.ts` avec 14 clés `suntrail_*` (SETTINGS, PRO, ORS_KEY, ACCEPTANCE_V1, GPS_DISCLOSURE_V1, ONBOARDING_V2, RECORDED_POINTS, CURRENT_COURSE_ID, RECORDING_START_TIME, PACK_STATES, PACK_CATALOG, BATTERY_EXEMPTION, REC_SNAPSHOT_V1, UPSELL_LAST_SHOW). Migré dans 9 modules (state, packManager, nativeGPSService, etc.).
- **Logging ui/mobile.ts** : App listeners (backButton, appStateChange) loggent en DEBUG.

### Changed

- **appInit.test.ts, nativeGPSService.persistence.test.ts** : Mocks `iapService.initialize` et `RecordingNative.addListener` retournent maintenant Promise (au lieu de void) pour être compatibles avec `.catch()` et `.then()`.

## [5.54.1] - 2026-05-06

### Fixed

- **CI release Android (régression v5.53.8)** : Le workflow GitHub Actions ne passait pas `CAPACITOR=true` lors du build Vite, générant des chemins d'assets absolus (`/suntrail_threejs/...`) incompatibles avec la WebView Android. Résultat : page blanche sur mobile (Google Play) alors que les builds Android Studio fonctionnaient. Fix : ajout de `CAPACITOR: true` dans les env du step "Build web (Vite)" de `release.yml`.

## [5.54.0] - 2026-05-06

### Added

- **Freemium multi-tracés GPX** : Remplacement du gate binaire (`state.gpxLayers.length >= 1`) par une logique basée sur l'index. Utilisateurs Free peuvent importer illimité de tracés GPX, mais seul le 1er est sélectionnable/visible 3D/exportable (teasing).
- **Distinction routes manuelles** : Nouveaux champs `isManualRoute?: boolean` dans `GPXLayer` et option dans `addGPXLayer()`. Routes planificateur exclus du comptage des imports GPX (jamais verrouillées en Free).
- **Verrouillage UI par index** : Tracés importés 2+ affichent cadenas + couleur doré en Free. Clic ou sélection → `showUpgradePrompt('multi_gpx')`. Export aussi verrouillé pour multi-GPX.
- **Visibilité 3D conditionnelle** : `initialVisible = forceVisible || isManualRoute || isProActive() || isFirstImport`. Routes manuels + 1er import toujours visibles. Multi-imports masqués visuellement en Free (mais présents en mémoire).
- **Feedback import visible** : Toast de succès après import réussi. Toast + console.error si import échoue (au lieu du silence total).

### Fixed

- **Bug : import GPX bloqué avec route manuelle existante** : Le gate `state.gpxLayers.length >= 1` (ancien code v5.53.x) bloquait l'import du 1er GPX si une route manuelle était en mémoire. Résolu en supprimant le gate et en filtrées les tracés par `isManualRoute`.
- **Export cadenas même pour le 1er tracé Free** : Bouton export montrait cadenas + upgrade prompt pour TOUS les Free. Maintenant : cadenas seulement sur les tracés verrouillés (2+). 1er tracé est entièrement exploitable en Free.
- **Import échoue silencieusement** : Si `addGPXLayer` levait exception, rien n'était affiché. Maintenant : toast + console.error visible.

### Changed

- **gpxLayers.ts** : `addGPXLayer()` signature étendue (`{ silent?, forceVisible?, isManualRoute? }`). Logique visibilité 3D + anti-actif pour tracés verrouillés. Import `isProActive` ajouté.
- **gpxService.ts** : Gate freemium supprimé (ligne ~25). Import autorisé pour tous jusqu'à 10 tracés. Toast succès après ajout. Imports inutilisés supprimés.
- **routingService.ts** : Routes via ORS/Dénivélé passent `isManualRoute: true` à `addGPXLayer()`.
- **TrackSheet.ts** : Refonte `renderLayersList()` — index-based locking + export lock cohérent (seuls tracés `isLocked = true` bloqent export). Catch import silencieux → toast + console.error. Import `lngLatToWorld` supprimé (inutilisé).
- **state.ts** : `GPXLayer.isManualRoute?: boolean` (optionnel pour compatibilité).
- **Tests** : `routingService.test.ts` et `gpxService.test.ts` mis à jour pour v5.54 (appels `addGPXLayer` avec options, gate suppr). 765 tests passent.

## [5.53.10] - 2026-05-06

### Fixed

- **Pastille GPS en 3D** : Offset vertical réduit de +10 à +2 unités monde. L'ancienne valeur créait un décalage de parallaxe visible sous angle oblique, donnant l'impression que la pastille était à côté du chemin.
- **Graphique de profil bloqué à 2fps** : `state.isInteractingWithUI` n'était pas inclus dans `isIdleMode`. Le deep sleep (1.5fps) se déclenchait même lors d'une interaction avec le graphique, bloquant le rendu avant la vérification de `needsUpdate`.
- **Bouton Se connecter / S'inscrire** : Remplace le `btn-secondary` générique et l'emoji 👤 par un design cohérent avec le thème bleu — gradient `var(--accent)`, icônes SVG `ICON_LOG_IN` / `ICON_LOG_OUT` / `ICON_USER`, avatar avec fond bleu. État déconnecté : bouton bleu plein. État connecté : bouton neutre avec icône logout.

### Changed

- **icons.ts** : 3 nouvelles icônes — `ICON_USER`, `ICON_LOG_IN`, `ICON_LOG_OUT`.

## [5.53.9] - 2026-05-06

### Fixed

- **Animation solaire fluide rétablie** : Le passage à `setInterval(200ms)` en v5.53.8 causait une animation saccadée (5 Hz visible). Retour à l'animation rAF-driven (60 fps) avec timer indépendant pour vitesse frame-rate-indépendante. Sun position updated immédiatement avant rendu du même frame.
- **FPS drop après flyTo** : `lastInteractionTime` n'était jamais réinitialisée quand `isFlyingTo = false`, causant un throttle immédiat à 20fps (ou 1.5fps en deep sleep). Grace period de 800ms ajoutée après la fin du vol.
- **Slider figé pendant animation** : `syncUI()` avait un guard `!state.isSunAnimating` qui gelait le slider. Guard supprimé — slider suit maintenant l'heure en temps réel.
- **Avancement du temps en onglet caché** : `setInterval` continuait d'avancer `simDate` quand `document.hidden = true`. Guard `if (document.hidden) return;` ajouté (bien que setInterval soit maintenant supprimé en faveur du rAF).

### Changed

- **Architecture animation solaire** : Déplacée du `setInterval(200ms)` de TimelineComponent vers la boucle de rendu (scene.ts). Accumulateur `sunAnimFractMins` pour précision sub-minute. Subscriber `simDate` n'appelle `updateSunPosition` que hors animation (la boucle de rendu s'en charge pendant animation).
- **Tests** : 7 nouveaux tests pour TimelineComponent (slider, updateSunPosition, button state) et scene.ts (flyTo grace period). Total: 765 tests (757 + 8 nouveaux).

## [5.53.5] - 2026-05-05

### Changed

- **Restructuration panneau Parcours** : Bouton REC/STOP ne change plus de position lors du basculement. Bannière PRO déplacée après les actions (plus avant les stats). Import GPX et liste des tracés masqués pendant l'enregistrement pour réduire la distraction. Nouvel indicateur REC en top bar basé sur CSS (dot animé) au lieu de l'emoji 🔴.

### Fixed

- **Bouton REC sautant visuellement** : La bannière PRO était injectée avant `.track-stats`, décalant tout le contenu vers le bas. Elle est maintenant insérée après `.track-actions`, stabilisant la position du bouton REC/STOP.

### Icons

- **SVG remplace tous les emojis dans la liste des tracés importés** : Les icônes 📈(profil), 👁/🚫(visibilité), 💾(export), ⏱️(durée) et 📥(import GPX) sont remplacées par des icônes SVG Lucide-style. Cohérent avec la modernisation v5.53.8.
- **Locales i18n** : Emojis retirés des clés `track.btn.import`, `track.btn.export` dans les 4 locales (fr, en, de, it). Le test E2E `tracksheet.test.ts` mis à jour pour utiliser `data-visible` au lieu du texte emoji.

## [5.53.4] - 2026-05-04

### Added

- **Paiements web via RevenueCat + Stripe** : Les utilisateurs web peuvent maintenant acheter Pro (mensuel, annuel, lifetime) et les packs pays (Suisse, France Alpes) directement via Stripe Checkout, au lieu d'être redirigés vers Play Store.
- **SDK web RevenueCat** : `@revenuecat/purchases-js` chargé dynamiquement sur web (pas sur Android). App User ID persistent dans localStorage.
- **Cohérence web/Android** : Pack Suisse HD est maintenant **payant sur web** (était gratuit en v5.53.3). Gating des features Pro identique web/Android.

### Changed

- **Masquage offline sur web** : La section "Télécharger zone" est cachée sur web car le stockage OPFS n'est pas disponible dans un navigateur. Les zones restent téléchargeables sur Android.
- **Révocation packs sur web** : `syncPackPurchases()` réinitialise d'abord tous les états `purchased` en localStorage avant de les re-confirmer via RevenueCat. Élimine les auto-unlocks résiduels de v5.53.3.

### Fixed

- **Entrée gratuite Pack Suisse sur web** : Suppression du code qui auto-débloquait Pack Suisse pour tous les utilisateurs web.

## [5.53.3] - 2026-05-04

### Fixed

- **Point profil sur carte** : Le marqueur cyan (sphère 3D synchronisée avec le survol du graphique d'élévation) disparaissait après fermeture et réouverture du panel "Profil et pentes". La création du `profileMarker` était bloquée par le flag `profileInteractionsAttached` qui n'était jamais réinitialisé dans `closeElevationProfile()`. Fix : la création du marker est maintenant placée avant le garde, indépendamment de l'état des event listeners.

## [5.53.2] - 2026-05-03

### Fixed

- **Exemption batterie opt-in** : Au premier démarrage de REC, Android ouvre le dialogue "Désactiver l'optimisation batterie pour SunTrail". Mémorisé dans localStorage — une seule demande. Corrige le kill agressif par OEM (Samsung/Xiaomi/OPPO) qui ignoraient `stopWithTask=false`. Remet la permission `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` retirée en v5.40.14.
- `RecordingPlugin.java` : `requestBatteryOptimizationExemption()` rétablie.
- `nativeGPSService.ts` : méthode + interface TypeScript rétablies.
- `recordingService.ts` : appel opt-in avec guard `localStorage` (une seule fois).

## [5.53.1] - 2026-05-03

### Fixed

- **OEM agressifs (Samsung/Xiaomi/OPPO)** : `onTaskRemoved()` dans `RecordingService` replanifie un redémarrage via `AlarmManager` (1s délai) si l'OS tue le service au swipe. Corrige la perte de trace partielle observée sur certains appareils.
- **Permission `SCHEDULE_EXACT_ALARM`** ajoutée au Manifest pour le redémarrage AlarmManager.

## [5.53.0] - 2026-05-03

### Fixed

- **Foreground Service survit au kill de l'app** : Processus Android séparé `:tracking` pour `RecordingService` + `TrackingActivity`. Communication via Broadcasts (`ACTION_POINTS_UPDATED`, `ACTION_SERVICE_STOPPED`) au lieu d'interface statique cross-processus. État partagé : fichier `rec_state.json` dans `filesDir`. Room SQLite : `enableMultiInstanceInvalidation()` pour synchronisation cross-processus. Impact: GPS continue même après swipe de l'app des recents (v5.52.9 tuait les deux processus).

### Changed

- `RecordingService.java` : Plus d'interface `RecordingCallback` statique. Broadcasts + JSON state file.
- `RecordingPlugin.java` : `BroadcastReceiver` au lieu d'implémentation `RecordingCallback`.
- `AndroidManifest.xml` : Ajout `android:process=":tracking"` sur Service + TrackingActivity.

### Tests

- Tests existants inchangés (744 tests vitest passent).

## [5.52.9] - 2026-05-03

### Fixed
- **Détection forêt globale** : Pré-fetch des tuiles landcover Z10/Z14 avant analyse solaire élimine cache-froid. Fonctionnalité détection forêt maintenant opérationnelle hors Suisse (MapTiler Z10).

## [5.52.8] - 2026-05-02

### Added
- **Détection de forêts dans analyse solaire** : Nouvelle couleur verte (forêt/canopée) dans bande solaire du profil et overlay 3D. Réutilise `isPointInForest()` depuis `landcover.ts` (cache partagé avec arbres 3D). Fallback silencieux si cache froid.
- **Heure estimée au profil** : Survol du graphique d'élévation affiche l'heure d'arrivée estimée (mode hikerTimeline) ou l'heure du slider (snapshot).
- **Info forêt dans panel** : Ligne `🌲 X km sous forêt` sous grille stats si tracé traverse zone boisée.
- **Fix alerte exposition UV** : Forêt exclue du calcul "forte exposition" (pas d'UV direct sous les arbres).

### Fixed
- **Mercator distortion** : Profile.ts corrige écart distance vs route-bar via facteur `stats.distance/cumulativeDist`, rescale aussi les pentes inversement.
- **solarRoute stats** : `sunPct` maintenant = soleil direct / total km (forêt et nuit exclus, vrai % de soleil).

### Tests
- Added 3 tests forestKm (buildAnalysis), total 750 tests.

## [5.52.7] - 2026-05-02

### Fixed
- **Crash solarRoute** : Guards `samples` vide, `originTile` null, `catch (e: any)`→`unknown`.
- **Fuites mémoire** : 8 subscriptions routeManager stockées + disposeRouteManager(), subscribe originTile déplacé dans lifecycle location.ts, dispose Three.js compass + marker profile, MutationObserver TimelineComponent disconnect.
- **Version sync** : `build.gradle` versionName 5.52.5→5.52.7, versionCode 793→794.
- **Script cassé** : `audit:i18n` → `python scripts/audit_i18n.py`.
- **Nettoyage code mort** : Système Overpass mort (135 lignes), `clearAllGPXLayers`, `buildQueue` export.
- **CSS mort** : 287 lignes de classe `rp-*` (Route Planner Sheet) supprimées.

### Added
- **Tests solarRoute.ts** : 25 tests unitaires (sampleRoutePoints, buildAnalysis, cache, mode/speed, gardes).
- **GPX_SURFACE_OFFSET** : Constantifiée dans `analysis.ts`, importée par `gpxLayers.ts` et `solarRoute.ts`.

### i18n
- **de.json / it.json** : 25 clés manquantes ajoutées (`solarRoute.*`, `peaks.*`, `track.stats.duration`, etc.).
- **it.json** : 9 corruptions FR corrigées.
- **en.json** : 2 clés extra de `fr.json` ajoutées.
- **fr.json** : `track.btn.import` et `weather.stat.uvIndex` traduits.

- Sentiers Suisse (SwissTopo) : affichage restreint aux niveaux de zoom 13 et supérieurs (LOD 13+).

## [5.52.6] - 2026-05-02

### Added
- Solar Analysis panel: Instructional hint "Click the terrain first" removed for cleaner UI.

### Fixed
- UI Mobile: Elevation Profile header layout (Title/Analysis button) and stat line.
- UI Mobile: Solar Analysis panel time slider layout and redundancy cleanup.
- Bug: Fixed `ReferenceError: timeBadge is not defined` in Solar Analysis panel.

## [5.52.5] - 2026-05-02

### Fixed
- Test `routingService.test.ts` : expectations `ele` mises à jour après le changement `orsResponseToPoints` (ele forcé à 0).

## [5.52.4] - 2026-05-02

### Fixed
- **D+/D− tracé manuel erroné (823m au lieu de 305m)** : `recalcLayerStatsFromTerrain()` utilisait `getAltitudeAt()` qui retourne 0 pour les tuiles terrain non chargées. L'algorithme d'hystérésis voyait des chutes 400→0→400 et les comptait comme D+ fantômes. Fix : interpolation linéaire des trous d'altitude entre les points valides voisins (résultat immédiat, converge vers l'exact quand les tuiles chargent).
- **ORS elevation supplantait le terrain** : `computeRoute()` utilisait l'altitude de l'API ORS (DEM SRTM) au lieu du terrain local via `_computeDrapedResult()`. Fix : les deux chemins (ORS/OSRM) passent maintenant par `recalcLayerStatsFromTerrain()`.
- **Guard `estimatedTime > 0` bloquant la re-correction** : Le guard ajouté en 4f83e7e empêchait le recalcul correctif après chargement des tuiles. Supprimé — seul le guard `hasRawElevation` est conservé (GPX importé).

## [5.52.3] - 2026-05-02

### Fixed
- **Solar Route — départ optimal** : Double bug dans `analyzeOptimalDeparture()` : (1) utilisait `pt.y ≈ 12` (altitude GPX drappée avant tuiles) → tout détecté comme ombre → score 0% pour tous les créneaux → résultat `00h00 → 0%`. Fix : utiliser `getAltitudeAt(pt.x, pt.z) + 12` comme dans `analyzeRouteSolar()`. (2) Durée parcours hardcodée à 2h pour tous les tracés → heures d'arrivée fausses sur 30-40min. Fix : calculer durée réelle = `totalDistKm / avgSpeedKmh`.
- **Profile interaction mobile** : `setPointerCapture` introduisait des effets de bord. Solution robuste : `touch-action: none` sur le container empêche le browser d'intercepter le scroll natif, donc `pointercancel` n'est jamais déclenché pendant le drag. Revenir à event listeners 9d4b4d4 (sans setPointerCapture).

## [5.52.2] - 2026-05-02

### Added
- **GPX import limit** : Free = 1, Pro = 10. Message toast + haptic quand le max est atteint. Prévient la surcharge GPU/CPU mobile.
- **ORS key UI** : Lien d'inscription (openrouteservice.org) sous le champ clé dans les réglages. Feedback toast à l'enregistrement (validé / invalide).
- **Détection Suisse** : Si les waypoints sont en Suisse sans clé ORS, un toast suggère d'ajouter une clé OpenRouteService pour les sentiers de randonnée.
- **i18n** : Clés `gpx.limitPro`, `routePlanner.toast.invalidKey`, `routePlanner.hint.orsSwiss` ajoutées aux 4 locales (FR, EN, DE, IT).

### Perf
- **Rebuilds redondants supprimés** : `setTimeout(updateAllGPXMeshes, 3000)` retiré de `addGPXLayer` (déjà couvert par le trigger `isProcessingTiles`). Passe de 3 rebuilds par nouveau tracé à 2.
- **`recalcLayerStatsFromTerrain()` skip** : Ne recalcule pas les stats si D+ > 0 et provient de données fiables (GPX importé) ou déjà recalculé (OSRM avec `estimatedTime > 0`). Évite le recalcul inutile lors des rebuilds multiples.

## [5.52.1] - 2026-05-02

### Fixed
- **D+/D− et profil 2D** : Le calcul des stats utilisait `v.y` (position visuelle forcée à 12 en 2D). Utilise maintenant `getAltitudeAt()` directement — indépendant du mode 2D/3D.
- **Stats GPX importés écrasées** : `recalcLayerStatsFromTerrain()` préserve les stats d'origine des GPX importés (qui ont des élévations brutes réelles). Seuls les layers OSRM sans élévation sont recalculés.
- **Pinch-zoom ajoutait des waypoints** : Le long-press détecte maintenant les gestes multi-touch et annule le timer quand un 2e doigt est présent.
- **Parcours non synchronisé** : `TrackSheet` appelle `updateStats()` sur chaque changement de `gpxLayers`, et `updateBar()` est appelée (via `renderBar()`) après mise à jour des stats layer.
- **Inclinomètre caché par route-bar** : Remonté en haut de l'écran via CSS `body.route-planner-active #inclinometer-widget`.

### Changed
- **Refactor** : `recalcLayerStatsFromTerrain()` extrait comme source unique de vérité pour le calcul D+/D− depuis le terrain. Utilisé par `_computeDrapedResult`, `_doUpdateAllGPXMeshes`, etc.
- **D− ajouté** dans la barre (`↓Zm`) et dans la liste des tracés du Parcours.

### Added
- **Limites de distance** : Free = 25 km, Pro = 500 km. Vérifié dans `computeRoute()` avant appel API.
- **Reverse geocode waypoints** : Les noms de lieux sont résolus automatiquement après un long-press, avec cache et throttle 1.5s.
- **Nettoyage code** : `reverseGeocodeWaypoint` mort supprimé, `GPX_SURFACE_OFFSET` unifié à 12.

## [5.52.0] - 2026-05-02
### Added
- Refonte complète du tutoriel d'onboarding (v6.0) :
  - Immersion totale plein écran avec flou d'arrière-plan.
  - Structure en 6 slides pédagogiques.
  - Animations SVG conceptuelles et mockups UI réels.
  - Menu de démarrage actionnable (Explorer, Importer, Chercher).
  - Internationalisation complète (FR, EN, DE, IT).
- Roadmap mise à jour : analyse solaire détaillée sur GPX/manuels planifiée pour la v6.2.

- **Stats OSRM à 0** : Les stats (D+/D-, temps) sont recalculées depuis les points drapés sur le terrain pour les routes OSRM (sans élévation API). Les routes ORS conservent leurs stats API.
- **Auto-flyTo intempestif** : Nouveau paramètre `{ silent: true }` dans `addGPXLayer()`. Les calculs d'itinéraire automatiques n'émettent plus l'événement `flyTo`, évitant le saut de caméra pendant la pose de waypoints.
- **Placement 2D décalé** : En mode 2D, l'intersection se fait avec le plan y=0 au lieu du `findTerrainIntersection` 3D, qui utilisait l'altitude réelle du relief.
- **Profil recouvert par route-bar** : Ajout CSS `body.route-planner-active #elevation-profile` pour remonter le panneau au-dessus de la barre d'itinéraire.
- **Race condition auto-compute** : Compteur de génération annulant les calculs concurrents (2e appel annule le 1er).
- **i18n missing** : Clés `routeBar.computing` et `routeBar.onePoint` ajoutées aux 4 locales.
- **Nominatim conformité** : L'appel raw a été remplacé par `getPlaceName()` via `geocodingService.ts`, respectant User-Agent et rate limits.
- **Filtre d'intersection long-press** : Le long-press ignore les GPX tracks et waypoint-markers existants.
- **D− ajouté à la barre** : Affichage `↓Zm` dans `rb-info`.
- **Inclinomètre caché par route-bar** : Ajout CSS `body.route-planner-active #inclinometer-widget` pour le remonter en haut de l'écran.
- **Code mort** : Suppression de `reverseGeocodeWaypoint` (plus utilisé depuis v5.51.0).
- **Noms de waypoints** : Reverse geocode automatique après long-press via `getPlaceName()`, avec cache et throttle 1.5s.
- **Offset 2D sprites** : Aligné sur `GPX_SURFACE_OFFSET` (12) au lieu de 2.
- **Limites de distance** : Free = 25 km, Pro = 500 km. Vérifié dans `computeRoute()` avant appel API. Clés i18n dédiées.

### Changed

- **Sprite scaling** : Formule révisée `20 × 2^(17-zoom)`. Sprites plus grands à bas LOD (160@14) vs (80@14) avant, masqués en dessous de LOD 14. Hauteur flottante proportionnelle.
- **D+ API ignoré** : ORS conserve ses stats d'élévation API. OSRM recalculé depuis le terrain drapé.

## [5.51.2] - 2026-05-02

### Fixed

- **Sprites adaptatifs** : Échelle basée sur le zoom (formule `20 × 2^(16-zoom)`) pour visibilité à tous les niveaux. À zoom 10-12 (vue 2D), sprites de 1.2km visibles ; à zoom 16+, 20-30m. Élimine l'invisibilité en mode 2D et adapte automatiquement.
- **Stats unifiées (route bar = Parcours)** : `computeRoute()` retourne maintenant `layer.stats` (haversine distance, D+ hystérésis, temps Munter) au lieu des valeurs API. Ancien temps ORS (1h28 pour 7.4km/590m) était irréaliste ; Munter (3h05) cohérent partout.

## [5.51.1] - 2026-05-02

### Fixed

- **Parallaxe sprites + LOD** : Ajout subscribes à `originTile` + `ZOOM` + `IS_2D_MODE` + `isProcessingTiles` pour que `rebuildMarkers()` soit appelée quand le contexte change. Les sprites suivent maintenant le pan de caméra et s'adaptent lors du changement de LOD.
- **Sprites flottants en 2D** : `getAltitudeAt()` retourne l'altitude exagérée (~2400m) mais en 2D le terrain est à y=0 → sprite utilisait `h + 18` (flottait massivement). Fix : `h = state.IS_2D_MODE ? 0 : getAltitudeAt(...)`.
- **Boucle bouton illisible** : Checkbox native cachée (opacity:0, width:0), label stylé comme pill-bouton clair. CSS sibling selector `#rs-loop:checked + .rs-loop-btn` pour l'état actif.
- **Stats Parcours 0.00 km** : `buildGPXCompatibleData` assignait le même timestamp ISO à tous les points → `cleanGPSTrack` les considérait comme doublons (< 2 points unique) → distance=0. Suppression du champ `time` ; fallback `i*1000` dans `addGPXLayer` garantit l'unicité.

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
- **Menus (High/Ultra)** : Correction de la transparence (glassmorphism) — uniformisation de l'opacité (0.95) pour une lisibilité constante en mode portrait et paysage, quel que soit l'appareil.
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
