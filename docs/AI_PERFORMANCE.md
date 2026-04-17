# AI Performance & Constants Guide (v5.29.33)

Dictionary of "Magic Numbers" and thresholds used in SunTrail.

## 1. Map & Terrain Performance

| Constant | Value | File | Rationale |
| :--- | :--- | :--- | :--- |
| `MAX_BUILD_TIME` | 6ms | `Tile.ts` | Max time per frame spent mounting meshes. Prevents micro-stutter on Galaxy A53. |
| `TILE_CACHE_SIZE` | 120 | `terrain.ts` | Number of tile textures kept in RAM. Balances fly-to speed and memory usage. |
| `LOD_HYSTERESIS` | 0.05 (5%) | `Tile.ts` | Dead-zone for LOD switching. Prevents "flickering" between high/low res tiles. |
| `ZOOM_CAP_FREE` | 14 | `Tile.ts` | Technical ceiling for free users. Forces upsell for high-res maps. |

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
