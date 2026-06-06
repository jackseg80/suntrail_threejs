# AI Technical Deep Dive: Rendering & Systems

This document explains the advanced and unique rendering techniques used in SunTrail to achieve high-performance 3D cartography on mobile.

## 1. Hydrology: The "Texture Mask" Technique (v5.34.0)

To avoid Z-fighting and ensure perfect alignment with terrain relief without complex mesh-on-mesh calculations.

- **Process**: Vector tiles (PBF) are pre-rendered into an `uOverlayMap`. Water features (lakes, rivers) are identified by specific pixel signatures (high saturation blue).
- **Shader Logic**: Inside `terrain.ts` shader, we sample the overlay texture. If a blue pixel is detected:
    - Normal is forced to `(0, 1, 0)` (Flat water surface).
    - A wave animation (sine-based) is applied using `uTime`.
    - Specular highlights are increased to simulate water reflection.
- **Benefit**: Zero extra draw calls for water, zero Z-fighting, works perfectly even on steep canyon rivers.

## 2. Vegetation: InstancedMesh & Semantic Detection (v5.33.1)

High-density forests without killing the GPU.

- **Detection**: Workers parse Vector Tiles (MapTiler/SwissTopo). Features with `class: 'wood'` or `class: 'forest'` are used to generate a list of points within the forest polygon.
- **Rendering**: `THREE.InstancedMesh` using a single low-poly tree model or a simple crossed-plane sprite.
- **Alignment**: Tree Y-position is sampled from the `uElevationMap` using the same logic as the terrain vertex shader.
- **Shadows**: Forests cast and receive shadows from the `sunLight`, contributing to the realism of valley floors.

## 3. High-Resolution Country Sources (v5.56.0)

The "Data-Driven" sourcing system.

- **Logic**: `src/modules/tileSources.ts` contains `COUNTRY_SOURCES`. 
- **Auto-Detection**: `getCountryCode(lat, lon)` uses a simplified Natural Earth polygon set (`src/data/countries.ts`).
- **Flow**: `getColorUrl` checks if the current position is within a country with a high-res source (IGN, SwissTopo, etc.). If yes, and if `MAP_SOURCE === 'swisstopo'`, it bypasses the global fallback.
- **Fallback Hierarchy**: `High-Res Source` → `OpenTopoMap` → `MapTiler Outdoor` → `OSM`.

## 4. Adaptive LOD & Floating Origin (v5.19.1)

- **Floating Origin**: Every 35km, the world is translated back to `(0,0,0)` to avoid float32 precision errors in shaders (jittering).
- **Tilt Parabola**: The maximum tilt angle is not fixed. It follows a parabolic curve centered at LOD 14, allowing dramatic 3D views while maintaining overview usability at low zoom.

## 5. Performance Preset Calibration (v5.56.25)

- **Micro-Benchmark**: Measures CPU (buffer op) and GPU (fill-rate + `readPixels` latency).
- **GPU Cap**: Intel Integrated GPUs are capped at "Balanced" because their architecture (UMA) cheats on `readPixels` tests, but they struggle with high-res shadow maps.
- **Shadows**: Toggled via `renderer.shadowMap.autoUpdate`. We freeze shadows during interaction to save ~30% GPU power during pan/zoom.
