## [5.39.0] - 2026-04-25
### Changed
- **Refactor index.html** : Nettoyage massif du fichier HTML principal (-90% de lignes). Extraction de 14 templates UI vers des fichiers .html individuels chargés à la demande via Vite.
- **Architecture UI** : Évolution de BaseComponent pour supporter l'injection dynamique de templates HTML via les imports ?raw.

## [5.38.5] - 2026-04-25
### Fixed
- **UI Collision** : Repositionnement automatique de l'inclinomètre en haut de l'écran lors de l'ouverture de la barre temporelle (Timeline) pour éviter les chevauchements.
- **Stabilité de Position** : L'inclinomètre mémorise désormais les déplacements manuels par l'utilisateur et désactive l'ajustement auto dans ce cas.

## [5.38.4] - 2026-04-25
### Added
- **Migration PBF Totale (Sommets, POIs, Bâtiments)** : Suppression définitive de l'API Overpass pour éliminer les erreurs CORS/406 et fiabiliser l'affichage.
- **Unification du Cache** : Passage à l'API Cache du navigateur pour les POIs et Sommets (plus performant et persistant).
- **Optimisation POI (v5.38.4)** : Ajustement de l'altitude automatique en mode 2D (fix parallax) et détection élargie de la signalétique randonnée.

### Improved
- **Sécurité du Typage** : Renforcement du typage dans landcover.ts avec des interfaces strictes pour les données vectorielles.

# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.38.3] - 2026-04-21
### Fixed
- **Robustesse Enregistrement GPS (Samsung A53)** : Correction du bug de la "ligne droite" et du début de parcours manquant.
  - Implémentation d'un filtre de rejet des positions "stale" (anciennes) au démarrage.
  - Maintien forcé de la `HIGH_ACCURACY` tant que l'utilisateur est en mouvement (évite le basculement en mode éco/Cell qui coupait le GPS en arrière-plan sur Galaxy A53).
  - Assouplissement temporaire du filtre de précision (100m) pour les 5 premiers points afin de garantir un accrochage immédiat de la trace.
  - Ajustement des seuils de vitesse pour l'intervalle adaptatif, mieux adapté à la randonnée lente en forte pente (seuil abaissé à 1.8 km/h).

## [5.38.2] - 2026-04-21
### Added
- **Optimisation du Panoramique (Tuiles)** : Augmentation du rayon de chargement forcé (5x5) pour les presets High/Ultra et élargissement de la marge de visibilité (60%) pour les presets Eco/Balanced. Mode 2D Mobile ultra-généreux (100% de marge) pour une fluidité parfaite sans "pop-in".
- **Mode Topo (Auto)** : Renommage du fond de carte "Topo CH" en "Topo (Auto)" pour refléter la sélection dynamique et intelligente de la meilleure source topographique selon la position.
- **Support Officiel de l'Italie** : Intégration de la région Italie et utilisation systématique d'OpenTopoMap (LOD 11-17) pour garantir un rendu montagneux homogène et précis.
- **Indicateur de Source Dynamique** : Le label de statut en haut à gauche affiche désormais la source réelle au centre de l'écran (SWISS, IGN FR, ITALY, WORLD, SAT).

### Fixed
- **Build Android** : Correction d'une erreur de syntaxe (backslashes parasites) dans le fichier `build.gradle` empêchant la compilation.
- **Lisibilité des Étiquettes (IGN/OpenTopo)** : Implémentation d'un "effet Loupe" (boost 0.5) pour les sources non-suisses. Cela décale l'affichage d'un niveau de zoom (LOD) complet pour doubler la taille visuelle des noms de villes et villages, compensant la petite taille native des polices IGN et Italiennes.
- **Transitions Frontalières (Aoste/Chamonix)** : Affinage chirurgical des segments géographiques (BBoxes) pour épouser les frontières réelles et supprimer définitivement les tuiles blanches ou les mélanges de styles à Aoste et dans les Alpes.
- **Unification Visuelle LOD 11** : Extension de la source mondiale unique jusqu'au LOD 11 pour supprimer le "patchwork" visuel lors de la transition vers les cartes haute résolution.
- **Sécurité des Packs Hors-ligne** : Les packs Suisse et France sont désormais bridés géographiquement pour ne plus polluer les territoires voisins avec leurs styles locaux.
- **Fiabilité LOD 12+** : Correction d'une erreur de comparaison inclusive dans la détection géographique, restaurant le chargement complet de SwissTopo en Suisse centrale.

## [5.38.1] - 2026-04-21

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
