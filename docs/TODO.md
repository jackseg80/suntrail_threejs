# SunTrail 3D - Roadmap Révisée (v5.5.0)

## 🚀 Priorité 1 : Optimisations & Netteté (v5.6)
*Impact : Fluidité mobile absolue et rendu topographique pro.*

- [ ] **Refactoring Architectural Terrain** : Extraire `TileCache` et `TileLoader` de `terrain.ts` pour stabiliser la logique avant l'injection des normales.
- [ ] **Normal Map Pre-computation (Worker)** : Déplacer le calcul des normales du GPU vers les WebWorkers.
    - *Gain :* Réduction de 87% des lectures de textures (1 read au lieu de 8).
- [ ] **Material Pooling (Shader Reuse)** : Implémenter un pool de matériaux réutilisables pour supprimer les micro-freezes de recompilation GLSL.
- [ ] **Vector Trails (MVT) Pro** : Migration complète des sentiers raster vers le format vectoriel natif (netteté infinie).
- [ ] **Couverture de Tests Critiques** :
    - `scene.ts` : Tests du cycle flyTo et de la render loop (mock WebGLRenderer).
    - `ui.ts` : Tests des handlers GPS, SOS modal, et géocodage sécurisé.
    - *Critère de sortie : npm test ≥ 80 tests au vert avant livraison v5.6.*

## 🎯 Priorité 2 : Usage Terrain & Partage (v5.7)
*Impact : Rendre l'application indispensable pour la randonnée réelle.*

- [ ] **Système Offline-First Complet** :
    - Service Worker (interception réseau, cache intelligent persistant).
    - Support format PMTiles (carte mondiale/régionale dans un seul fichier).
    - *Note : Ces deux items forment un système indissociable pour le mode avion.*
- [ ] **Waypoints Personnalisés** : Marquage et sauvegarde de points d'intérêt (IndexedDB).
- [ ] **Deep Linking (Smart URL)** : Synchronisation de l'URL pour partager une vue 3D exacte.
- [ ] **Profil GPX Expert** : Coloration des pentes > 30° sur le profil et statistiques par segment.

## ✨ Priorité 3 : Immersion & Multi-Données (v5.8)
*Impact : Robustesse des données et effets visuels avancés.*

- [ ] **Multi-GPX Trace** : Support pour l'affichage et la gestion de plusieurs tracés simultanés.
- [ ] **Cloud Shadows** : Projection d'ombres de nuages basée sur les données réelles d'Open-Meteo.
- [ ] **Advanced Night Mode** : Pollution lumineuse urbaine (NASA VIIRS).

## ✅ Terminés (v5.5.0)
- [x] **Audit de Sécurité & Fiabilité** : Correction race condition workers et accès window lazy.
- [x] **Gestion Stale References** : Nettoyage de `lastUsedTile` via `resetAnalysisCache()` dans `disposeScene`.
- [x] **Sécurité XSS Recherche** : Migration vers création d'éléments DOM sécurisés (`textContent`).
- [x] **Performance loadQueue** : Migration vers un `Set` pour des suppressions en O(1).
- [x] **Découplage Architectural** : Mise en place de l'Event Bus pour casser les cycles terrain <-> scene.
- [x] **Stabilisation Bâtiments RTX** : Fusion de géométrie et correction du bug de miroir Z.
