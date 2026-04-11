# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.27.12] - 2026-04-11

### Fixed
- **Signalisation 3D** : Restauration des indicateurs jaunes et adoption de la forme **losange** pour une meilleure visibilité.
- **Bug de mouvement (POI)** : Correction du bug de \"double positionnement\" qui provoquait la disparition des signalisations lors du déplacement ou du zoom de la carte. Les objets 3D sont désormais correctement transférés lors des changements de relief (LOD).
- **Fiabilité Overpass** : Mise en place d'une rotation automatique sur 3 serveurs et d'un système de priorité pour les POIs. Ajout d'un \"disjoncteur\" (circuit breaker) qui désactive temporairement les données lourdes (Hydrologie/Bâtiments) en cas de saturation des serveurs OSM pour préserver la fluidité.
- **Altitude des POIs** : Ajout d'un mécanisme de retry automatique si le relief charge lentement, évitant que les indicateurs ne soient masqués sous le sol.
- **Déploiement GitHub Pages** : Résolution des erreurs 404 sur le manifeste PWA et les ressources statiques via l'utilisation d'une base relative (`base: ''`) et l'inclusion forcée des tuiles Overview.
- **Erreurs de compilation** : Nettoyage des identifiants en double (`recordingOriginTile`, `_detailTimer`) introduits lors des fusions précédentes.

### Optimized
- **Démarrage Web (PC)** : Suppression de l'écran blanc initial de 15s. Le montage des packs pays est désormais parallélisé et différé après l'affichage de la carte.
- **Seuil de visibilité** : Abaissement du seuil d'apparition de la signalisation au **zoom 14** (au lieu de 15) pour assurer la visibilité des panneaux lors de l'usage des packs hors-ligne Suisse et France.

## [5.27.7] - 2026-04-10

### Added
- **Architecture \"Full Offline\" (v3)** : Support complet de l'élévation (relief 3D) et de l'overlay (chemins) directement à l'intérieur des packs pays. Plus besoin de connexion réseau pour le relief une fois le pack installé.
- **Nouveau Script de Build** : Mise à jour de `build-country-pack.ts` pour générer des archives multi-couches utilisant des offsets d'ID (Couleur @ 0, Élévation @ 100Md, Overlay @ 200Md).
- **Option --maptiler-key** : Possibilité de spécifier une clé API spécifique pour les builds massifs de packs pays.

### Fixed
- **Offsets d'ID** : Correction du calcul des IDs Hilbert dans le `packManager` pour adresser correctement les calques d'élévation et d'overlay.
- **Tests d'Intégration** : Mise à jour de la suite de tests pour couvrir les nouveaux types de données et les offsets.

## [5.27.6] - 2026-04-10

### Added
- **Accès Premium Web (Pack Suisse HD)** : Offre gratuite de la cartographie SwissTopo HD (LOD 14) pour tous les utilisateurs de la version Web (PWA/GitHub Pages) via streaming CDN.
- **Support Packs Web** : Activation des "achats virtuels" sur le Web pour permettre le téléchargement et l'usage des packs pays en local (OPFS) sans passer par le Play Store.
- **Paramètres Debug URL** : Ajout de `?allpacks=true` et `?dev=true` pour débloquer instantanément tous les packs pays à des fins de test et démonstration.

### Optimized
- **Fluidité du Rendu (Non-blocking Tiles)** : Refonte de la logique de chargement des tuiles pour rendre l'injection des packs (seeding) asynchrone. Le thread principal n'est plus bloqué par les accès fichiers PMTiles, garantissant un scrolling à 60fps même lors de l'usage intensif de packs locaux.
- **Priorité des Sources** : Consolidation de la logique de priorité (Packs > Cache > Réseau) validée par une nouvelle suite de tests d'intégration.

## [5.27.6] - 2026-04-10

### Fixed
- **Superposition UI (z-index)** : Correction du bug où l'inclinomètre et le réticule s'affichaient au-dessus des menus (bottom sheets). Ils sont désormais correctement positionnés sous l'overlay des menus.
- **Mobilité du Widget** : Le widget de texte de l'inclinomètre est désormais déplaçable (drag & drop) comme le réticule. Un double-tap permet de réinitialiser sa position par défaut.

## [5.27.5] - 2026-04-10

### Added
- **Inclinomètre Interactif (Réticule Mobile)** : Ajout d'un viseur (crosshair) indépendant du widget texte, déplaçable sur tout l'écran pour mesurer la pente n'importe où sur la carte (via Raycasting 3D).
- **Mode Suivi GPS Contextuel** : En mode suivi, le réticule se masque et l'inclinomètre mesure automatiquement la pente à **15m devant l'utilisateur** (anticipation de l'effort) en utilisant son cap (`userHeading`).
- **Coloration Dynamique de Danger** : Le réticule et le widget changent de couleur en temps réel (Gris/Jaune/Orange/Rouge) selon les seuils d'inclinaison (30°, 35°, 40°) pour une lecture rapide du risque d'avalanche.
- **Gestes de Reset** : Double-clic sur le réticule pour le recentrer. Reset automatique au centre lors du clic sur le bouton de position GPS.

### Fixed
- **Pertinence des Mesures** : L'inclinomètre ne mesure plus systématiquement le centre de l'écran par défaut, mais s'adapte à l'usage (position utilisateur ou point visé).

## [5.27.13] - 2026-04-11

### Fixed
- **Anti-Glitch GPS (Champignon)** : Filtrage horizontal strict (> 1km en < 10s ignoré) pour éliminer les pics géants dus aux imprécisions GPS.
- **Tri Chronologique (REC)** : Tri systématique par timestamp lors de la réception, de l'affichage et de la génération du fichier GPX. Empêche la corruption des tracés en cas d'arrivée désordonnée des points.
- **Robustesse Rendu** : Filtrage anti-frétillement ajouté aux calques GPX importés pour éviter les crashs de `TubeGeometry`.

## [5.27.12] - 2026-04-11

## [5.27.3] - 2026-04-09

### Fixed
- **Alignement GPX (Floating Origin)** : Correction d'un bug majeur où les tracés GPX importés et le tracé en cours "suivaient" l'utilisateur lors de grands déplacements (ex: voiture après une rando). Désormais, tous les maillages de parcours sont recalculés instantanément lors d'un décalage d'origine (Origin Shift), garantissant qu'ils restent parfaitement ancrés à leurs coordonnées géographiques.
- **Simplification Coordonnées** : Suppression de la `recordingOriginTile` qui causait des désynchronisations. L'application utilise désormais une source unique de vérité pour l'origine du monde 3D.

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
