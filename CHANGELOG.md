# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.26.12] - 2026-04-08

### Optimized
- **Chargement Adaptatif** : La limite de tuiles par frame s'adapte désormais au preset de performance. Le Galaxy S23 (Performance) charge 25 tuiles/frame, tandis que l'A53 (Balanced) en charge 12, garantissant un équilibre optimal entre vitesse et fluidité sur chaque appareil.

## [5.26.11] - 2026-04-08

### Fixed
- **Chargement Initial** : Correction du bug où la carte restait partiellement vide au démarrage. Le moteur utilise désormais un système de "pulses" (self-scheduling) pour charger toutes les tuiles de la vue sans bloquer l'interface.

## [5.26.10] - 2026-04-08

### Fixed
- **Affichage des Tuiles** : Restauration de la réactivité grâce à un nouveau `throttle` (Leading + Trailing edge). Garantit que la position finale après un mouvement est toujours traitée.
- **Vitesse de Chargement (PC)** : Augmentation de la limite de chargement progressif à 25 tuiles par frame sur PC (8 sur mobile) pour un remplissage de vue plus rapide.

## [5.26.9] - 2026-04-08

### Optimized
- **Stabilité Framerate (PC)** : Implémentation du **Progressive Tile Loading**. Limite l'instanciation à 5 nouvelles tuiles par frame pour éviter les gels du thread principal (violations requestAnimationFrame).
- **Throttle Performance** : Refonte de la fonction `throttle` pour être plus légère et supprimer les micro-latences lors des mouvements caméra.

## [5.26.8] - 2026-04-08

### Added
- **Protocole de Release** : Ajout de la règle d'incrémentation obligatoire du `versionCode` Android dans `CLAUDE.md`.

### Optimized
- **Mémoire (Memory Parking)** : Nettoyage automatique des listes de résultats et des références DOM dans `SearchSheet` lors de la fermeture pour libérer la RAM sur mobile.

## [5.26.7] - 2026-04-08

### Added
- **Validation Géo** : Suite de tests unitaires pour la précision Haversine et l'algorithme d'hystérésis (`src/modules/geoPrecision.test.ts`).
- **Android Support** : Permission `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` pour garantir l'enregistrement des parcours longs.

### Optimized
- **Startup Perf** : Initialisation des PMTiles overview parallélisée et warmup différé (réduction du temps de blocage IO au démarrage).

## [5.26.6] - 2026-04-08

### Changed

#### Dette Technique & Audit
- **Nettoyage Chirurgical** : Suppression de la fonction dépréciée `downloadRecordedGPX()` dans `TrackSheet.ts`.
- **Désencombrement Racine** : Suppression des vieux scripts JS (`analyze_gpx*.js`), des fichiers GPX de test orphelins et des logs de session.
- **Réorganisation Scripts** : Déplacement des scripts Python vers `/scripts`.
- **Documentation IA-Ready** : Refonte complète de l'architecture documentaire avec archivage intelligent (`docs/archives/`) et unification de la monétisation.
- **Mise à jour Standards** : Révision de `CLAUDE.md`, `AI_ARCHITECTURE.md` et `AI_PERFORMANCE.md` avec les standards v5.26.6 (Haversine, Hystérésis 2m).

## [5.26.1] - 2025-04-08

### Fixed

#### REC (Enregistrement GPS)
- **Algorithme D+/D- corrigé** : Implémentation de l'hystérésis avec seuil de 2m (comme Garmin/Suunto). Les petites variations se cumulent jusqu'à atteindre le seuil.
- **Harmonisation des calculs** : Même algorithme dans `terrain.ts` et `TrackSheet.ts` pour des stats cohérentes.
- **Logs de debug** : Suppression des messages `[REC] Event` dans la console et des toasts de debug.

## [5.26.0] - 2025-04-08

### Fixed

#### REC (Enregistrement GPS)
- **Bug critique distance** : Correction de la formule de calcul (44% d'erreur). Passage de l'approximation planaire à Haversine.
- **Lissage altitude** : Ajout d'une moyenne mobile sur 3 points pour réduire le bruit GPS vertical (D+/D- plus réalistes).
- **2ème REC qui ne fonctionnait pas** : Fix du callback natif qui n'était pas ré-enregistré après l'arrêt du service.
- **GPX non créé après coupure** : Ajout de `saveGPXToFile()` lors de la recovery.
- **Points perdus au STOP** : Flush du buffer natif avant l'arrêt du service.

#### Stats et Affichage
- **Différence entre Parcours et Tracés importés** : Uniformisation des calculs (même formule Haversine + dédoublonnage).
- **Distance dans le profil** : Correction pour afficher la distance Haversine (0.24km) au lieu de la distance 3D (0.35km).
- **Décimales manquantes** : Passage à 2 décimales partout (consistance avec Garmin).
- **Tracés à 0km** : Validation des points avant création du layer.

#### UI/UX
- **Bouton export GPX** : Ajout d'un bouton 💾 dans "Tracés importés" pour exporter les GPX (visible dans Documents).
- **Message GPX sauvegardé** : Clarification pour utilisateurs gratuits ("dans l'app" vs "Documents").

### Technical

- Nettoyage des logs de debug
- Suppression des toasts de debug `[REC] ...`
- Ratio de conversion distance 3D → Haversine dans le profil

## [5.25.0] - 2025-04-01

### Added
- Feature X
- Feature Y

### Changed
- Modification Z

### Fixed
- Bug A
- Bug B
