# Changelog

Toutes les modifications notables de ce projet seront documentées ici.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
et ce projet respecte le [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.29.44] - 2026-04-18
### Fixed
- **Sélection de Tracé** : Correction d'un oubli d'abonnement au changement de calque actif. Désormais, les cartes de statistiques principales se mettent instantanément à jour dès qu'on sélectionne un tracé dans la liste.

## [5.29.43] - 2026-04-18
### Fixed
- **Affichage Stats GPX** : Correction de l'UI pour que les cartes de statistiques (Distance, D+, Temps estimé) se mettent à jour lors de la sélection d'un tracé dans la liste, et non plus seulement lors d'un enregistrement en direct.

## [5.29.42] - 2026-04-18
### Fixed
- **Temps Estimé GPX** : Correction d'un bug où les tracés importés sans horodatage (timestamps) affichaient une durée nulle. Ajout de marqueurs temporels fictifs incrémentaux lors de l'import pour permettre le calcul de la méthode Munter.

## [5.29.41] - 2026-04-18
### Added
- **Méthode Munter** : Implémentation du calcul du temps de marche estimé basé sur la distance et le dénivelé (norme suisse : 1h = 4km horizontal ou 400m vertical).
- **Affichage Durée** : Ajout du temps estimé dans le panneau de parcours pour les enregistrements en direct et les tracés importés.

### Improved
- **Roadmap v6.0** : Mise à jour des objectifs futurs incluant le planificateur de trajet (Routing Komoot-style).

## [5.29.40] - 2026-04-18
### Added
- **Auto-Cleanup du Cache** : Implémentation d'un système de nettoyage automatique des anciennes versions du cache (`v28`, `v29`, etc.) au démarrage pour libérer l'espace disque et garantir l'intégrité des tuiles.

### Improved
- **Robustesse Satellite** : Refonte du calcul de zone frontalière (check au centre) pour une transition SwissTopo Satellite beaucoup plus fiable et performante.
- **Enforcement du Mode Satellite** : Garantie technique que le mode satellite ne renvoie jamais de tuiles Topo, même en cas de repli (fallback vers ESRI Satellite).

## [5.29.39] - 2026-04-18
### Fixed
- **Satellite Suisse (LOD 11-14)** : Correction d'un bug où les packs de pays (Topo) écrasaient les tuiles satellite du réseau en raison d'une interception trop agressive des sources locales.
- **Limites Géo Suisse** : Élargissement léger de la BBox Suisse (`REGIONS.CH`) pour éviter les basculements prématurés vers MapTiler/OSM sur les tuiles-frontière à faible zoom.

## [5.29.38] - 2026-04-18
### Added
- **ExpertService** : Nouveau service centralisant la logique métier des Expert Sheets (Météo, Solaire, SOS).
- **Super-Notification Android** : Bouton "Arrêter REC" directement dans la notification et mise à jour dynamique des statistiques (km et D+) en temps réel.
- **Tests Expert** : Validation unitaire de la génération des messages SOS et des rapports.

### Improved
- **Unification des Caches** : Migration de `tileCache` et `geometryCache` vers un moteur unique `BoundedCache` avec support du pinning. Libération automatique de la VRAM lors de l'éviction.
- **Stabilité de Persistance** : Migration de `localStorage` vers Capacitor `Preferences` pour l'état d'enregistrement (évite les erreurs de sécurité sur certains OS).
- **Modularité UI** : Allègement de `ExpertSheets.ts` via délégation au service expert.
- **Robustesse Recording** : Correction de types et nettoyage des imports sur `RecordingService`.

## [5.29.37] - 2026-04-18
### Added
- **RecordingService** : Nouveau service centralisant la logique d'enregistrement GPS, les permissions et la coordination avec les services natifs. Allègement massif de `TrackSheet.ts`.
- **GPXService** : Centralisation des utilitaires d'import/export GPX pour une meilleure testabilité.
- **Tests de Robustesse Terrain** : Validation unitaire de `tileQueue.ts` pour garantir la priorité de chargement des tuiles visibles.
- **Validation UI** : Tests unitaires pour `SettingsSheet.ts` simulant les interactions DOM.

### Improved
- **Blindage Monétisation** : Couverture de `iapService.ts` augmentée de 26% à >80%. Tests exhaustifs des cas d'erreurs réseau, annulations et expirations.
- **Stabilité IAP** : Correction d'une race condition serveur via un délai de re-vérification de 2s après achat si les entitlements ne sont pas immédiatement mis à jour.
- **Qualité Globale** : Passage à plus de 580 tests unitaires validés.

## [5.29.36] - 2026-04-18
### Fixed
- **Dette Technique** : Suppression des fichiers racines obsolètes (`CHANGES_v5.25.1.md`, `catalog.json`) et du script `update_locales.py`.
- **Organisation Documentaire** : Archivage massif des anciens plans et protocoles dans `docs/archives/`.
- **Refactor des Tests** : Déplacement et uniformisation des tests unitaires (`solarAnalysis.test.ts`, `weatherPro.test.ts`) directement dans `src/modules/`.
- **Gestion GPX** : Nettoyage et structuration du dossier `/gpx/` avec création d'un sous-dossier `/samples/`.

## [5.29.35] - 2026-04-17
### Fixed
- **Build Hotfix** : Correction de la syntaxe du fichier `build.gradle` (suppression des antislashs accidentels sur le `versionName`) pour restaurer la compilation Android.

## [5.29.34] - 2026-04-17
### Added
- **AI Intelligence & Workflows** : Centralisation massive des connaissances IA (`AI_ARCHITECTURE`, `AI_PERFORMANCE`, `AI_UI_STYLE_GUIDE`).
- **Style Guide UI** : Documentation des patterns de design (grilles, instruments, graphiques) pour assurer une cohérence visuelle 100% IA-friendly.
- **Mapping EventBus** : Documentation exhaustive de tous les événements système.
- **Dictionnaire Performance** : Recensement et justification technique de tous les "Magic Numbers" du projet.

### Refactored
- **State Strict Typing** : Nettoyage des casts `any` pour une meilleure sécurité du State réactif.
- **Centralized Formatters** : Mutualisation des fonctions `fmtTime` et `fmtDuration` dans `utils.ts`.

### Fixed
- **I18n Synchronization** : Mise à jour complète des traductions anglaises pour les nouvelles fonctionnalités (Solaire/Météo).
- **Quality Control** : Correction d'imports de tests et d'avertissements TypeScript.

## [5.29.33] - 2026-04-17

### Added
- **Instrument Solaire (Pro)** : Nouveau tableau de bord avec boussole d'azimut temps réel, élévation max et phase lunaire détaillée.
- **Station Météo (Pro)** : Interface de type instrument avec cadran de vent dynamique (direction/vitesse) et indicateurs de confort.
- **Analyse Solaire** : Ajout de marqueurs visuels (Lever, Coucher, Midi) directement sur le graphique d'élévation 24h.
- **Fiabilité Météo** : Ajout d'un message d'état clair lorsque le service météo est indisponible ou en cours de chargement.

### Improved
- **Lisibilité Mobile** : Refonte complète des panneaux Solaire et Météo avec une grille standardisée (2x2) pour une meilleure lecture sur petits écrans.
- **Graphique Météo** : Intégration des précipitations (histogramme bleu) et de l'isotherme 0°C sur la courbe de température 24h.
- **Flux Horaire** : Insertion des icônes Lever (🌅) et Coucher (🌇) dans le défilement horaire de la météo.

### Fixed
- **Profil d'Élévation & Pente** : Correction d'un bug d'indexation critique lors de la densification des points GPX. L'altitude ne chute plus à 0m après 25% du parcours, garantissant des courbes d'altitude et des calculs de pente exacts sur l'intégralité de la trace.

## [5.29.31] - 2026-04-17
### Optimized
- **Budget de Montage (Smooth Tiles)** : Implémentation d'une file d'attente de montage (`buildQueue`) limitée à 6ms par frame. Élimine les micro-saccades lors du chargement massif de tuiles en lissant l'upload GPU.
- **Hystérésis de Zoom** : Introduction d'une zone morte de 5% sur les seuils de changement de LOD. Stabilise l'affichage et évite les oscillations nerveuses de résolution à certaines altitudes critiques.
- **Shader Terrain (GPU Fast-Path)** : Optimisation mathématique du calcul des pentes. Remplacement des fonctions trigonométriques coûteuses (`acos`, `degrees`) par des approximations vectorielles directes sur la normale.
- **Détection d'Eau Robuste** : Ajout d'une vérification de la saturation des couleurs dans le shader d'hydrologie. Empêche les faux positifs sur les roches grises ou ombrées.
- **Visuals** : Passage du fondu d'apparition (Fade In) des tuiles à une courbe `smoothstep` pour un rendu plus premium.

## [5.29.30] - 2026-04-17
### Reliability & Performance
- **Fiabilité D+/D- (Galaxy A53)** : Implémentation d'un lissage d'altitude sur 5 points et passage du seuil d'hystérésis à 5m. Réduction de 400% du faux dénivelé sur les appareils sans baromètre tout en préservant le signal réel.
- **Affichage Traces 3D** : Correction d'un bug d'altitude des traces GPX lors du switch 2D/3D. Les tracés sont désormais parfaitement plaqués sur le relief grâce à un rafraîchissement forcé post-chargement du terrain.
- **Optimisation Démarrage (PC)** : Lancement du moteur 3D en parallèle de l'hydratation de l'interface secondaire. Suppression définitive de l'écran blanc au démarrage.
- **Changement de Carte (Anti-Patchwork)** : Nettoyage systématique de la file de chargement et réinitialisation complète du terrain lors du switch de source (Satellite/Topo). Correction des mélanges de tuiles.
- **Profil d'Élévation** : Réactivation du graphique pour les imports successifs. Priorité aux données d'altitude brutes du GPX pour garantir un profil correct même en mode 2D.
- **Mode Manuel Protégé** : Le choix d'une source de carte manuelle (Satellite) désactive désormais l'automatisme de zone pour éviter les switchs intempestifs.

## [5.29.27] - 2026-04-16
### Fixed
- **Robustesse du Zoom** : Implémentation d'un verrou de mise à jour intelligente (`updatePending`) pour éviter les conflits d'exécution et les "trous" dans la carte.
- **Optimisation de la File d'Attente** : Filtrage strict des tuiles obsolètes dans `loadQueue`. Les tuiles d'un ancien LOD sont instantanément ignorées lors du dézoom.
- **Réactivité** : Correction d'un bug de boucle de rendu (`dx = -range`) et réduction des délais de verrouillage pour un zoom plus fluide.

## [5.29.26] - 2026-04-16
### Optimized
- **Mode 2D Ultra-Fluide** : Refonte totale du pipeline 2D pour les mobiles de milieu de gamme (Galaxy A53). Utilisation d'une résolution de maillage minimale (1 quad) et de shaders simplifiés.
- **Suppression Parallaxe** : Rendu forcé au niveau zéro en 2D pour éliminer les effets de flottaison des objets.
- **Gestion Objets 3D** : Désactivation et nettoyage instantané des arbres et bâtiments lors du passage en 2D.
- **Ajustement Caméra** : Compensation d'altitude automatique lors du switch 2D/3D et libération du Zoom 18 en 2D.
- **Preset STD (Balanced)** : Augmentation de la résolution 3D de 64 à 96 segments et amélioration de la netteté (Pixel Ratio 1.2).

## [5.29.25] - 2026-04-16
### Added
- **Régression Multi-Tracés** : Rétablissement du stress test validant l'affichage simultané de 10 randonnées (543 tests au total).
- **Stabilité TypeScript** : Correction des types dans les mocks de test.

## [5.29.24] - 2026-04-16
### Fixed
- **Stabilité Totale** : Suppression définitive du pooling mémoire et du dédoublonnage workers qui causaient des écrans blancs et des terrains plats.
- **Validation** : 100% des tests unitaires et vérification TypeScript confirmés.

## [5.29.23] - 2026-04-16
### Optimized
- **Memory Pooling (v2)** : Ré-implémentation sécurisée du recyclage des buffers d'altitude pour soulager le Garbage Collector sur les mobiles d'entrée de gamme.

## [5.29.22] - 2026-04-16
### Fixed
- **Intégrité Offline (v2)** : Ré-implémentation sécurisée de la validation des téléchargements de zones.
- **Stress Test** : Validation de la stabilité de l'application avec 10 tracés simultanés.
- **UI Management** : Confirmation de l'exclusivité des panneaux coulissants.

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
