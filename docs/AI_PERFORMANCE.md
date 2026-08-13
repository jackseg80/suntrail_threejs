# AI Performance & Constants Guide (v5.81.2)

Dictionary of "Magic Numbers" and thresholds used in SunTrail.

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
| `TILE_CACHE_SIZE` | 80 - 800 | `tileCache.ts` | Number of tile textures kept in RAM. Dynamic per preset (Balanced Mobile = 200). |
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
| **Frozen shadows during interaction** | `scene.ts` | `renderer.shadowMap.autoUpdate = !isUserInteracting` instead of toggling `sunLight.castShadow`. Prevents shader recompilation and visual flash. |
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
