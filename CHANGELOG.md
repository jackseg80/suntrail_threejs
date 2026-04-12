# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère à [Semantic Versioning](https://semver.org/lang/fr/).

## [5.28.24] - 2026-04-12
### Fixed
- **Android Build** : Correction du format de `versionName` dans le fichier Gradle (retrait des antislashs invalides).
- **Versioning** : Passage au `versionCode` **609** pour la release Google Play.

## [5.28.23] - 2026-04-12
### Fixed
- **Android Deployment** : Incrémentation du `versionCode` à **608** pour permettre la mise à jour sur la console Google Play.

## [5.28.22] - 2026-04-12
### Fixed
- **Stabilité TypeScript** : Résolution de 17 erreurs de compilation détectées par `tsc` (propriétés manquantes dans `Tile`, imports erronés, variables inutilisées et null checks).
- **Caméra** : Ajustement de la position initiale à **4 000 km** d'altitude pour correspondre exactement à la limite de dézoom maximale.
- **Tests** : Mise à jour des tests unitaires pour valider la nouvelle position de départ de la caméra.

## [5.28.21] - 2026-04-12
### Fixed
- **Contrôles Caméra** : Rétablissement de `MapControls` (au lieu de `OrbitControls`) pour retrouver le mode de navigation standard (clic gauche pour translater, clic droit pour tourner).
- **Zoom Initial** : Ajustement de la position de départ de la caméra pour démarrer au dézoom maximum (**LOD 6**) sur une vue globale.
- **Distance Caméra** : Augmentation de la distance maximale autorisée à 4 000 km pour permettre le dézoom complet.
- **Seuils POI** : Harmonisation du seuil d'affichage des signalisations 3D à **LOD 15** pour tous les presets de performance, évitant l'encombrement visuel à haute altitude.
- **Bâtiments MapTiler (Pro)** : Correction d'une erreur d'importation PBF (`pbf is not a constructor`) et amélioration de la densité de rendu (limite à 150 bâtiments par tuile).
- **Filtrage Géo** : Ajout d'un padding de 5% sur les limites de tuiles lors du rendu des bâtiments pour éviter les trous sur les bords.

## [5.28.20] - 2026-04-12
### Refactored
- **Architecture & Services (Phase 4)** :
  - Création du `geocodingService.ts` : extraction de la logique de recherche (MapTiler, Nominatim, Overpass) de `SearchSheet.ts` vers un service réutilisable.
  - Implémentation du système de **Feature Flags** (`featureFlags.ts`) pour centraliser le gatekeeping des fonctionnalités Pro (LOD, Solaire, Météo, Inclinomètre).
  - Unification des types géographiques : centralisation de l'interface `LocationPoint` dans `geo.ts` et suppression des définitions redondantes dans `state.ts` et `geoStats.ts`.
- **Unification des Caches & Modularisation 3D (Phase 3)** :
...
  - Création d'une classe universelle `BoundedCache<K, V>` (LRU) pour centraliser la gestion de la mémoire RAM et prévenir les fuites de données OSM.
  - Migration de `buildings.ts`, `hydrology.ts` et `poi.ts` vers `BoundedCache`, permettant un monitoring cohérent des ressources.
  - Création du `CameraManager` : externalisation de la logique de caméra, des animations `flyTo` et du resize WebGL depuis `scene.ts`, réduisant la complexité du moteur principal.
- **Unification Géo & Algorithmes (Phase 2)** :
  - Centralisation du décodage Terrain-RGB via la nouvelle fonction `decodeTerrainRGB()` dans `geo.ts`, éliminant les duplications dans `analysis.ts`, `vegetation.ts` et les tests.
  - Modularisation de la configuration : extraction de la logique complexe de résolution des clés MapTiler (Gist, localStorage, .env) dans `src/modules/config.ts`.
  - Nettoyage de `ui.ts` : allégement du fichier et suppression des `console.log` de debug de production.
- **Unification Géo & Algorithmes (Phase 1)** : 
  - Extraction de l'algorithme d'hystérésis (seuil 3m standard Garmin) dans une fonction utilitaire partagée (`calculateHysteresis`).
  - Correction du profil d'élévation pour utiliser l'hystérésis standard, garantissant une cohérence parfaite entre le graphique et les statistiques du tracé.
  - Suppression du "Distance Ratio Hack" dans le profil au profit d'un calcul de distance horizontale (2D) nativement aligné avec la formule Haversine (distance projetée).
  - Unification du calcul des limites de tuiles via `getTileBounds` et centralisation de la détection de pays (`isPositionInRegion`) pour faciliter l'ajout de nouvelles régions.
### Fixed
- **Optimisation CI/CD** : Unification des workflows `quality.yml` et `deploy.yml` dans un pipeline unique `ci-cd.yml`. Supprime la redondance d'exécution des tests unitaires et clarifie l'interface GitHub Actions.
- **Stabilité des Tests** : Correction d'une fuite d'état dans `PackManager` où les Maps internes n'étaient pas réinitialisées lors de l'appel à `initialize()`, causant des interférences entre les tests unitaires.
- **Mocking OPFS** : Mise à jour des tests d'intégration pour refléter correctement le nouveau comportement de synchronisation disque (`syncDiskStates`).

## [5.28.19] - 2026-04-12
### Fixed
- **Packs Pays : Affichage Stockage** : Correction du calcul de la taille totale dans le panneau Packs Pays. Désormais, seuls les packs réellement installés sur le disque (OPFS) sont comptés, excluant les packs achetés mais non téléchargés (streamés via CDN).
- **Packs Pays : Continuité Hors-ligne** : Autorise l'utilisation du fichier local (OPFS) même si une mise à jour est disponible au catalogue, garantissant l'accès à la cartographie HD sans connexion réseau obligatoire.
- **Packs Pays : Résilience Persistence** : Ajout d'une synchronisation automatique au démarrage (`syncDiskStates`) qui scanne l'OPFS pour restaurer l'état "installé" si le cache de l'application (localStorage) a été vidé. Évite les re-téléchargements inutiles de plusieurs centaines de Mo.

## [5.28.18] - 2026-04-12
### Fixed
- **Robustesse REC (Anti-Champignon)** : Unification du filtrage GPS temps-réel via `cleanGPSTrack`. Rejet strict des coordonnées (0,0) et des points trop proches (< 2.5m) pour éviter les artefacts géométriques sur Galaxy A53.
- **Précision D+/D-** : Implémentation d'une moyenne mobile 3 points sur l'altitude et passage au seuil d'hystérésis de 3.0m (standard Garmin). Élimine le bruit vertical des capteurs d'entrée de gamme.
- **Rendu Tracé (Galaxy S23)** : Augmentation de la résolution à 1500 segments et affinement de la simplification RDP (epsilon 1.0) pour un suivi fluide des virages serrés sans "traits droits".
- **Stabilité 3D** : Ajout d'un filtre de jitter de 1.0m lors du drapage sur le relief pour stabiliser le maillage.

## [5.28.17] - 2026-04-12
### Optimized
- **Pipeline CI/CD** : Retrait de Playwright des workflows GitHub Actions pour accélérer radicalement la CI et économiser les ressources. Les tests unitaires (Vitest) restent actifs en CI, tandis que les tests E2E (Playwright) sont conservés pour une validation manuelle locale.

## [5.28.16] - 2026-04-12
### Fixed
- **Stabilité CI (Playwright)** : Correction des workflows GitHub pour installer tous les binaires de navigateurs requis (Firefox, WebKit).
- **Robustesse E2E** : Ajout d'attentes explicites (`waitForSelector`) pour garantir que les widgets experts et les résultats de recherche sont chargés avant les interactions.

## [5.28.15] - 2026-04-12
### Added
- **Validation Totale UI (E2E)** : Ajout des tests pour les deux derniers piliers : la Recherche (avec interception API) et les Réglages (validation des presets et options de rendu).
- **Couverture exhaustive** : Tous les panneaux majeurs (`search`, `track`, `settings`, `weather`, `connectivity`, `sos`) sont désormais couverts par Playwright.

## [5.28.14] - 2026-04-12
### Added
- **Tests ExpertSheets** : Ajout de tests E2E pour valider l'ouverture des panneaux Météo, Connectivité, SOS et Simulation Solaire.
- **Support Multi-Navigateurs** : Activation de Firefox et Mobile Safari (WebKit) dans la configuration Playwright pour garantir la compatibilité cross-platform du moteur 3D.

## [5.28.13] - 2026-04-12
### Summary
- **Sprint Qualité & Unification** : Finalisation de l'infrastructure de tests et validation de l'unification de la logique GPS.

### Fixed
- **Stabilité Globale** : Validation finale des 503 tests unitaires et d'intégration.
- **CI/CD** : Les pipelines GitHub Actions sont désormais totalement opérationnels pour garantir la non-régression sur le web et Android.

## [5.28.12] - 2026-04-12
### Fixed
- **Robustesse E2E** : Correction des sélecteurs de canvas pour Playwright afin d'éviter les conflits de mode strict lorsque plusieurs canvas sont présents sur la page.

## [5.28.11] - 2026-04-12
### Improved
- **Architecture de Test** : Refonte du chargement de la clé API dans `iapService.ts` pour permettre une injection dynamique. Garantit la fiabilité des tests unitaires en environnement CI quelle que soit l'ordre d'exécution.

## [5.28.10] - 2026-04-12
### Fixed
- **Stabilité CI/CD** : Correction de `iapService.test.ts` pour injecter une clé API factice via `vi.stubEnv`, empêchant l'échec des tests en environnement GitHub Actions où les secrets ne sont pas disponibles.

## [5.28.9] - 2026-04-12
### Added
- **Intégration CI/CD (GitHub Actions)** : Automatisation des tests unitaires et E2E sur chaque push et pull-request.
- **Sécurisation des Pipelines** : Le déploiement Web et les builds Android sont désormais bloqués en cas d'échec des tests.
- **Workflow de Qualité** : Nouveau workflow dédié pour un feedback rapide sur la stabilité du projet.

## [5.28.8] - 2026-04-12
### Fixed
- **Fiabilité des Tests E2E** : Correction du nom de calque attendu (basé sur le nom du fichier) et renommage des données de test pour une meilleure cohérence (`E2E-Test-Track.gpx`).

## [5.28.7] - 2026-04-12
### Added
- **Validation Avancée UI (E2E)** : Ajout de tests Playwright pour la `TrackSheet` (Importation GPX, parsing et validation des statistiques D+/Distance).
- **Données de test** : Intégration d'un fichier GPX de référence pour les tests E2E.

## [5.28.6] - 2026-04-12
### Added
- **Infrastructure de Tests E2E (Playwright)** : Mise en place complète de Playwright pour valider les parcours utilisateurs critiques (Acceptance Wall, Onboarding, Consentement GPS).
- **Tests Unitaires du Cœur 3D** : Sécurisation de `scene.ts` (boucle de rendu, LOD, flyTo) et `touchControls.ts` (gestes tactiles) avec Vitest.
- **Robustesse de l'Interface** : Amélioration de la couverture de `ui.ts` et du `SheetManager`.

### Fixed
- **Tests d'Intégration (Hydrologie)** : Correction de l'assertion pour l'affichage de l'eau suite au passage vers `hydroGroup`.
- **Tests d'Intégration (PackManager)** : Enrichissement des mocks pour supporter les offsets Hilbert des tuiles multi-couches.
- **Fiabilité des Tests UI** : Utilisation de timers fictifs et de mocks réseau globaux pour éviter les rejets asynchrones après fermeture de l'environnement de test.

## [5.28.5] - 2026-04-11
### Added
- **Refonte des Bâtiments 3D (Anti-Gravité)** : Implémentation d'un échantillonnage multi-points de l'altitude. Les bâtiments sont désormais ancrés au sol à leur point le plus bas sur les pentes, éliminant l'effet de "bâtiments volants" en montagne.
- **Fondations de Sécurité** : Ajout d'une "jupe" de 5m sous le niveau du sol pour garantir une jonction parfaite avec le relief, même avec une forte exagération du relief.
- **Visibilité Étendue** : Augmentation du rayon de rendu (jusqu'à 7 tuiles en mode Ultra) et réduction de l'écrêtage agressif pour les bâtiments lointains.
- **LOD Dynamique par Preset** : Ajustement automatique de la distance de visibilité selon le preset de performance (Balanced: 3x, Performance: 5x, Ultra: 7x).

## [5.28.4] - 2026-04-11
### Fixed
- **Signalisation 3D (Restaurée)** : Correction du rendu des losanges (signpost) avec un nouveau design à gradient radial, une bordure plus épaisse et une taille accrue (24px).
- **Fiabilité POI** : Ajout d'une priorité haute pour les requêtes Overpass et validation du statut de tuile 'loaded' avant le calcul de l'altitude.
- **Transparence** : Désactivation du `depthWrite` pour les sprites de signalétique, éliminant les artefacts visuels et les "trous" dans le relief.

### Optimisations & Refactoring
- **Standardisation Géo** : Déplacement des fonctions `isPositionInSwitzerland/France` vers `geo.ts` pour une meilleure cohérence modulaire.
- **Unification du Plaquage (Draping)** : Création d'une fonction `drapeToTerrain` centralisée dans `analysis.ts`, éliminant les doublons de logique dans `terrain.ts`.
- **Nettoyage Architecture** : Suppression des fonctions `getDistance` redondantes dans `gpsDeduplication.ts` et `peaks.ts` au profit de `haversineDistance` dans `utils.ts`.
- **Roadmap V6** : Planification de l'unification des systèmes de cache.

## [5.28.3] - 2026-04-11
### Optimisations
- **Centralisation GPS** : Unification de toute la logique de nettoyage (tri, dédoublonnage, altitude, vitesse, bruit) dans un module unique `gpsDeduplication`.
- **Performance Rendu** : Suppression des calculs redondants de filtrage dans `terrain.ts` (boucle de rendu) pour une meilleure fluidité sur mobile.
- **Fiabilité Stats** : Utilisation du nettoyage centralisé pour les calculs de distance et dénivelé dans `geoStats`.

## [5.28.2] - 2026-04-11

### Added
- **Optimisation GPS (RDP)** : Simplification Ramer-Douglas-Peucker en 3D pour des tracés fluides sans saccades (mobile-first).
- **Auto-pause Intelligent** : Détection d'immobilité (< 0.8 km/h pendant 30s) pour suspendre proprement l'enregistrement.
- **Persistance Temps Réel** : Utilisation de `@capacitor/preferences` pour sauvegarder chaque point GPS instantanément (protection anti-crash).
- **Mode Hors-ligne v3** : Support complet des packs multi-couches (Couleur + Relief + Overlay) dans un seul fichier PMTiles.

### Fixed
- **Stabilité 2D/3D** : Éradication des \"écrans blancs\" via un mode de chargement prioritaire (force) sur le centre de la carte.
- **Mandat Hiérarchie** : Migration systématique vers `scene.add` pour les objets 3D (POI, bâtiments, hydrologie), garantissant leur persistance lors des mises à jour du relief.
- **Rendu 2D** : Suppression de l'effet de fondu pour un affichage immédiat à 100%.
- **Inclinomètre** : Correction du raycasting et fluidification du drag-and-drop via requestAnimationFrame.

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

## [5.27.4] - 2026-04-10

### Fixed
- **Traits Parasites (REC)** : Correction des lignes rouges qui traversaient parfois le tracé. Ajout d'un tri chronologique systématique des points GPS avant le rendu du maillage 3D.
- **Champignon au démarrage** : Filtrage des points GPS invalides (altitude à 0 ou coordonnées 0,0) durant les premières secondes de l'enregistrement, empêchant l'explosion géométrique initiale du mesh.
- **Intégrité de Courbe** : Désactivation forcée de la fermeture de courbe (`closed: false`) sur les splines de tracé.

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
