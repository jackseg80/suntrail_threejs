# AI Architecture Guide (v5.29.33)

This document maps the core reactive logic and rendering systems to help AI agents understand how modules interact.

## 1. EventBus Mapping

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
| `terrainReady` | `scene` | none | First batch of tiles is loaded and rendered. |
| `recordingRecovered` | `main` | none | GPS recording resumed after app restart. |

## 2. Shader Architecture & Uniforms

The terrain uses `MeshStandardMaterial` modified via `onBeforeCompile` for performance and features.

### A. Terrain Shader (`src/modules/terrain/Tile.ts`)
**Uniforms (TerrainUniforms):**
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
- **Logic**: Particle recycling in a 15,000 unit box around camera. Rain = vertical streaks; Snow = sinewave drift.

## 3. Proxy State System (`src/modules/state.ts`)

Use `state.subscribe(key, callback)` for reactive updates.
- **Persistent Keys**: `IS_2D_MODE`, `PERFORMANCE_PRESET`, `UNIT_SYSTEM`.
- **Volatile Keys**: `weatherData`, `simDate`, `lastClickedCoords`.
