# AI Performance & Constants Guide (v5.31.1)

Dictionary of "Magic Numbers" and thresholds used in SunTrail.

## 1. Map & Terrain Performance

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `MAX_BUILD_TIME` | 6ms | `Tile.ts` | Max time per frame spent mounting meshes. Prevents micro-stutter on Galaxy A53. |
| `TILE_CACHE_SIZE` | 120 | `terrain.ts` | Number of tile textures kept in RAM. Balances fly-to speed and memory usage. |
| `LOD_HYSTERESIS` | 0.05 (5%) | `Tile.ts` | Dead-zone for LOD switching. Prevents "flickering" between high/low res tiles. |
| `ZOOM_CAP_FREE` | 14 | `Tile.ts` | Technical ceiling for free users. Forces upsell for high-res maps. |

## 1b. Rendering Optimizations (v5.31.1 — Audit Vague 1)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **Frustum cache per frame** | `Tile.ts`, `scene.ts`, `terrain.ts` | `sharedFrustum` computed once per frame with `camera.updateMatrixWorld()`. Passed to `Tile.isVisible(frustum?)`. Eliminates ~81 mat4 multiplies/frame. |
| **buildQueue O(1) dedup** | `tileQueue.ts` | `buildQueueKeys: Set<string>` parallel to `buildQueue[]`. Replaces `Array.includes()` O(n) with `Set.has()` O(1). |
| **Frozen shadows during interaction** | `scene.ts` | `renderer.shadowMap.autoUpdate = !isUserInteracting` instead of toggling `sunLight.castShadow`. Prevents shader recompilation (USE_SHADOWMAP macro toggle) and visual flash. Shadows freeze in place during pan/zoom, then auto-update resumes. |
| **Pre-allocated query vector** | `analysis.ts` | `_queryPoint` Vector3 reused across `getAltitudeAt()` calls. Eliminates per-call allocation in hot path (~5-10 calls/frame). |
| **Shader pre-warming** | `scene.ts` | `renderer.compile(scene, camera)` called 200ms after init. Moves shader compilation cost from first interaction to startup. |
| **Near plane** | `cameraManager.ts` | Kept at `near: 10` (not 50). Near=50 causes z-fighting at LOD 6 with the ground plane due to extreme near/far ratio (50/4M). |

## 1c. Rendering Optimizations (v5.31.1 — Audit Vague 2)

| Optimization | File | Description |
| :--- | :--- | :--- |
| **Aggressive pixelData purge** | `tileCache.ts` | LRU-based: keeps only N most recent pixelData (eco/balanced=10, performance=30, ultra=50). Frees ~15-20MB RAM on mobile. `getAltitudeAt()` falls back to 0 for purged tiles. |
| **Shadow frustum per preset** | `scene.ts`, `sun.ts` | Balanced=15000m, Performance=25000m, Ultra=30000m max extent. `near=100`, `far=200000` (was near=1000, far=500000). Reduces shadow map GPU cost significantly on mobile. |
| **Ground plane reduced** | `scene.ts` | 500km×500km → 100km×100km. Still covers viewport at LOD 6. Smaller bounding sphere improves frustum culling. |
| **LOD logic unified** | `scene.ts` | Removed duplicated zoom-threshold if/else cascade (lines 286-298). Now uses `getIdealZoom()` exclusively with 5% hysteresis. |
| **FogExp2** | `scene.ts` | Replaced `THREE.Fog(near, far)` with `THREE.FogExp2(density)`. Density adapts to altitude: `baseDensity * max(0.3, 1 - alt/400000)`. Fog slider UI updates density directly. More natural rendering, no per-frame near/far calculation. |

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
| `WEATHER_THROTTLE` | 50ms (20fps) | `scene.ts` | Render throttle for weather uniforms. Saves battery on non-essential visuals. |
| `DEEP_SLEEP_DELAY` | 30s | `scene.ts` | Time before dropping to 1.5 FPS when app is idle. |

## 4. UI & Interaction

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `LONG_PRESS_MS` | 500ms | `touchControls.ts` | Standard duration to differentiate tap from probe. |
| `AUTO_HIDE_DELAY` | 3000ms | `autoHide.ts` | Delay for controls fade-out after user stops moving. |
