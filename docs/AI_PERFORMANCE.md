# AI Performance & Constants Guide (v5.88.0)

Dictionary of "Magic Numbers" and thresholds used in SunTrail.

## v5.88 — bilan A53/S23 clôturé le 2026-09-06

La release stabilise le suivi 3D, allège le mode 2D, fiabilise cache, transitions,
préchargement et indicateur de chargement, puis corrige STOP REC et les animations cachées.
Les contrôles A53/S23 sont positifs. Le p95 du scénario de rebond A53 passe de 109,4 à
23,8 ms et les transitions S23 contrôlées d'environ 16–17 s à 0,9 s. La comparaison terrain
S23/Garmin sur 2,76 km ne montre aucune portion perdue. Ces mesures ne constituent pas une
mesure GPU globale ni une preuve d'autonomie ; le contrôle long faible réseau reste un suivi
post-release. Les paragraphes suivants conservent l'historique détaillé des mesures locales.

**CPU résiduel, contrôle court du6septembre :** profil JavaScript majoritairement idle,
activité des threads WebView/composition/rendu Android. Pause temporaire du cadencement
Three.js : CPU hôte+WebView76,5→57%, puis71,5→61% ; retour à74,5% après reprise.
Indice reproductible sur fenêtres courtes, aucun gain produit installé pour ce point.
La correction doit préserver les réveils et adapter le watchdog au repos volontaire.
[Profil et limites](../outputs/v5.88-a53-resources-20260906-1249/RESIDUAL_CPU.md).

**Lot animations installé surA53 :** pause/reprise confirmées dans la WebView, trois archives
inchangées. CPU moyen hôte+renderer101,75→73,75% d'un cœur sur deux échantillons par état.
Redémarrage, cache et surface visible différents : comparaison indicative, pas gain causal
global qualifié.2D stable8s sans rendu/chargement, mais CPU résiduel présent.
[Contrôle installé](../outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_INSTALLED.md).

**Animations invisibles :** zéro rendu Three.js n'implique pas zéroCPU. SurA53, barre
opacity0 et spinner dans une fiche fermée restent animés ; pause temporaire des deux
réduit le CPU cumulé97,25→80,5% dans une fenêtre courte. Correctif CSS7lignes : pause
quand caché, reprise quand visible ; contrôle Chromium avant/après positif,1751tests verts.
L'installation et le gain réel après correction restent à valider séparément.
[Correction](../outputs/v5.88-a53-resources-20260906-1249/ANIMATIONS_READY.md).

**Dernier lot installé :** cache3D autorisé/installé surA53, Pro/Équilibré.
22puis20restaurations avec mêmes textures. Transitions encore3/4longtasks par fenêtre10s,
non directement comparables à la baseline. Couverture transitoire incomplète aux bords,
captures natives ; aucune clôture du gate visuel.
[Résultats](../outputs/v5.88-morning-20260906/CACHE3D_INSTALLED.md).

**Reprise après recharge6septembre :** A53 48%, Pro/Équilibré/DPR1,2 confirmés ;
28hits cache2D sans rechargement. En3D,7tuiles repartent dans le chargement malgré textures
présentes. Récupération depuis leur bitmap :8tampons identiques au worker,2,3–3,3ms chacun.
Correctif local1751tests/7E2E : récupération répartie entre frames, repli en cas d'échec,
pas de restauration pour le préchargement invisible déjà en cache. Nouvelle installation
encore attendue ; aucun gainp95 global ni gate de couverture bleue acquis.
[État courant](../outputs/v5.88-morning-20260906/CACHE3D_READY.md).
Les relevés de pause ci-dessous restent historiques.

**Dernier contrôle6septembre :** APK finalisation/cache2D installée surA53 ; archive/export
du test REC+Guidance identiques sur10points. Batterie sous20% → ECO automatique : aucune
comparaison Équilibré acquise pour la dernière fenêtre cache2D. Mesures suspendues jusqu'à
recharge et preset vérifié. [Détails](../outputs/v5.88-morning-20260906/INSTALLATION.md).

**6septembre :** balade REC+Guidance jugée correcte dans la version publiée, pas Diagnostic.
ExportSTOP368points contre371archivés : finalisation WebView corrigée localement sans toucher
au GPS natif.1744tests/7E2E verts, APK prête non installée. Voir
[RESULTATS.md](../outputs/v5.88-morning-20260906/RESULTATS.md).

**Actualisation :** APK couverture installée mais fond bleu confirmé visuellement ; les compteurs
de meshes seuls ne constituent pas un gate visuel.11rechargements de textures déjà en mémoire
confirmés en2D pour des pixelsCPU réservés aux objets3D ; condition corrigée localement,
1741tests verts, non installée. Voir [COVERAGE_RESULTS.md](../outputs/v5.88-a53-return-20260905/COVERAGE_RESULTS.md).

**Lot dézoom préparé, non installé :** 55 anciens meshes supprimés avant toute nouvelle
tuile sur A53, trou confirmé à105/254ms. Rétention jusqu'au parent opaque corrigée localement,
bornée à une génération en attente ;1739tests/7E2E verts. Voir
[COVERAGE_READY.md](../outputs/v5.88-a53-return-20260905/COVERAGE_READY.md).

**Après installation autorisée du lot préchargement surA53 :** retour au repos avec route3D,
sans sessions : barre inactive100/100échantillons, aucun chargement sur20s. Suivi3D seul :
0longtask/20s ; modecombiné :15longtasks/20s, p95CPU25,3ms, donc fluidité encore non validée.
Fonds bleus transitoires lors des zooms à traiter. Archive de test3points/empreintes préservées.
Voir [résultats et limites](../outputs/v5.88-a53-return-20260905/INSTALLATION_RESULTS.md).

Suite au signalement de barre persistante sans suivi/REC : relevé20s avec aucun nouveau
Tile.load, mais isProcessingTiles et barre actifs100/100échantillons. Correction locale de
la finalisation du compteur, distincte du préchargement répété précédent. Préchargement désormais
limité à une sélection stable selon le budget restant après réservation des tuiles visibles/pending.
Plafonds des presets inchangés ; pas de neutralisation globale du préchargement.
1734tests et7E2E verts ; APK prête, installation et gain appareil encore non validés.
Voir [preuves et APK](../outputs/v5.88-a53-return-20260905/PREFETCH_READY.md).

Dernier contrôle A53 Diagnostic (APK cache/fondu, Pro Équilibré DPR1,2) : route synthétique
2500points + Guidance + REC immobile, suivi3D. Fenêtre19:24:32–19:30:14 UTC (~342s) :
363longtasks cumulées/28,264s,5917rendus ; sur les1800derniers rendus, p95 de soumissionCPU
28,8ms et intervallep9593,6ms. LOD17 et ressources stables, pas de rebond observé.
Le gate sans longues tâches récurrentes échoue ; le run30min a donc été interrompu,
avec limitation des nouvelles investigations à la demande du propriétaire sur le coût en tokens.
Pas de comparaison T15/T30, ni de conclusion d'autonomie. Un seul point natif accepté sur table :
STOP a répondu et laissé Guidance active, puis Guidance a été arrêtée séparément ; état Android
final `none` confirmé. Pas d'archive créée (`too-short`), point de test conservé localement.
Le retour non vide de stopRecording ne prouve pas une sauvegarde ; consulter getLastStopOutcome.
Les preuves et prochaines étapes sont dans
[la reprise A53](../outputs/v5.88-a53-return-20260905/REPRISE.md).

Version publiée : 5.88.0 / Android 908. Les relevés initiaux et les correctifs
autorisés sont documentés dans [BASELINE.md](../outputs/v5.88-a53-baseline-20260905-152744/BASELINE.md)
et [PHASE2.md](../outputs/v5.88-a53-baseline-20260905-152744/PHASE2.md).
L'[inventaire des dépendances](../outputs/v5.88-a53-baseline-20260905-152744/DEPENDENCIES.md)
est séparé ; aucune dépendance n'a été mise à jour.

- **Rebond du suivi 3D prouvé sur A53** : terrain temporairement absent pris pour une altitude
  zéro, déplacement vertical de caméra et alternance LOD 17/18. `getTerrainAltitudeAt`
  distingue absence et zéro réel ; le suivi conserve la dernière hauteur valide et partage
  les plafonds de tilt avec la scène. Le GPS et les archives ne sont pas modifiés.
- **Contrôle caméra** : p95 de soumission CPU `renderer.render` 109,4 → 23,8 ms, puis
  LOD 17 et ressources stables sur 141,5 s dans la copie Android isolée. Ce résultat porte
  sur le rebond immobile, sans route/REC/Guidance actifs, et n'est ni un temps GPU ni un
  gain global du mode combiné. Le propriétaire confirme la stabilité visuelle.
- **2D** : ombres, particules météo et demande d'animation de l'eau désactivées ; les
  valeurs Équilibré/Fluide/Ultra restent conservées pour le retour en 3D. Le rendu permanent
  du suivi reste à profiler séparément, avec protection contre une adaptation DPR qui
  interpréterait les pauses volontaires comme de mauvaises performances.
- **DPR au repos** : défaut reproduit sur S23 (Fluide, 1,5 → 1,0) et corrigé : les fenêtres
  de rendu volontairement espacées ne déclenchent plus l'adaptation. Trois tests couvrent
  repos, interruption et vraie surcharge/restauration. Sur S23 Diagnostic, Fluide reste à
  DPR1,5 pendant les contrôles 2D/3D et zooms après reprise.
- **Cache et fondu S23** : lire les ressources déjà en CacheStorage avant un pack distant,
  sans considérer l'index initial comme exhaustif après des écritures workers. Le fondu
  conserve le temps des RAF sautés et les tuiles en traitement/fondu empêchent le repos profond.
  Sur la transition contrôlée 17→15, 90% des tuiles deviennent opaques en0,89s au lieu de
  16,3–17,0s. Sur15→16, environ0,90s au lieu de16,34s ; les meshes existaient déjà en moins
  d'une seconde avant correction. Ce sont des mesures de disponibilité visuelle avec cache,
  pas un gain FPS/GPU global ni une validation du réseau faible. Les zooms par événements
  de contrôles passent en2D/3D, avec de brèves phases incomplètes conservées entre LOD.
  [Preuves et reprise](../outputs/v5.88-post-walk-20260905/REPRISE.md).
- **Gates ouverts** : route courte/longue et REC combinés, faible réseau/zone locale,
  30 minutes T0/T15/T30, intégrité/récupération sur appareil et contrôle S23. Les relevés
  USB sous charge et BatteryStats cumulatif ne prouvent aucun gain d'autonomie.

## 0. Correctifs terrain v5.85.1

| Optimisation | Valeur / comportement | Fichier |
| :--- | :--- | :--- |
| Boussole idle | rendu uniquement dans une frame carte utile, maximum 30 Hz | `scene.ts` |
| Mesh REC live | entrée bornée à 2 500 points, rebuild long débouncé à 5 s | `gpxLayers.ts`, `nativeGPSService.ts` |
| Recovery REC | snapshot Preferences débouncé à 15 s, flush background/STOP | `nativeGPSService.ts`, `ui/mobile.ts` |
| Stats REC notification | au plus toutes les 30 s et seulement si le nombre de points change | `nativeGPSService.ts` |
| Cache textures | remplacement traité comme éviction de l'ancienne valeur | `boundedCache.ts`, `tileCache.ts` |
| Prefetch LOD | clé source active, tuile cache-only non épinglée, déduplication in-flight | `terrain.ts`, `terrain/Tile.ts`, `terrain/tileQueue.ts` |
| Guidage natif | projection dans la fenêtre 35 m arrière / 600 m avant avec fallback exact ; Room au plus toutes les 10 s sur fixes acceptés | `GuidanceEngine.ts`, `GuidanceEngine.java`, `RecordingService.java` |
| Polling UI | stockage événementiel, inclinomètre Free sans intervalle, focus recherche événementiel | `ui.ts`, `InclinometerWidget.ts`, `SearchSheet.ts` |

## 1. Map & Terrain Performance

## 1a. Startup Path (v5.81.2)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **First terrain tile signal** | `tileQueue.ts`, `appInit.ts` | The loading overlay is dismissed when the first 3D tile mesh is built instead of waiting for the complete initial batch. The tile progress bar remains active. |
| **Deferred RevenueCat web SDK** | `vite.config.mts` | The IAP web SDK stays in a dynamic chunk and is excluded from the initial module preload and PWA precache. |
| **Non-blocking cache cleanup** | `tileLoader.ts` | Old-version cache deletion runs in the background; opening current caches remains on the critical path. |
| **Single Gist request** | `config.ts` | Concurrent MapTiler and ORS configuration lookups share one in-flight request. |
| **Single pack disk scan** | `packManager.ts` | Pack state restoration scans OPFS once during initialization. |

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `BUILD_BUDGET_MS` | 10ms | `tileQueue.ts` | Max time per frame spent mounting meshes. Prevents micro-stutter on mobile. |
| `TILE_CACHE_SIZE` | 80 - 800 | `tileCache.ts` | Number of tile texture entries retained in RAM. Android caps inactive retention at 120 in Balanced/Performance and 160 in Ultra; visible tiles remain pinned. |
| `LOD_HYSTERESIS` | 0.05 (5%) | `Tile.ts` | Dead-zone for LOD switching. Prevents "flickering" between high/low res tiles. |
| `ZOOM_BOOST_SATELLITE` | 2.0 | `scene.ts` | Over-sampling factor for satellite imagery (crisper textures). |
| `ZOOM_BOOST_SWISSTOPO` | 1.0 | `scene.ts` | Reference factor for Swiss map (optimal native readability). |
| `ZOOM_BOOST_OTHER_TOPO`| 0.5 | `scene.ts` | Magnification factor for IGN/basemap.at/BKG/IGN España/Kartverket/OpenTopo. Forces 1-LOD delay to double label size. |
| `ZOOM_CAP_FREE` | 14 | `Tile.ts` | Technical ceiling for free users. Forces upsell for high-res maps. |

## 1b. Rendering Optimizations (v5.56.23)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **No Tone Mapping** | `scene.ts` | `NoToneMapping` used instead of `AgXToneMapping` (v5.56.22). Prevents washed-out sRGB tiles. |
| **Sharp Textures** | `Tile.ts` | `LinearFilter` without mipmaps for color/overlay textures (v5.56.23). Eliminates blur in 2D/3D. |
| **Frustum cache per frame** | `Tile.ts`, `scene.ts`, `terrain.ts` | `sharedFrustum` computed once per frame with `camera.updateMatrixWorld()`. Passed to `Tile.isVisible(frustum?)`. Eliminates ~81 mat4 multiplies/frame. |
| **buildQueue O(1) dedup** | `tileQueue.ts` | `buildQueueKeys: Set<string>` parallel to `buildQueue[]`. Replaces `Array.includes()` O(n) with `Set.has()` O(1). |
| **Shadows** | `scene.ts` | Enabled only when SHADOWS is set and the map is 3D. The historical claim of frozen shadow updates during interaction is not implemented in the audited source; do not count it as an existing optimization. |
| **Shader pre-warming** | `scene.ts` | `renderer.compile(scene, camera)` called 200ms after init. Moves shader compilation cost from first interaction to startup. |

## 1e. Rendering Optimizations (v5.56.25 — Benchmark v2.5)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **Micro-Benchmark** | `benchmark.ts` | Fast startup test. CPU: buffer traversal. GPU: 1024x1024 scene with 8 lights + `gl.readPixels` sync. Durations: CPU 200ms, GPU 300ms (v5.56.25). |
| **Delayed Benchmark**| `appInit.ts` | Benchmark différé +15s après le démarrage (v5.60.2). Détection statique GPU appliquée immédiatement pour éviter les scores bas à froid. |
| **Preset Calibration** | `benchmark.ts`, `performance.ts` | Thresholds: Eco (<30), Balanced (30-59), Performance (60-91), Ultra (92+). Normalization: CPU `×0.5`, GPU `×2.0`. Weights: GPU 75%, CPU 15%, StaticBonus 10% (v5.60.2). |
| **Intel IGP Cap** | `benchmark.ts` | Intel integrated GPUs capped to `balanced` to avoid UMA bias in `gl.readPixels`. |

## 1f. Rendering Optimizations (v5.62.0)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **Normal map RG compact** | `tileWorker.ts`, `Tile.ts` | Stockage 2 canaux (RG) au lieu de 4 (RGBA). Z reconstruit côté GPU via `sqrt(1 - x² - y²)` + signe. Gain VRAM ~50% sur les normal maps (6-12 Mo sur visible tiles). |
| **Index mémoire CacheStorage** | `tileLoader.ts` | `Map<string, boolean>` pour lookups O(1) au lieu de `caches.match()` O(n). Évite 1-3ms de main thread par cycle de chargement. |
| **Cache offline partitionné** | `tileLoader.ts` | `OFFLINE_CACHE_NAME` séparé. Les zones offline ne peuvent plus être évincées par le cache de navigation. |

## 2. Navigation & GPS Logic

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `HYSTERESIS_THRESHOLD` | 5m | `geoStats.ts` | Minimum vertical movement to count in D+/D-. Filters sensor noise. |
| `GPS_SMOOTH_POINTS` | 5 | `nativeGPSService.ts` | Moving average window for altitude. Balances responsiveness and noise. |
| `ANTICHAMPIGNON_DIST` | 2.5m | `gpsDeduplication.ts` | Min distance between points. Filters noise when standing still. |
| `MAX_GPS_ALT_JUMP` | 200m | `gpsDeduplication.ts` | Rejects teleportation bugs if time interval < 10s. |

## 3. External Services (Weather/API)

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `MIN_FETCH_INTERVAL` | 15s | `weather.ts` | API Rate Limiting. Prevents Open-Meteo IP bans on fast camera moves. |
| `WEATHER_FETCH_DISTANCE` | 3 km | `scene.ts` | Min camera displacement to re-fetch weather. Reduced from 5 km for mountain reactivity. |
| `DEEP_SLEEP_DELAY` | 30s | `scene.ts` | Time before dropping to 1.5 FPS when app is idle (v5.29.7). |
| `CACHE_NAME` | `suntrail-tiles-v30` | `tileLoader.ts` | Persistent cache versioning (navigation). |
| `OFFLINE_CACHE_NAME` | `suntrail-offline-zones` | `tileLoader.ts` | Cache séparé pour zones hors-ligne (v5.62.0). |

## 4. UI & Interaction

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `LONG_PRESS_MS` | 500ms | `touchControls.ts` | Standard duration to differentiate tap from probe. |
| `AUTO_HIDE_DELAY` | 3000ms | `autoHide.ts` | Delay for controls fade-out after user stops moving. |
| `MAX_TILES_OFFLINE` | 2000 | `ZoneSelector.ts` | Hard limit for offline zone downloads (v5.57.0). |

## 5. Data Flows (Tiles & Elevation)

### A. Color Tiles Flow (`getColorUrl`)
```
LOD ≤ 10 → OpenTopoMap (Global overview)

LOD ≥ 11 → MAP_SOURCE determines the source:
  │
  ├─ 'opentopomap' (Manual) → OpenTopoMap direct
  │
  ├─ 'satellite' (Manual) → MapTiler → ArcGIS Satellite
  │
  └─ 'swisstopo' (Auto) → data-driven COUNTRY_SOURCES[code].colorTopo
       │  (if country HD config exists for current zoom)
       │  → HD source (SwissTopo, IGN, Kartverket, etc.)
       │
       └─ fallback → OpenTopoMap (Optimized for hiking, LOD ≤ 17)
                     → MapTiler Outdoor
                     → OpenStreetMap
```

### B. Elevation Flow (`getElevationUrl`)
- **Source**: MapTiler Terrain-RGB (Zoom capped at 14).
- **Encoding**: `-10000.0 + ((r*65536 + g*256 + b)*0.1)`.
- **Fallback**: Flat terrain (altitude 0) if tile is missing or MapTiler unavailable.

### C. Overlays Flow (`getOverlayUrl`)
- **Swiss**: SwissTopo Wanderwege (LOD 13-18).
- **Global**: Waymarked Trails (LOD 11-17).
