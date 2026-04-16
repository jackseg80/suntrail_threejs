# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.29.8] - 2026-04-16
### Fixed
- **Validation Totale** : Correction des tests unitaires de persistance GPS et de performance. Tous les tests (540+) sont désormais au VERT.
- **Dette Technique** : Export des constantes de version pour assurer la cohérence des tests de stockage.

## [5.29.7] - 2026-04-16
### Fixed
- **Débrayage Performance Adaptatif** : Remplacement du forçage mode ECO par une réduction dynamique de la résolution (DPR). L'app retrouve sa qualité originale automatiquement dès que les FPS remontent.
- **Garde-fou Chargement** : La surveillance des FPS est désormais suspendue pendant le chargement des tuiles pour éviter les faux-positifs sur les machines puissantes.
- **i18n** : Ajout des messages de statut pour le mode adaptatif dans les 4 langues.

## [5.29.6] - 2026-04-16
### Added
- **Persistance de Vue** : Sauvegarde et restauration automatique de la position (Lat/Lon) et du zoom pour une reprise invisible après un redémarrage de l'application par l'OS.

### Fixed
- **Gestion du Stockage GPS** : Auto-purge des points non sauvegardés après 48h et limitation à 10 000 points pour protéger l'espace disque.
- **Auto-Throttle Performance** : Bascule automatique en mode ECO si le rendu descend sous 15 FPS pendant 10s.
- **Confidentialité des Logs** : Masquage des logs techniques et protection des informations sensibles en production via `DEBUG_MODE`.

## [5.29.5] - 2026-04-16
### Fixed
- **Fuites de mémoire UI** : Nettoyage rigoureux des abonnements `EventBus` et des écouteurs `window` dans `TrackSheet`, `ExpertSheets` (SOS) et `InclinometerWidget`.
- **Résilience Réseau** : Ajout de timeouts de 10s sur les requêtes de tuiles et implémentation de `AbortController` dans le service de recherche pour annuler les requêtes obsolètes.
- **Concurrence Workers** : Implémentation du dédoublonnage des requêtes en cours (*in-flight deduplication*) dans le `workerManager` pour éviter de décoder plusieurs fois la même tuile.

### Improved
- **Accessibilité (A11y)** : Augmentation de la taille des cibles tactiles à 44px (paramètres, thèmes) et 36px (chips de recherche). Passage de la taille de police minimale à 11px pour une meilleure lisibilité en extérieur.

## [5.29.4] - 2026-04-16
### Added
- **Test de Robustesse GPX** : Ajout d'une suite de tests couvrant les fichiers corrompus, les tracés géants (50k points) et les altitudes manquantes.

### Fixed
- **Protection Mémoire (RAM)** : Validation du mécanisme LRU/FIFO dans `tileCache.ts` pour prévenir les crashs par manque de mémoire sur mobile.
- **Sécurité des Données** : Audit complet des injections DOM. Utilisation systématique de `textContent` pour les données provenant des API de recherche et de météo.
- **Cohérence Offline** : Sécurisation de la cascade de fallbacks PMTiles ↔ Packs ↔ Réseau.

## [5.29.3] - 2026-04-16
### Fixed
- **Stabilité VRAM & Cache** : Résolution d'un conflit critique où les textures étaient détruites alors qu'elles étaient encore présentes dans le cache mémoire. Ajout d'une vérification `hasInCache()` dans le cycle de vie des tuiles.
- **Résilience API** : Implémentation d'un circuit breaker pour MapTiler. En cas d'erreur 403 ou 429, l'application bascule automatiquement sur les sources de secours (OpenTopoMap/OSM) sans interruption.
- **Conditions de Course au Démarrage** : Sécurisation de l'accès aux objets Three.js (camera, controls, sunLight) dans les widgets pour éviter les crashs lors d'interactions ultra-rapides au lancement.
- **Réactivité PRO** : Correction du cycle de notification asynchrone pour l'activation des essais (Trial).

### Optimized
- **Autonomie Batterie (Deep Sleep)** : Le moteur de rendu descend désormais à ~1.5 FPS après 30 secondes d'inactivité, préservant la batterie en randonnée tout en maintenant l'affichage de la trace.
- **Unification Algorithmique** : Centralisation définitive de `haversineDistance()` dans `geo.ts` comme source de vérité unique pour tout le projet.

## [5.29.2] - 2026-04-15
### Fixed
- **Accès PRO Full Réactif** : Déverrouillage instantané du Satellite, de la Météo et du Solaire lors de l'activation d'un essai (Trial). Plus besoin de redémarrer l'app.
- **Robustesse du Moteur** : Ajout d'une suite de 7 tests de stabilité couvrant les clés de tuiles, la persistance GPS et la logique PRO.

## [5.29.1] - 2026-04-15
### Fixed
- **Accès PRO & Trial** : Correction de l'accès aux fonctionnalités avancées (Météo, Solaire) qui étaient bloquées pour les utilisateurs en période d'essai gratuite. Utilisation systématique de `isProActive()`.
- **Chronomètre GPS** : Persistance du temps de début d'enregistrement (`recordingStartTime`). Le chrono reprend désormais sa valeur réelle lors d'une récupération automatique (crash, redémarrage worker).
- **Synchronisation Solaire** : Mise à jour réactive du sélecteur de date lors de l'activation du statut Pro.

## [5.29.0] - 2026-04-15
### Fixed
- **Moteur de Terrain "Étanche"** : Correction structurelle des fuites de mémoire et des superpositions. La fluidité est radicalement améliorée par la libération explicite de la VRAM (`texture.dispose()`).
- **Superposition de Sources** : La clé unique des tuiles inclut désormais `MAP_SOURCE`, empêchant définitivement le mélange Swisstopo/OpenTopo.
- **Transitions LOD** : Rétablissement de la logique asymétrique et purge immédiate des fantômes au Zoom-Out pour supprimer l'effet "mille-feuille".
- **Performance Mobile** : Gain de fluidité majeur via le chargement asynchrone (seeding non-bloquant) et réduction du fondu à 300ms.
- **Android Build** : Fix syntaxique du build Gradle.

### Optimized
- **Startup Speed** : Accélération radicale du démarrage (requestAnimationFrame + non-blocking load). L'interface s'affiche instantanément.
- **Réactivité PC** : Pulse de chargement réduit à 30ms.

## [5.28.37] - 2026-04-15
### Fixed
- **Superposition LOD** : Correction d'un bug majeur où les tuiles restaient affichées lors du dézoom si la caméra était proche du sol (garde-fou `camera.y < 1` déplacé pour ne plus bloquer la purge).
- **Transitions LOD** : Retour aux transitions symétriques (fondu progressif au zoom ET dézoom) pour éliminer les trous visuels et les clignotements.
- **Fuites VRAM** : Correction de `Tile.dispose()` pour relâcher les matériaux dans le `materialPool` et ne plus détruire les géométries partagées du cache.
- **Fluidité Ghost Tiles** : Augmentation du fondu LOD à 800ms (contre 300ms) pour une navigation plus soyeuse.

## [5.28.36] - 2026-04-14
### Optimized
- **Performance LOD** : Purge systématique de `loadQueue` au `dispose()` et suppression instantanée des tuiles détaillées lors d'un dézoom pour éviter les chevauchements visuels.
- **Circuit Breaker Overpass** : Durcissement du disjoncteur (3 échecs → 10 min de blocage) pour préserver la fluidité en cas d'instabilité des serveurs OSM.
- **Météo** : Augmentation de l'intervalle minimum (15s) et implémentation d'un debouncing (1s) lors des mouvements de caméra pour réduire la charge réseau.

### Fixed
- **Décalage GPX** : Centralisation du rafraîchissement terrain (`refreshTerrain`) garantissant le recalage automatique des maillages GPX après une téléportation (Recherche, Position).

## [5.28.35] - 2026-04-14
### Optimized
- **Remplissage Carte** : Augmentation du quota de tuiles par frame (40 sur PC, 20 sur mobile Performance) et réduction du délai de rafraîchissement à 50ms pour un affichage plus réactif lors de la navigation.

## [5.28.34] - 2026-04-14
### Fixed
- **Fluidité de Navigation** : Implémentation d'un debouncing (100-150ms) sur la génération des géométries GPX et des traces enregistrées. Supprime les micro-saccades lors des mouvements de caméra.

## [5.28.33] - 2026-04-14
### Fixed
- **Cache Local** : Unification du cache (`suntrail-tiles-v28`) et synchronisation de l'injection (await seeding). Résout l'absence d'affichage des Packs Pays (Suisse LOD 12-14) et PMTiles en mode hors-ligne.

## [5.28.32] - 2026-04-14
### Added
- **Contrôle GPS** : Désactivation de l'indicateur de position par appui long (2 secondes) sur le bouton GPS.
### Fixed
- **Basculement 2D/3D** : Correction du décalage visuel du marqueur utilisateur (altitude) lors du switch de mode.
- **Indicateur de Position** : Le point rouge ne se téléporte plus lors des recherches (automatiquement masqué si trop loin du centre).
- **Bug UI** : Correction d'un blocage du bouton position suite à l'implémentation de l'appui long.

## [5.28.31] - 2026-04-14
### Fixed
- **Indicateur de Position** : Nouveau point rouge haute visibilité avec taille constante à l'écran quel que soit le zoom.
- **Visibilité X-Ray** : Le point de position est désormais toujours visible, même derrière le relief (depthTest: false).
- **Réactivité PRO** : Correction de l'abonnement réactif dans l'onglet Parcours : l'encart "éphémère" disparaît désormais instantanément lors de l'activation du PRO ou de l'essai.
- **Feedback Immédiat** : Le point de position s'affiche désormais dès le premier clic sur le bouton centrage (plus besoin d'activer le suivi continu).

## [5.28.30] - 2026-04-14
### Fixed
- **Pixel Soup** : Force la mise à jour immédiate du LOD après un vol (`flyTo`) en brisant le verrou de 800ms.
- **LOD Artifacts** : Correction du chevauchement des tuiles lors de zooms rapides par nettoyage strict des coordonnées.
- **Trace Rouge** : Suppression des traits droits parasites en temps réel par dédoublonnage strict des timestamps GPS.
- **Expérience Free** : Clarification de l'enregistrement éphémère (mémoire vive) et affichage permanent **réactif** de l'encart PRO (disparaît dès l'activation du PRO ou de l'essai).
- **Compilation** : Fix d'une erreur de type dans `TimelineComponent.ts`.

## [5.28.29] - 2026-04-12
### Fixed
- **Fluidité LOD** : Réduction du temps de fondu des tuiles (**300ms**) et du throttle (**100ms**) pour supprimer les scintillements.
- **Android Release** : Synchronisation finale des versions (versionCode 651, versionName 5.28.29).

## [5.28.28] - 2026-04-12
### Fixed
- **Stabilité TypeScript** : Correction des erreurs de compilation et des types orphelins.
- **Caméra** : Fix de la position de départ au dézoom maximum (4 000 km).

## [5.28.27] - 2026-04-12
### Added
- **Navigation Tactile** : Implémentation du double-tap pour zoomer.
- **Retour Haptique** : Ajout d'un feedback tactile sur mobile.

## [5.28.26] - 2026-04-12
### Fixed
- **UI Réglages** : Correction des limites des curseurs de résolution et de rayon.

## [5.28.25] - 2026-04-12
### Fixed
- **Moteur Cartographique** : Alignement LOD 16+ hors Suisse/France.

## [5.28.24] - 2026-04-12
### Added
- **Reverse Geocoding GPX** : Suggestion automatique de noms de parcours basés sur le lieu.
- **Gestion des Tracés** : Dialogue interactif de renommage après enregistrement.

## [5.20.0] - 2026-04-12
### Refactored
- **Audit Dette Technique (Phases 1-4)** : Unification des algorithmes Haversine/Hystérésis, centralisation Terrain-RGB, modularisation Caméra (CameraManager) et Config, unification des caches RAM.
