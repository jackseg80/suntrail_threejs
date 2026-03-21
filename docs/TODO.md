# SunTrail 3D - Roadmap Révisée (v5.6.6)

## 🚀 Priorité 1 : Optimisations & Netteté (v5.6) - ✅ TERMINÉ
*Impact : Fluidité mobile absolue et rendu topographique pro.*

- [x] **Refactoring Architectural Terrain (Phase 1)** : Extraction de `TileCache` et `GeometryCache`.
- [x] **Extraction de `TileLoader` (Phase 2)** : Isolation de la logique réseau.
- [x] **Normal Map Pre-computation (Worker) (Phase 3)** : Déportation du relief vers les WebWorkers.
- [x] **Material Pooling (Shader Reuse) (Phase 4)** : Suppression des micro-freezes de compilation.
- [x] **Objectif Tests v5.6** : 93 tests unitaires validés au vert.
- [x] **Fix Voile Rouge Éco** : Désactivation forcée des pentes en mode 2D (Eco / Zoom <= 10).

## 🎯 Priorité 2 : Usage Terrain & Partage (v5.7)
*Impact : Rendre l'application indispensable pour la randonnée réelle.*

- [ ] **Système Offline-First Complet** :
    - Service Worker (interception réseau, cache intelligent persistant).
    - Support format PMTiles (carte mondiale/régionale dans un seul fichier).
- [ ] **Waypoints Personnalisés** : Marquage et sauvegarde de points d'intérêt (IndexedDB).
- [ ] **Deep Linking (Smart URL)** : Synchronisation de l'URL pour partager une vue 3D exacte.
- [ ] **Profil GPX Expert** : Coloration des pentes > 30° sur le profil et statistiques par segment.

## ✨ Priorité 3 : Immersion & Multi-Données (v5.8)
*Impact : Robustesse des données et effets visuels avancés.*

- [ ] **Multi-GPX Trace** : Support pour l'affichage et la gestion de plusieurs tracés simultanés.
- [ ] **Cloud Shadows** : Projection d'ombres de nuages basée sur les données réelles d'Open-Meteo.
- [ ] **Advanced Night Mode** : Pollution lumineuse urbaine (NASA VIIRS).

## 🔬 Recherche & Améliorations Futures
- [ ] **Sentiers Vectoriels (MVT) Pro** : Résoudre les problèmes de bundling des bibliothèques PBF dans les WebWorkers pour une netteté infinie.

## ✅ Terminés (v5.5.15)
- [x] **Suivi GPS Haute Précision** : Centrage "pixel-perfect" sur l'altitude réelle du relief (Swisstopo style).
- [x] **Lissage Boussole Swisstopo** : Filtre passe-bas (10%) sur le cap et mouvement pour une fluidité totale.
- [x] **Transition Solaire Parfaite** : Refonte des courbes pour une transition monotone Heure Dorée -> Nuit.
- [x] **Recherche Instantanée Peaks** : Affichage prioritaire des sommets locaux dès la saisie.
- [x] **Audit de Sécurité & Fiabilité** : Correction race condition workers, accès window lazy, et XSS recherche.
- [x] **Performance loadQueue** : Migration vers un `Set` pour des suppressions en O(1).
- [x] **Découplage Architectural** : Mise en place de l'Event Bus pour casser les cycles terrain <-> scene.
- [x] **Stabilisation Bâtiments RTX** : Fusion de géométrie et correction du bug de miroir Z.
- [x] **Couverture de Tests Critiques (v5.5)** : 63 tests au vert (100% pass rate).
