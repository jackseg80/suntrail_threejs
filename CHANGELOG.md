# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.38.1] - 2026-04-21
### Fixed
- **Synchronisation GPS & Artefacts "Champignons"** : Centralisation de la synchronisation des points dans `NativeGPSService.syncPoints()` pour garantir que le filtrage `cleanGPSTrack` est appliqué systématiquement, même lors du retour de l'application au premier plan.
- **Robustesse Filtrage GPS** : Ajout de vérifications de sécurité contre les valeurs `NaN` et injection de points (0,0) pour éliminer les lignes parasites sur le tracé en temps réel.
- **Fluidité de Rendu** : Throttling systématique de la mise à jour du mesh 3D lors de l'injection massive de points (reprise après background).

## [5.38.0] - 2026-04-20
### Added
- **Optimisation Mémoire Végétation** : Remplacement des objets `Matrix4` par des `Float32Array` plats pour les instances d'arbres, réduisant drastiquement le travail du Garbage Collector et le *stuttering*.
- **Accélération Spatiale Landcover** : Implémentation d'une grille spatiale 16x16 pour la détection des forêts, passant d'une recherche $O(N)$ à $O(1)$.
- **Générateur de Bâtiments Optimisé** : Nouveau système de génération 3D manuel utilisant `ShapeGeometry` pour les toits et un loop de murs ultra-rapide. Temps de génération CPU réduit de >60%.
- **Robustesse Bâtiments** : Gestion complète des cours intérieures (trous) et filtrage spatial par BBox pour éviter les empilements massifs sur les tuiles urbaines.

### Fixed
- **Réseau Overpass (CORS/406)** : Suppression du header `User-Agent` bloqué par les navigateurs et correction de l'identification des requêtes pour restaurer l'affichage des sommets et POIs.
- **Géométrie des Bâtiments** : Correction des toits volants, des murs invisibles et des glitches visuels ("flying gray lines") via une synchronisation stricte des repères locaux.
- **Intégrité des Tests** : Mise à jour et enrichissement de la suite de tests unitaires pour couvrir les nouvelles optimisations.

## [5.34.8] - 2026-04-19
### Fixed
- **Hotfix Build Android** : Correction définitive de la syntaxe du fichier `build.gradle` (guillemets mal échappés sur le `versionName`) pour débloquer la CI.
...
