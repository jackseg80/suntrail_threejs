# AI Architecture Guide (v5.86.2 — tableau de bord Sortie déterministe)

> Référence des services locaux v5.84 à v5.86. La release v5.86 est GitHub uniquement ; aucun
> déploiement Play/public n'est induit par ce document.

This document maps the core reactive logic and rendering systems to help AI agents understand how modules interact.

## 1. Service-Oriented Logic (v5.57.0)

To improve testability and keep UI components lean, business logic is extracted into stateless or singleton services.

| Service | Responsibility | Key Methods |
| :--- | :--- | :--- |
| `expertService` | Weather reporting, Solar analysis, SOS message generation. | `generateSOSMessage`, `generateWeatherReport` |
| `recordingService`| Orchestration of GPS recording, permissions, and file saving. | `toggleRecording`, `stopRecording`, `saveToFile` |
| `outingDashboard` | Pure projection of route, Guidance and REC state into six mutually explicit Sortie phases; computes actual REC summary metrics. | `buildOutingDashboard`, `buildRecordingSummary` |
| `gpxService` | GPX data handling, parsing, and string generation. | `handleGPXImport`, `buildGPXStringFromLayer` |
| `gpxLayers` | (v5.56.2) 3D rendering and management of GPX track layers. | `addGPXLayer`, `updateAllGPXMeshes` |
| `geocodingService` | Reverse/forward geocoding via MapTiler + Nominatim fallback, metadata and contextual ranking. | `getPlaceName`, `searchLocations`, `classifyFeature`, `rankSearchResults` |
| `routeManager` | Explicit planning mode, waypoint/bar UI, route recompute and legacy-compatible controls. | `setRoutePlanningMode`, `reverseRoute`, `clearRoute` |
| `PreparedRouteService` | Only UI-facing orchestration for local prepared routes and legacy/GPX conversion. | `saveCurrentDraft`, `load`, `duplicate`, `convertLegacy` |
| `RouteRepository` | Sole IndexedDB access for `PreparedRouteV1`; injected `IDBFactory`, atomic writes and additive upgrades. | `list`, `get`, `saveMany`, `delete`, `close` |
| `GuidanceEngine` | Pure polyline projection, robust progress, ETA/cross-track/bearing and state hysteresis. No DOM/Three.js. | `start`, `update`, `tick`, `pause`, `resume`, `stop` |
| `GuidanceForegroundService` | Foreground UI orchestration over the existing `state.userLocation` stream; REC remains independent. | `start`, `pause`, `resume`, `stop` |
| `routeReadiness` | Pure layered readiness report; local route/light remain independent from optional offline, network and Android evidence. | `buildRouteReadinessReport` |
| `routeCorridor` | Pure geometry-to-tile planning plus bounded local coverage measurement; no network or download side effect. | `buildRouteCorridorPlan`, `measureCorridorCoverage` |
| `RouteCorridorReadinessService` | Serializes per-route measurements and invalidates short-lived evidence when route/map/local-pack context changes. | `getInput`, `shouldMeasure`, `measure` |
| `routeCorridorDownload` | Typed, deduplicated corridor resource queue with bounded concurrency, honest partial results and conservative cancellation into existing offline CacheStorage. | `buildCorridorDownloadQueue`, `downloadRouteCorridor` |
| `CorridorManifestRepository` | Separate versioned IndexedDB registry for corridor lifecycle and resource ownership; leaves Prepared Routes untouched. | `list`, `get`, `save`, `applyChanges` |
| `RouteCorridorInstallService` | Installs/restarts corridors, keeps the old Free corridor active until complete replacement and performs ownership-aware cleanup. | `install` |
| `routeCorridorPreflight` | Measures storage headroom and classifies the current connection without turning unknown evidence into a blocker. | `getRouteCorridorPreflight` |
| `releaseFlags` | Release rollout decisions, separate from Free/Pro entitlements. | `isEnabled`, `refresh`, `setDeveloperOverride` |
| `gpxHistoryService` | (v5.56.2) GPX history persistence (max 5, localStorage). | `saveToHistory`, `loadHistory` |
| `iapService` | RevenueCat integration, Pro status synchronization. | `initialize`, `purchase`, `syncProStatus` |
| `ZoneSelector` | (v5.57.0) Logic for visual offline zone selection. | `getViewportBBox`, `getTilesForBBox` |
| `cachedZones` | (v5.57.0) Persistence and management of offline zones. | `saveZone`, `deleteZone`, `getCachedZones` |
| `appInit` | Centralized application bootstrap and UI hydration; v5.86.2 detects a stale lazy chunk after an update and delegates the one-shot safe shell recovery. | `appInit` |
| `appShellRecovery` | Removes only the obsolete Workbox app shell and its worker after a hashed dynamic-import failure, then reloads once; offline maps and local data remain intact. | `recoverStaleAppShell` |

## 2. EventBus Mapping

The `eventBus` is the central hub for module-to-module communication.

| Event Name | Source | Payload | Description |
| :--- | :--- | :--- | :--- |
| `flyTo` | `terrain`, `TrackSheet` | `{ worldX, worldZ, targetElevation, targetDistance }` | Trigger camera transition to world coordinates. |
| `sheetOpened` | `SheetManager` | `{ id: string }` | Emitted when a UI panel (Expert, SOS, etc.) opens. |
| `sheetClosed` | `SheetManager` | `{ id: string }` | Emitted when a UI panel closes. |
| `themeChanged` | `theme` | `{ theme: 'light' \| 'dark' }` | UI theme synchronization. |
| `localeChanged` | `I18nService` | `{ locale: string }` | Triggers UI re-renders for translation. |
| `networkOnline` | `networkMonitor` | none | Browser regained connectivity. |
| `networkOffline` | `networkMonitor` | none | Browser lost connectivity. |
| `packMounted` | `packManager` | `{ packId: string }` | A country pack (Mapbox/PMTiles) is active. |
| `packUnmounted` | `packManager` | `{ packId: string }` | A country pack is deactivated. |
| `packStatusChanged` | `packManager` | `{ packId, status }` | Tracks download/mounting progress. |
| `packHighlight` | `TopStatusBar` | `{ packId: string }` | Scrolls to & highlights a specific pack in PacksSheet (LOD badge click → pack). |
| `terrainReady` | `scene` | none | First batch of tiles is loaded and rendered. |
| `recordingRecovered` | `main` | none | GPS recording resumed after app restart. |
| `recordingCompleted` | `recordingService` | `RecordingSummary` | Publishes the temporary internally saved REC summary; file export remains a separate Pro action. |
| `preparedRoutesUpdated` | `PreparedRouteService` | none | Refreshes the local route library after storage changes. |
| `trackDestinationChanged` | `NavigationBar` | `{ destination: 'outing' \| 'library' }` | Switches the shared `TrackSheet` between functional destinations. |
| `guidanceSnapshot` | `GuidanceForegroundService` | `GuidanceSnapshot` | Publishes the current foreground matcher state. |
| `guidanceStopped` | `GuidanceForegroundService` | none | Signals the end of the foreground guidance session. |
| `onServiceStopped` | `nativeGPSService` | none | Android Foreground Service stopped via notification. |

## 2. Shader Architecture & Uniforms

The terrain uses `MeshStandardMaterial` modified via `onBeforeCompile` for performance and features.

### A. Terrain Shader (`src/modules/terrain/Tile.ts`)
**Uniforms (terrainUniforms):**
- `uElevationMap`: Terrain-RGB texture.
- `uNormalMap`: RGB normal texture (pre-calculated).
- `uOverlayMap`: Mapbox/IGN imagery texture.
- `uExaggeration`: Vertical scale (usually 1.0 to 2.5).
- `uShowSlopes`: 0.0 or 1.0 (Slope heatmap).
- `uShowHydrology`: 0.0 or 1.0 (Dynamic water shader).
- `uTime`: Global elapsed time for wave animation.

**Logic Hooks:**
- **Vertex**: `getTerrainHeight(uv)` decodes height from `uElevationMap` using `-10000.0 + ((r*65536 + g*256 + b)*0.1)`.
- **Fragment**: Hydrology detects blue-ish pixels with high saturation and flat normals (`vTrueNormal.y > 0.998`) to apply wave animations.
- **Slope Heatmap**: Uses `vTrueNormal.y` with thresholds: Yellow (30°), Orange (35°), Red (40°), Purple (45°).

### B. Weather Shader (`src/modules/weather.ts`)
- **System**: `THREE.Points` (15,000 particles).
- **Uniforms**: `uWindVec` (Vector3 from Open-Meteo), `uIsRain` (0.0=Snow, 1.0=Rain).
- **Logic**: Particle recycling in a 15,000 unit box around camera. Rain = vertical streaks; Snow = sinewave drift. **ShaderMaterial** (v5.56.4) handles the rendering.
- **Data**: `fetchWeather(lat, lon)` → Open-Meteo API (courant, horaire 24h, prévisions 3j). **Rate limit**: 15s min between calls.
- **Geocoding**: `getPlaceName()` from `geocodingService.ts` + `getCountryName()` from `geo.ts` for the location label.

## 3. Proxy State System (`src/modules/state.ts`)

Use `state.subscribe(key, callback)` for reactive updates.
- **Persistent Keys**: `IS_2D_MODE`, `PERFORMANCE_PRESET`, `UNIT_SYSTEM`.
- **Volatile Keys**: `weatherData`, `simDate`, `lastClickedCoords`.
- **Planning state**: `isRoutePlanningMode` still governs tap semantics. Draft metadata and the
  current computation remain volatile; only validated `PreparedRouteV1` snapshots are persisted.
- **Trace roles**: `routeWaypoints`/`routeComputation` are the sole Prepare draft source;
  `activeGPXLayerId` is the viewed reference for map/profile; `recordedPoints` is the independent
  REC source and keeps priority in `outingDashboard` while recording. Import and all catalogue
  rows are rendered only for `trackDestinationChanged: library`.
- Selecting a GPX never mutates the Prepare draft. `PreparedRouteService.prepareGPXLayerAsDraft`
  is called only by the explicit UI action after dirty-draft protection.
- GPX `geometry` preserves every imported point. `waypoints` remains a compact editing model:
  endpoints for an open trace, or start/two intermediate anchors/end for a detected loop. Opening
  a prepared route explicitly refreshes the profile after the Library sheet closes.
- **Prepared routes DB**: `suntrail-prepared-routes`, database version 2, `routes` object store,
  data schema version 1, indexes `updatedAt`, `favorite`, `name`.

### UI compatibility adapters (v5.83.0)

- `NavigationBar` maps the visible Bibliothèque destination to the existing `track` sheet.
- Existing DOM IDs (`#route-bar`, `#rb-clear-btn`, `#gpx-layers-list`, settings/account IDs)
  remain stable.
- `SettingsAccountSection` owns optional-account/RGPD bindings and
  `SettingsCategoryNavigation` owns category focus/scroll, reducing `SettingsSheet` coupling.
- `releaseFlags.ts` owns rollout flags only; `featureFlags.ts` remains authoritative for Pro.
- GPX history stays under its existing localStorage key and is never bulk-migrated. A user-triggered
  conversion stores a distinct approximate route while leaving the original entry intact.
- `showOnlyGPXLayer` and `hideAllGPXLayers` alter loaded reference-layer visibility only. They
  never delete a layer, mutate IndexedDB, or hide the independent REC mesh.

## 4. Internationalization (i18n) Workflow

- **Locales**: `src/i18n/locales/` contains JSON files (fr, en, de, it).
- **Service**: `I18nService.ts` handles loading and switching.
- **Audit**: Use `python scripts/audit_i18n.py` to:
    - Identify missing keys in secondary languages compared to French (source of truth).
    - Find unused keys in JSON files.
    - Check for encoding/syntax errors.
- **Key Pattern**: `category.subCategory.key` (e.g., `upgrade.plan.yearly`).
- **Emojis**: Avoid emojis in critical text keys; prefer SVG icons from `src/modules/ui/icons.ts`.
