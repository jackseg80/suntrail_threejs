# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.8.15] - 2026-03-25
### 🌲 Vegetation & Tile Continuity
- **Deterministic Placement Engine**: Replaced all `Math.random()` calls with a custom `pseudoRandom` function seeded by global tile coordinates. This permanently eliminates "net cuts" (seams) between adjacent tiles.
- **Banding Elimination**: Removed the hard row-by-row tree limit. Forests are now distributed across the entire tile surface using purely probabilistic density, fixing the "empty bands" at the bottom of high-zoom tiles.
- **Refined Spatial Jitter**: Implemented deterministic jitter to maintain organic appearance while ensuring perfect boundary alignment.
- **Fixed State Tests**: Updated performance tests to match the new 8000 density standard for the Ultra preset.

## [5.8.14] - 2026-03-24
### 🌲 Vegetation Quality & Anti-Banding
- **Dithered Scan Engine**: Implemented randomized pixel sampling within the scan grid to permanently eliminate Moiré patterns and "horizontal banding" at high zoom levels.
- **Continuous Forest Filter**: Expanded SwissTopo detection to include both dark symbols and the light-green forest background. This ensures a consistent tree carpet even at LOD 17/18 where symbols are sparse.
- **Ultra Preset Balance**: Reduced Ultra vegetation density to 8000 to maintain high performance while ensuring visual quality through better distribution.
- **Enhanced Jitter**: Doubled the spatial randomization range to break all visible grid alignments.

## [5.8.13] - 2026-03-24
### 🌲 Vegetation & Distribution
- **Probabilistic Placement**: Implemented a probability-based distribution to eliminate horizontal banding and gaps at high zoom levels.
- **Improved Jitter**: Increased spatial randomization to break up grid-like patterns appearing at extreme LODs.

## [5.8.11] - 2026-03-24
### 🌲 Vegetation & Realism
- **Density Normalization**: Implemented a zoom-aware scaling for forest density. Trees are now normalized based on the physical area of the tile, ensuring that forests look consistent from LOD 15 up to LOD 18 without overcrowding.
- **Micro-adjustment**: Set minimum tree count per tile to 100 to maintain some vegetation presence even at extreme zooms.

## [5.8.10] - 2026-03-24
### 🌲 Vegetation & Performance
- **Reverted Forest Density**: Default tree counts restored to stable values (Balanced: 2000, Performance: 8000, Ultra: 12000) to maintain visual balance and performance.
- **Stable Scan Resolution**: Reverted vegetation scanner to 64x64 resolution for improved frame stability.
- **Advanced SwissTopo Forest Filter**: Implemented a "symbol-based" detection logic for SwissTopo. The engine now specifically targets the darker forest symbols (< 195 luminance) while strictly excluding the brighter backgrounds and uniform green sport fields.
- **Ultra-Strict Lawn Exclusion**: Added radical checks for "pure green" and vivid saturation to ensure sports fields, golf courses, and gardens remain tree-free.

## [5.8.9] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter Refinement**: Improved chromatic discrimination between alpine forests and manicured urban lawns using greenness purity ratios.

## [5.8.8] - 2026-03-24
### 🌲 Vegetation Precision
- **Anti-Lawn Filter**: Implemented a strict chromatic filter to distinguish between natural forests and manicured grass (football fields, golf courses, gardens).
- **Luminance & Saturation Tuning**: Reduced brightness threshold and added vivid green detection to prevent false-positive tree placement on bright sports surfaces.

## [5.8.7] - 2026-03-24
### 🌲 Vegetation & Environment
- **Massive Forest Density**: Increased default tree density across all presets (Balanced: 4000, Performance: 10000, Ultra: 18000).
- **Adaptive Scan Engine**: Implementation of a high-resolution vegetation scanner (up to 128x128) allowing for truly dense forests.
- **Tree Scaling Refinement**: Adjusted tree scales and random jitter for a fuller, more organic forest appearance.
- **Settings Versioning**: Bumped state version to 5.8.7 to ensure proper settings migration.

## [5.8.6] - 2026-03-24
### 🛠️ Navigation & Performance
- **Adaptive Zoom Engine**: Implementation of a "smart jump" logic for LOD transitions. When teleporting or moving fast, the engine now skips intermediate zoom levels to instantly match the camera altitude.
- **Cinematic flyTo Refinement**: Improved target altitudes for teleportation. Peaks now aim for 3.5km (LOD 16/17) and cities for 8km (LOD 15/16) for immediate immersion.
- **State Stability**: Fixed `MAX_ALLOWED_ZOOM` handling in the reactive state to prevent zoom blocking during manual interactions.

## [5.8.5] - 2026-03-24
### 🛠️ 3D Buildings & Infrastructure
- **MapTiler Buildings Integration**: Fixed API URL to use dedicated `buildings` tileset and implemented native handling for overzoomed tiles (native data capped at Z14).
- **Intelligent Fallback**: Fixed fallback logic to trigger on 400 Bad Request errors, ensuring OSM Overpass takes over immediately if MapTiler fails.
- **Height-Aware Placement**: Improved building base altitude detection using relief sampling, ensuring structures are correctly grounded.
- **RTX Shadows**: Maintained geometry merging while enabling high-performance shadow casting for all building meshes.

## [5.8.4] - 2026-03-24
### 🛠️ Hydrology & Water Rendering
- **3D Hydrology Restoration**: Full restoration of dynamic 3D lakes and rivers meshes extracted from OSM Overpass API.
- **Seamless Water Engine**: Implementation of a global wave system using absolute world coordinates. This eliminates tile seams and moiré patterns.
- **Giant Roller Waves**: Replaced grid-like waves with natural, directional roller waves for a more realistic alpine lake appearance.
- **SwissTopo Detection**: Enhanced chromatic detection logic to correctly identify and render water even on light-colored SwissTopo maps.

## [5.8.3] - 2026-03-24
### 🛠️ Precision & Long-Distance Navigation
- **Origin Shift Implementation**: Implementation of a dynamic world recentering system (35km threshold). This eliminates floating-point jitter during long-distance crossings.
- **Atomic Translation**: All global scene objects (Camera, Sun, GPS Marker, GPX Tracks, Forests, and Labels) are now seamlessly offset during recentering.
- **UI Logic cleanup**: Removal of debug logs and refinement of the shift trigger conditions.

## [5.8.2] - 2026-03-24
### 🛠️ Restoration & Expert Features
- **Solar & Weather Restoration**: Réintégration de la logique dynamique pour l'Analyse Solaire et le Dashboard Météo. Les données sont de nouveau extraites et affichées en temps réel.
- **Advanced Settings**: Regroupement des réglages techniques (LOD, Fog, API Key, PMTiles) dans une section "Paramètres Avancés" collapsible.
- **Geolocation Unification**: Migration vers `@capacitor/geolocation` pour une expérience de positionnement identique et robuste sur PC et Mobile.
- **GPX Import Fix**: Rétablissement de la fonctionnalité d'importation de tracés dans l'onglet Parcours.
- **Mobile UX Refinement**: Ajustement du positionnement du bouton GPS (Top-Right) et du radar pour éviter les chevauchements sur petit écran. Timeline centrée et adaptative.

## [5.8.1] - 2026-03-22
### 🛠️ UI Fixes & Stability
- **Fix Logic Bindings** : Rétablissement des connexions JavaScript pour la sélection des calques et des presets de performance dans le nouveau système de tiroirs.
- **Search Reliability** : Correction de l'affichage des résultats de recherche et fiabilisation de la sélection des sommets.
- **Crash Fix** : Suppression des références obsolètes dans `startApp()` qui bloquaient le thread principal au chargement.

## [5.8.0] - 2026-03-22
### 🎨 Modern Mobile UI (v5.8)
- **Bottom Navigation Bar** : Suppression des boutons flottants épars au profit d'une barre de navigation fixe avec 4 onglets : *Carte, Recherche, Parcours, Réglages*.
- **Système de Bottom Sheets** : Toutes les interfaces coulissent désormais depuis le bas avec une animation fluide, optimisée pour l'usage à une main.
- **Top Bar Moderne** : Intégration d'un dashboard central affichant l'altitude temps réel, le niveau de détail (LOD) et un widget météo interactif.
- **Backdrop Intelligent** : Ajout d'un overlay permettant la fermeture intuitive des panneaux au clic extérieur.

## [5.7.4] - 2026-03-23
### 🗺️ Unification Mondiale & Sécurité API
- **Unification Bas-Zoom (LOD <= 10)** : Harmonisation de l'affichage à grande échelle. L'application utilise désormais une source unique pour le monde entier à bas niveau de zoom.
- **Fail-safe MapTiler (Auto-OSM)** : Implémentation d'une détection dynamique des erreurs 403 (clés invalides/expirées). Basculement automatique sur OpenStreetMap.
- **Fix Saut de Grille** : Correction du bug de recentrage lors des changements de source automatiques.

... (Historique tronqué pour lisibilité)
