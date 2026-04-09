# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.27.2] - 2026-04-09

### Fixed
- **Anti-Explosion Géométrique (Champignon)** : Mise en place d'un filtrage strict des points GPS. Tout saut d'altitude > 200m ou distance horizontale < 2m est ignoré pour le rendu 3D, évitant ainsi les artefacts visuels massifs ("champignons") dus aux imprécisions GPS.
- **Protection des Données (Sauvegarde)** : Inversion de la logique d'arrêt de l'enregistrement. Le fichier GPX est désormais écrit et le calque interne sauvegardé *avant* de libérer la mémoire ou d'arrêter les services natifs. En cas d'erreur de rendu, les points restent conservés pour une tentative ultérieure.
- **Stabilité Spline** : Passage en mode `centripetal` pour les courbes de tracé, éliminant les "overshoots" visuels lors des changements de direction brusques.

### Added
- **Test de Filtrage GPS** : Nouveau test unitaire validant le rejet des points GPS aberrants.

## [5.27.1] - 2026-04-08

### Added
- **Catalog v2** : Mise à jour de l'index interne pour supporter les packs HD du LOD 8 au LOD 14 (au lieu de 12-14) pour la Suisse et les Alpes Françaises.

### Fixed
- **Bug 404 Mobile** : Correction du catalogue embarqué qui utilisait des URLs relatives. Désormais, il utilise l'URL absolue du CDN R2, ce qui permet le téléchargement fiable même si l'environnement réseau ou les variables VITE sont absentes.
- **Robustesse Packs** : Restauration des URLs absolues dans le catalogue de secours pour un fallback offline-first fiable.

## [5.27.0] - 2026-04-08

### Added
- **Exemption Batterie** : Demande d'exemption des optimisations batterie Android au démarrage du REC pour éviter les coupures GPS en arrière-plan (Doze Mode).

### Fixed
- **Robustesse du Worker (Foreground Service)** : Ajout du type de service `location` (requis pour Android 10+). Empêche le système de tuer le worker lors de l'ouverture d'apps gourmandes en RAM (ex: Appareil Photo).
- **Persistence de Session** : Le worker récupère désormais son `courseId` et son `startTime` après un redémarrage forcé par le système. L'enregistrement ne repart plus de zéro.
- **Continuité du Chronomètre** : Le temps écoulé affiché dans la notification est désormais persisté et survit au redémarrage du service.

### Optimized
- **Précision Alpine** : Force le mode `PRIORITY_HIGH_ACCURACY` dès que l'utilisateur est en mouvement (> 3km/h) pour une trace parfaite en montagne.
- **Sécurité des Données** : Réduction du buffer d'écriture à 3 points (au lieu de 5) pour minimiser les pertes en cas d'arrêt brutal de l'appareil.
- **WakeLock Étendu** : Passage du verrouillage CPU à 24h (au lieu de 4h) pour les très longues randonnées.

## [5.26.13] - 2026-04-08

### Fixed
- **Fluidité Mobile (Audit-Ready)** : Ajustement des limites de chargement pour garantir les 60 FPS sur mobile. Le Galaxy S23 est bridé à 12 tuiles/frame et l'A53 à 8 tuiles/frame, utilisant le système de pulses (50ms) pour compléter la vue rapidement sans saccades.

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
