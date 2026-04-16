# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.29.21] - 2026-04-16
### Improved
- **Logs Config** : Rétablissement des messages informatifs dans la console pour suivre l'utilisation et la rotation des clés MapTiler.

## [5.29.20] - 2026-04-16
### Fixed
- **Résilience MapTiler (Relief)** : Implémentation d'une rotation automatique des clés d'API. En cas d'erreur 403, l'application change de clé au lieu de désactiver le service, garantissant le maintien du relief 3D.

## [5.29.19] - 2026-04-16
### Fixed
- **Résilience Réseau (Anti-Écran Blanc)** : Implémentation d'un timeout ultra-court (3s) et d'un disjoncteur agressif pour Overpass. Empêche la saturation des connexions du navigateur en cas de panne serveur, garantissant l'affichage prioritaire de la carte.

## [5.29.17] - 2026-04-16
### Fixed
- **Restauration de Stabilité** : Suppression des optimisations risquées (dédoublonnage workers, pooling mémoire) pour résoudre les problèmes d'écran blanc et de terrain plat.
- **Rendu 3D** : Simplification de l'injection des uniforms pour garantir l'affichage correct du relief et de l'éclairage sur tous les niveaux de zoom.

## [5.29.15] - 2026-04-16
### Fixed
- **Anti-Écran Blanc (CTRL+F5)** : Sécurisation de l'ancrage initial du terrain. Les appels Overpass et Météo sont différés pour prioriser le rendu 3D.
- **Boot Stability** : Verrouillage des contrôles caméra jusqu'à la stabilisation de l'origine du monde.

## [5.29.12] - 2026-04-16
### Optimized
- **Pooling Mémoire** : Réutilisation des buffers `Uint8ClampedArray` pour les données d'altitude. Réduit radicalement la pression sur le Garbage Collector et élimine les micro-saccades lors des vols.
- **Intégrité Offline** : Validation stricte des téléchargements de zones. L'application signale désormais si une zone est incomplète.

## [5.20.0] - 2026-04-12
### Refactored
- **Audit Dette Technique (Phases 1-4)** : Unification des algorithmes Haversine/Hystérésis, centralisation Terrain-RGB, modularisation Caméra (CameraManager) et Config, unification des caches RAM.
