# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [4.4.1] - 2026-03-14
### 🛠️ Corrections & Stabilité (Hotfix)
- **Fix Raycasting :** Augmentation de la distance de détection du relief à 500 km pour permettre le clic à haute altitude (LOD 12+).
- **Navigation Pro :** Restauration complète du moteur stable v4.3.65 avec Auto-Tilt parabolique et Turbo 2D.
- **Sécurité 2D :** Désactivation intelligente du clic carte et du panneau de hauteur pour les zooms <= 10 (mode plan plat).
- **Correctif Ombres :** recalibrage du frustum d'ombre (50km) pour une projection fidèle des sommets sur les vallées.
- **UI Météo :** Intégration du Dashboard expert avec Isotherme 0°C, UV et prévisions horaires sur 6h.

## [4.5.37] - 2026-03-15
### ✨ Nouveautés & UX
- **Refonte Interaction Mobile (Style Google Earth)** : La rotation à deux doigts (Twist) est désormais d'une stabilité absolue. Le système "d'Auto-Tilt" est intelligemment suspendu pendant que l'utilisateur touche l'écran, empêchant la caméra de monter ou descendre inopinément. L'inclinaison s'ajuste ensuite de manière fluide dès que les doigts sont relâchés.
- **Migration MapTiler Buildings** : Basculement complet du moteur de bâtiments 3D d'Overpass API vers MapTiler Planet API. Résout les erreurs 504/429 d'OpenStreetMap et offre un affichage instantané et stable des villes mondiales dès le Zoom 15.

## [4.5.36] - 2026-03-14
### ✨ Nouveautés
- **Suivi GPS Directionnel** : Refonte totale du mode suivi. Le marqueur utilisateur affiche désormais un cône de vue (sector) indiquant la direction du regard.
- **Orientation Temps Réel** : Intégration de l'API `DeviceOrientation` pour une boussole réactive même à l'arrêt.
- **Vue Rando Immersive** : Centrage automatique à basse altitude (~1200m) pour forcer le LOD 16/17 et alignement automatique de la vue 3D avec le cap de l'utilisateur.

## [4.5.35] - 2026-03-14
### 🧹 Clean Architecture & Refactoring
- **Support Safe-Areas Mobiles** : Intégration des variables CSS `env(safe-area-inset-*)` pour empêcher le chevauchement de l'UI avec les barres système Android/iOS (encoche en haut, navigation en bas).
- **Optimisation Milieu de Gamme (Mali GPU)** : Refonte de la détection automatique pour forcer le mode **ECO** sur les puces Mali (Galaxy A53, Redmi, etc.), garantissant une fluidité de 30 FPS. Allègement du mode **BALANCED** (Résolution 96, Ombres 512px) pour un meilleur compromis sur les Snapdragon série 600/700.
- **Optimisation des Performances (Phase 4)** : Refonte des presets de performance pour un meilleur équilibre entre qualité visuelle et fluidité. Le profil **ULTRA** bénéficie désormais d'un horizon maximal (`RANGE: 8`) et d'un système de "burst" de chargement lorsque l'utilisateur n'interagit pas avec la carte (accélération du rendu initial).
- **Restructuration de l'État Global (Phase 3)** : Le fichier `state.ts` a été entièrement refactorisé. Séparation visuelle nette entre la configuration statique et les variables d'exécution (Moteur 3D, Météo, GPS). Amélioration du typage TypeScript pour plus de sécurité lors des futurs développements.
- **Gestion Mémoire VRAM (Phase 2)** : Création d'un utilitaire `disposeObject` pour forcer la destruction récursive des géométries/matériaux dans la VRAM. Application de ce nettoyeur à toutes les tuiles, parcours GPX et POIs lors de leur déchargement, éliminant les fuites de mémoire (Memory Leaks) responsables des crashs sur mobile.
- **Optimisation massive POI (Phase 2)** : Mutualisation des géométries et matériaux pour les panneaux OSM (gain de centaines d'objets en mémoire par tuile).
- **Centralisation Météo/Soleil (Phase 1.2)** : Suppression des calculs redondants de `SunCalc` dans la météo. Les éphémérides (heure dorée, phase lunaire) sont désormais gérées globalement par `sun.ts` via `state.ephemeris`, assurant une cohérence parfaite sur toute l'interface.
- **Découpage de `scene.ts` (Phase 1.1)** : Extraction de la logique de la boussole 3D (initialisation, rendu, animation) vers un module dédié `compass.ts`. Allègement significatif du fichier principal et ajout de tests unitaires dédiés.

## [4.5.34] - 2026-03-14
### ✨ Nouveautés
- **Zoom Européen** : Augmentation de la distance de dézoom (`maxDistance` à 1.8M) et ajout de paliers de LOD (zoom 7-9) pour une vue continentale.
- **Auto-Map OpenTopo** : Passage automatique en mode OpenTopoMap en dessous du zoom 9 pour une lisibilité optimale à grande échelle.
- **Météo Dynamique Mondiale** : La météo s'actualise désormais automatiquement lors de déplacements importants (> 5km).

### 🔧 Fixes & Optimisations
- **Migration Geocoding** : Passage de Nominatim (OSM) vers MapTiler API pour supprimer les erreurs 429 et les blocages CORS.
- **Robustesse Recherche** : Correction du recentrage du monde 3D lors de la sélection d'un résultat de recherche.
- **Fix Écran Noir** : Optimisation de la boucle de rendu pour garantir l'affichage des tuiles pendant le fade-in initial.
- **Fiabilité Météo** : Système de jetons (requestId) pour éviter les collisions d'appels et garantir que le nom du lieu affiché correspond toujours aux coordonnées actuelles.

## [4.5.29] - 2026-03-10

### 🚀 Ultimate Stability & Cinematic UX
- **Black Screen Fix:** Rewrote the Origin Shift logic using a strictly consistent coordinate system, eliminating the infinity-projection bug during rapid zooming.
- **120 FPS Performance:** Implemented a Spatial Cache for altitude lookups (`lastUsedTile`), making ground collision checks virtually free and restoring ultra-smooth navigation.
- **Cinematic Compass Reset:** Added a 800ms "Ease-in-Out" animated transition for the North-up reset, with a tiny southern offset to avoid the mathematical gimbal lock snap.
- **Overpass Flux Shield:** Centralized all OpenStreetMap requests into a global orchestrator. Added 429/400 error handling, mandatory headers, and a 1.2s inter-tile request cooldown.
- **Responsive Expert Dashboard:** Fixed the portrait layout on mobile; mountain safety and light ephemeris panels now stack vertically for perfect readability.
- **Mobile Date Input Fix:** Forced white color and dark-mode styling for the timeline calendar, fixing the "grayed out" visibility issue on Android and iOS.
- **Code Integrity:** Resolved 12 critical TypeScript errors and updated the full test suite to 100% green.

## [4.5.11] - 2026-03-14
### ☁️ Station Météo Expert & Ergonomie Mobile
- **Expert Dashboard (Central) :** Nouveau panneau majestueux avec graphique de tendance 24h, éphémérides photo et radars de sécurité.
- **Météogramme Interactif :** Visualisation dynamique de la température et du ciel sur 24h (Jaune=Soleil, Bleu=Précipitations).
- **Éphéméride Photo :** Calcul des Heures Dorées (Golden Hour) et Heures Bleues (Blue Hour) pour chaque lieu cliqué.
- **Cycle Lunaire :** Intégration de la phase réelle de la lune et de son pourcentage d'illumination.
- **Sécurité Montagne :** Nouveaux indicateurs de rafales max, visibilité réelle (km) et probabilité de précipitations.
- **Ergonomie Mobile (Portrait) :** Refonte responsive du dashboard (passage automatique en mode colonne) et fix de la visibilité du calendrier.
- **Optimisation PC :** Ajout du défilement horizontal à la molette pour les prévisions horaires.
- **Recherche :** Restauration de la barre de recherche topographique en haut de l'écran.

## [4.4.1] - 2026-03-14
### 🛠️ Stabilization & Pro Architecture
- **Global Click Delegation:** Implemented a "Bunker" UI architecture using document-level event delegation, ensuring buttons (Solar Insight, Weather) never become unresponsive during dynamic updates.
- **Space-Grade Raycasting:** Extended terrain detection distance to 500km, enabling mountain clicks immediately from the 35km launch altitude (LOD 12).
- **Pro Shadows:** Extended shadow camera frustum to 50km with 2048px resolution and fine-tuned bias, ensuring peak shadows correctly cover entire valleys.
- **LOD Continuity:** Fixed the "LOD skip" bug; the engine now transitions smoothly through LOD 11 during zooming.
- **Expert Dashboard:** Restored all expert metrics (0°C Isotherm, UV Index, Wind Cardinal Directions, 6h Hourly Forecast).
- **Atmospheric Fix:** Recalibrated fog logic to eliminate the high-altitude blue veil while maintaining ground-level atmosphere.

## [4.4.0] - 2026-03-14
### ☁️ Météo Dynamique & Immersion
- **Moteur de Particules GPU :** Système de pluie et neige 100% calculé sur GPU (Shaders) pour maintenir 120 FPS.
- **Physique du Vent Réel :** Les particules sont inclinées et leur vitesse est modulée par les données de vent réelles (API Open-Meteo).
- **Dashboard Météo Haute-Montagne :** Nouveau panneau interactif affichant température, ressenti, vent (avec flèche directionnelle), humidité et couverture nuageuse.
- **Géo-Localisation Automatique :** Identification automatique du nom de la ville ou région via Reverse Geocoding (Nominatim).
- **Rafraîchissement Intelligent :** Mise à jour automatique de la météo tous les 5 km de déplacement sur la carte.
- **Contrôles de Simulation :** Possibilité de forcer la pluie ou la neige pour tester les effets visuels indépendamment de la météo réelle.

### 🛠️ Corrections & Stabilité
- **Fix Logarithmic Depth :** Support complet du buffer logarithmique pour les particules (visibilité LOD 12-18).
- **Anti-Collision Caméra :** Fading progressif des particules proches de l'objectif pour éviter l'effet "tunnel".
- **Auto-Fermeture UI :** Les panneaux de réglages se ferment désormais au clic sur la carte pour une meilleure ergonomie mobile.
- **Sécurité Arctique :** Protection contre les sauts de coordonnées aberrants lors des zooms rapides.

## [4.3.65] - 2026-03-14
### 🚀 Optimisation Mobile Extreme
- **Mode 2D Turbo :** Utilisation d'un `MeshBasicMaterial` pour les tuiles de haute altitude (Zoom <= 10). Gain de FPS massif sur mobile (S23) en supprimant les calculs de lumière et d'ombres inutiles.
- **Réduction du Draw Call :** Désactivation des ombres portées et reçues pour les vues spatiales.
- **Fix Build :** Correction d'une erreur de portée (scope) sur les shaders lors du build de production.

## [4.3.64] - 2026-03-14
### 🎨 UI & Réglages Fins
- **Stats Performance :** Repositionnement du compteur FPS directement sous le bouton des réglages pour une meilleure ergonomie.
- **Preset Performance+ :** Augmentation du rayon de vue (`RANGE`) à 5 tuiles pour le preset "Performance" (High).
- **Stabilité LOD 12 :** Élargissement des seuils de transition pour garantir une vue régionale stable même avec une caméra inclinée.

## [4.3.63] - 2026-03-14
### 🚀 Navigation & Immersion Initiale
- **Vue Globale au Démarrage :** L'altitude initiale est désormais fixée à 35 km, déclenchant automatiquement une vue régionale en **LOD 12** pour une meilleure mise en contexte.
- **Saut Géographique HD :** La recherche de lieu et le centrage GPS réinitialisent maintenant l'altitude à 35 km (LOD 12), évitant d'arriver "au sol" dans le flou.
- **Optimisation 2D Spatiale :** Désactivation du chargement de l'élévation et réduction du maillage à 2 triangles pour les zooms <= 10 (gain massif de VRAM et bande passante).
- **Parabole de Zoom Pro :** La trajectoire de la caméra suit désormais une courbe parabolique qui redresse la vue vers la verticale à haute altitude (Auto-Tilt).
- **Boussole Restaurée :** Retour des points cardinaux (N, S, E, O) en haute définition sur l'interface 3D.
- **Stabilité LOD :** Le niveau de détail est désormais calculé sur la distance réelle à la cible, éliminant les clignotements lors des rotations.

## [4.3.44] - 2026-03-14
### ✨ Optimisation Finale & Stabilité
- **Version Cumulative :** Regroupement de toutes les optimisations de performance et corrections de stabilité mondiale (Origin Shift, Lat/Lon Fix).
- **README Refonte :** Mise à jour de la documentation pour refléter le nouvel état du moteur "Zero-Stutter".

## [4.3.43] - 2026-03-14
### 🛠️ Stabilité & Robustesse Mondiale
- **Inversion Lat/Lon Fix :** Correction d'une inversion critique des coordonnées dans le re-centrage du monde (Origin Shift), résolvant les écrans noirs.
- **LOD Calibration :** Recalibration complète des seuils de zoom pour une vue plus nette et détaillée plus tôt lors de la descente (Zoom 14 dès 20km).
- **Sûreté Géographique :** Désactivation automatique des calques spécifiques à la Suisse (Sentiers, Pentes) hors zone ou à haute altitude pour éliminer les erreurs 400.
- **Ultra Range :** Augmentation du rayon de vue (`RANGE`) à 8 tuiles pour le preset Ultra (RTX 4080).
- **Interface Lisible :** Amélioration du contraste du menu "Vitesse de Chargement" pour une meilleure visibilité.
- **Tests Unitaires :** Mise à jour et extension de la suite de tests (51 tests au vert) couvrant la sécurité géographique et les nouveaux paramètres.

## [4.3.26] - 2026-03-14
### 🚀 Fluidité Extrême & Zero Latence
- **Séquençage des Détails :** Implémentation d'une file d'attente prioritaire pour l'affichage des tuiles. Le terrain s'affiche d'abord, suivi des POI (+50ms), des bâtiments (+150ms) et de la forêt (+300ms), éliminant les pics de 140ms lors des zooms.
- **Gestion Statique des Ombres :** Désactivation de l'auto-update des ombres pendant le mouvement de la caméra. La Shadow Map n'est mise à jour que lors du changement de position du soleil (économie GPU massive).
- **Optimisation GPX :** Système de mise à jour adaptative de la géométrie du tracé. La reconstruction n'est déclenchée que si l'épaisseur change de plus de 20%, supprimant les gels CPU lors des transitions de LOD.
- **Bâtiments Batchés :** L'extrusion des bâtiments OSM est désormais fragmentée en micro-tâches asynchrones (lots de 20) pour ne jamais bloquer le fil principal.
- **Cache d'Altitude Spatial :** Ajout d'une localité spatiale (lastTile cache) pour la fonction `getAltitudeAt`, optimisant drastiquement la sécurité anti-collision de la caméra à 60fps.
- **Végétation Éco :** Réduction de la résolution de scan (48x48) et suppression des calculs de voisinage pour un gain de performance de 40% sur la génération des forêts.

## [4.3.25] - 2026-03-13
### 🔧 Stabilisation & Rendu Final
- **Ombres Géométriques :** Correction majeure permettant au relief de projeter des ombres réelles sur lui-même (customDepthMaterial). Les vallées sont maintenant plongées dans l'ombre des sommets de façon réaliste.
- **LOD Symétriques :** Réglage fin de l'hystérésis pour des transitions de zoom naturelles et sans effet de ressort.
- **Nettoyage Code :** Suppression de tous les logs de debug et optimisation des imports pour un build de production ultra-léger.
- **Z-Buffer Logarithmique :** Activation par défaut pour supprimer tout scintillement (flickering) sur le relief lointain.

## [4.3.0] - 2026-03-13
### 🏗️ Bâtiments 3D & Haute Définition
- **Bâtiments OSM :** Intégration de l'extrusion 3D des bâtiments avec gestion des fondations pour les pentes de montagne. Optimisation via fusion de géométries (1 seul draw call par tuile).
- **Boost de Résolution :** Passage aux textures 512px (@2x) et ajustement des seuils de LOD pour une netteté satellite immédiate.
- **Caméra Intelligente :** Système anti-collision sol (marge 30m) et limitation du Tilt (inclinaison) proportionnelle au zoom pour cacher l'horizon vide.
- **Refonte Géo :** Migration vers un module `geo.ts` centralisé pour supprimer les dépendances circulaires et stabiliser le rendu.
- **Sentiers HD :** Alignement des calques Swisstopo jusqu'au LOD 18.

## [4.2.6] - 2026-03-13
### 🕹️ Ergonomie Mobile Avancée
- **Rotation Multi-Touch libre :** Remplacement de MapControls par une instance OrbitControls configurée manuellement. La rotation à deux doigts (Twist) est désormais asymétrique et beaucoup plus fluide, ne nécessitant plus de point fixe.
- **Réactivité Doublée :** Augmentation du Damping Factor (0.1) pour un feeling de glisse plus nerveux et précis.
- **Robustesse TS :** Correction des erreurs de typage liées aux nouveaux contrôles pour garantir un build APK sans faille.

## [4.2.4] - 2026-03-13
### 📊 Solar Insight Dashboard
- **Analyse Interactive :** La timeline est désormais cliquable pour déplacer instantanément le soleil à l'heure choisie et visualiser l'ombre portée.
- **KPIs Avancés :** Affichage du lever de soleil réel (tenant compte du relief) et du cumul total d'ensoleillement.
- **Rapport Exportable :** Nouveau bouton de copie pour extraire les données d'analyse (coordonnées, cumul, lever).
- **Interface Premium :** Nouveau design du panneau d'analyse avec dégradés solaires et indicateurs de précision.

## [4.2.0] - 2026-03-13
### ☀️ Analyse Solaire Haute Précision
- **Interpolation Bi-linéaire :** Nouveau moteur de calcul d'altitude offrant une précision métrique et un lissage parfait entre les points de données.
- **Échantillonnage 5 min :** Passage à 288 tests d'occlusion par analyse (vs 96 auparavant) pour un cumul d'ensoleillement ultra-précis.
- **Ray-Marching Adaptatif :** Algorithme d'occlusion affiné (pas de 100m + accélération adaptative) pour détecter les crêtes les plus fines sur 50km.
- **Optimisation UI :** Calculs asynchrones par lots pour maintenir la fluidité de l'interface pendant l'analyse.

## [4.1.1] - 2026-03-13
### 🔧 Fiabilité & Robustesse
- **Clic POI Précis :** Optimisation du Raycasting (threshold et recherche directe) pour garantir la détection des clics sur les panneaux, même sur mobile.
- **Visibilité en Pente :** Augmentation de l'altitude des panneaux (+25m) pour éviter qu'ils ne soient masqués par le relief dans les zones escarpées.
- **Overpass Robust :** Réduction des timeouts et basculement intelligent entre serveurs pour mieux gérer la saturation de l'API OSM.
- **Signalétique Universelle :** Tous les panneaux sont désormais cliquables, avec un libellé par défaut ("Signalétique de randonnée") pour les objets sans tag "name".

## [4.1.0] - 2026-03-13
### 🚀 Immersion & Interaction
- **Interface Éphémère :** Les contrôles se masquent automatiquement après 5 secondes d'inactivité pour libérer la vue 3D. Réapparition instantanée au toucher ou mouvement.
- **Signalétique Interactive :** Les panneaux de randonnée 3D sont désormais cliquables. Une notification affiche le nom du lieu ou du carrefour.
- **Capture d'écran HD :** Nouveau bouton 📸 pour capturer la vue 3D actuelle (sans interface) et l'enregistrer localement.
- **Support Thème Système :** Synchronisation automatique avec le mode Sombre/Clair de l'OS (iOS/Android/Desktop).

## [4.0.3] - 2026-03-13
### 🚀 Optimisations Flagships
- **Galaxy S23 Ready :** Augmentation de la densité du maillage à 160 pour le profil "High", offrant un relief plus ciselé sur les écrans haute résolution.
- **Typage TypeScript :** Correction des erreurs d'assignation dans le module POI pour un déploiement sans faille.

## [4.0.2] - 2026-03-13
### 🚀 Turbo & WebP
- **Format WebP :** Migration vers le format WebP pour toutes les sources MapTiler, réduisant le poids des tuiles de 30 à 50% (chargement mobile ultra-rapide).
- **Chargement Parallèle :** Augmentation du parallélisme à 12 requêtes simultanées (au lieu de 6).
- **Robustesse Overpass :** Système de file d'attente globale et Mega-Zones (Z10) pour l'API OSM, garantissant 100% de succès sans erreur 429.

## [4.0.1] - 2026-03-13
### ✨ Fluidité d'Exploration
- **Seuils de Zoom Adaptatifs :** Le Zoom 13 est désormais maintenu jusqu'à 8km d'altitude (au lieu de 15km), rendant le survol des régions beaucoup plus léger et rapide.
- **Hystérésis Opti :** Ajustement des paliers pour éviter les clignotements lors de la descente vers le Zoom 14 et 15.

## [4.0.0] - 2026-03-13
### ✨ Randonnée HD
- **Signalétique 3D :** Affichage automatique des panneaux de signalisation de randonnée (données OSM) directement sur le relief.
- **Synchronisation Terrain :** Les panneaux sont ancrés dynamiquement sur le relief hybride du Zoom 15.

## [3.10.0] - 2026-03-13
### 🧱 Consolidation & "Bétonnage"
- **Cache Persistant Global :** Mise en cache automatique de toutes les données (Relief, Couleur, Sentiers, POI). Accélération majeure du démarrage et support du mode hors-ligne.
- **Moteur Hybride Stable :** Refonte de la classe Tile et des Shaders pour un Zoom 15 fluide et parfaitement aligné mondialement.
- **Suite de Tests Étendue :** Ajout de tests unitaires (Vitest) validant la précision de l'altitude au Zoom 15.
- **Protection Anti-Fantôme :** Sécurisation des chargements asynchrones éliminant les glitches visuels.
- **Splash Screen Opti :** Suppression du flash blanc au démarrage via un style CSS critique.
- **Bridage Robuste :** Clamping strict des coordonnées de tuiles pour éliminer les erreurs 404.

## [3.9.7] - 2026-03-13
### ✨ Ajouté
- **Ultra-LOD (Zoom 15) :** Détails topographiques extrêmes avec une résolution de ~1.5m par pixel (Suisse).
- **Seuils Adaptatifs :** Transition fluide vers le Zoom 15 dès que la caméra descend sous les 5km d'altitude.

### 🚀 Optimisations & Fixes
- **Relief Hybride Z15 :** Correction des erreurs 400 MapTiler en utilisant le relief du Zoom 14 ré-échantillonné dynamiquement pour les tuiles du Zoom 15.
- **Végétation Hybride :** Adaptation du moteur de plantation pour aligner parfaitement les arbres sur le relief hybride du Zoom 15.
- **VRAM L15 :** Bridage automatique du rayon de chargement à 2 tuiles lors de l'utilisation du Zoom 15 pour éviter la saturation mémoire.

## [3.9.6] - 2026-03-13
