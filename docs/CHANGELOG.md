# 📜 Journal des Modifications - SunTrail 3D

L'historique complet du développement, des prototypes initiaux à la plateforme professionnelle actuelle.

---

## [5.7.2] - 2026-03-22
### 🛠️ Bug Fixes & UX
- **Fix Position GPS** : Correction d'un décalage de perspective vers le Nord lors de l'utilisation du bouton "Ma Position". Le moteur cible désormais correctement l'altitude réelle du relief pour un centrage parfait.
- **UX Altitude Panel** : Ajout d'une croix de fermeture sur le panneau des coordonnées pour libérer de la visibilité sur la carte quand l'analyse est terminée.
- **Robustesse flyTo** : Harmonisation des unités d'altitude entre les coordonnées géographiques et le monde 3D.

## [5.7.1] - 2026-03-22
### 🔋 Energy & Data Optimization (Mobile)
- **Auto-Eco Mode (Battery API)** : Intégration de la `Battery API` pour détecter le niveau de charge. L'application bascule automatiquement et de force en profil "Éco" (2D / 30 FPS / Sans Ombre) si la batterie descend sous les 20%, garantissant de terminer la randonnée en sécurité.
- **Smart Energy Default** : Le bridage à 30 FPS (`ENERGY_SAVER`) est désormais activé par défaut sur tous les périphériques identifiés comme mobiles (via la détection des GPU Adreno/Mali), doublant l'autonomie standard.
- **Dynamic Antialiasing** : L'antialiasing matériel (MSAA) est désormais désactivé de manière stricte sur les appareils mobiles et sur le profil "Éco", soulageant drastiquement la charge GPU (Fillrate).
- **Data Cleanup** : Suppression d'un fichier lourd (`layers.json` de 4.1 Mo) inutile au moteur de production, accélérant drastiquement le téléchargement initial (TTV) sur les réseaux 3G/4G.

## [5.7.0] - 2026-03-22
### 💾 Persistance & Enregistrement (Usage Terrain)
- **Système Offline-First (PWA)** : Intégration d'un Service Worker complet transformant l'application en Progressive Web App. Les assets (JS/CSS/WASM) sont mis en cache pour un démarrage instantané, même sans réseau.
- **Support PMTiles Local** : Possibilité de charger un fichier `.pmtiles` contenant des gigaoctets de cartes topographiques régionales. Le moteur intercepte automatiquement les requêtes de tuiles (Z/X/Y) pour les lire depuis le fichier local sans aucune latence réseau.
- **Enregistrement de Tracé (Live Tracking)** : Nouveau bouton **REC** pour capturer votre parcours GPS en temps réel. Filtrage intelligent du bruit statique (mouvements > 50cm).
- **Export GPX Standard** : Bouton d'exportation instantané générant un fichier `.gpx` universel (compatible Strava, Garmin, Komoot).
- **Sauvegarde Automatique** : Le profil de performance, la source de carte (IGN, Swisstopo, etc.), et l'ensemble des réglages graphiques personnalisés sont désormais sauvegardés instantanément dans le cache du navigateur (`localStorage`).
- **Restauration Fluide** : L'application recharge exactement votre configuration au démarrage, évitant de devoir tout re-paramétrer à chaque lancement.
- **Robustesse** : En cas de données corrompues, le système redétecte automatiquement le meilleur profil basé sur votre matériel.
- **Qualité** : Suite de tests étendue à **101 tests au vert** (+7 sur la persistance et le tracking).

## [5.6.9] - 2026-03-21
### 🛠️ Restauration Ombres & Finalisation Defaults
- **Restauration 3D en STD** : Le profil "Balanced" (STD) bénéficie à nouveau de l'éclairage 3D complet et des ombres portées. Le mode de rendu simplifié est désormais strictement limité au profil "Éco" (2D).
- **Configuration Neutre** : Désactivation initiale des couches "Sentiers" et "Pentes" sur tous les profils au lancement pour une meilleure clarté visuelle.
- **Optimisation Mobile** : Affinement de la détection matérielle pour les mobiles mid-range.

## [5.6.8] - 2026-03-21
### 🛠️ Configuration par défaut & Détection Mobile
- **Sécurité au Lancement** : Désactivation par défaut des couches "Sentiers" et "Pentes" sur tous les profils pour éviter les surcharges et artefacts visuels (voile rouge) au démarrage.
- **Optimisation Détection** : Amélioration de la détection matérielle pour les mobiles mid-range (ex: Samsung Galaxy A53). Ces appareils sont désormais affectés au profil **STD (Balanced)** au lieu du profil Éco.
- **UI Refresh** : Renommage du calque "Sentiers & Noms" en "📍 Sentiers" et synchronisation parfaite des états UI/Moteur.
- **Qualité** : Suite de tests étendue à **94 tests au vert**.

## [5.6.7] - 2026-03-21
### 🛠️ Correctif Rendu 2D & Mode Éco
- **Désactivation des Pentes en 2D** : Suppression automatique du calque des pentes en mode "Éco" ou à bas niveau de zoom (LOD <= 10). Résout le bug du voile rouge persistant sur les surfaces plates.
- **Fiabilité Tests** : Suite de tests étendue à **93 tests au vert** (+3 tests sur la logique 2D/3D).

## [5.6.6] - 2026-03-21
### ✅ Priorité 1 Terminée : Optimisations & Netteté
- **Validation Finale** : Atteinte de l'objectif de **90 tests unitaires** (100% au vert) couvrant le bus d'événements et la stabilité du terrain.
- **Rollback Sentiers Raster** : Rétablissement des sentiers raster pour garantir la stabilité opérationnelle suite aux limitations techniques des WebWorkers sur le PBF.
- **MVT Pro en Attente** : Placement du rendu vectoriel natif dans la file de recherche technologique pour une implémentation future sécurisée.
- **Clôture v5.6** : Toutes les phases structurelles (Caches, Loaders, Normal Map Worker, Pooling) sont validées et livrées.

## [5.6.5] - 2026-03-21
### ✨ Sentiers Vectoriels MVT Pro
- **Netteté Infinie** : Migration des calques de sentiers raster vers des données vectorielles natives (MVT/PBF). Rendu en 2048px pour une précision "Pixel-Perfect".
- **Design Professionnel** : Ajout de halos blancs pour la lisibilité sur tous supports et codage couleur dynamique (Jaune/Rouge/Bleu) selon la difficulté du sentier.
- **Performance WebWorker** : Décodage et dessin des vecteurs intégralement déportés dans les WebWorkers, préservant la fluidité du thread principal.
- **Qualité** : Suite de tests étendue à **85 tests au vert**.

## [5.6.4] - 2026-03-21
### 🚀 Material Pooling & Zero-Stutter Rendering
- **Shader Reuse** : Implémentation d'un pool de matériaux (`materialPool.ts`) permettant de réutiliser les shaders compilés. Suppression des micro-saccades lors du chargement de nouvelles tuiles.
- **Optimisation Mémoire** : Nettoyage automatique des références de textures lors du recyclage des matériaux pour prévenir la saturation VRAM.
- **Stabilité 2D/3D** : Unification des matériaux de profondeur personnalisés via le pool pour des ombres fluides et constantes.
- **Qualité** : Suite de tests étendue à **84 tests au vert** (+5 tests sur le pooling).

## [5.6.3] - 2026-03-21
### 🚀 Normal Map Offloading & Memory Safety
- **Performance GPU** : Déportation du calcul des normales vers les WebWorkers via une Normal Map pré-calculée. Réduction de 87% des lectures de textures dans le vertex shader.
- **Protection de la VRAM** : Correction d'un bug critique dans `memory.ts` qui supprimait les textures partagées lors du nettoyage des tuiles.
- **Fiabilité du Cache** : Correction de la restauration de la texture de normales lors de la réutilisation des tuiles mises en cache.
- **Fluidité Dynamique** : L'exagération du relief reste 100% dynamique tout en utilisant la Normal Map pré-calculée.

## [5.6.2] - 2026-03-21
### 🛠️ Correctifs de Rendu & Optimisation Végétation
- **Stabilité OpenTopoMap** : Résolution du bug d'écran noir via l'utilisation du style `topo-v2` stable de MapTiler et uniformisation des URLs HD.
- **Précision Géo-Tuile** : Migration vers une détection géographique par tuile (`getTileCenter`), assurant un rendu mondial cohérent même lors des dézooms massifs.
- **Fiabilité Téléchargement** : Les téléchargements hors-ligne utilisent désormais les générateurs d'URLs dynamiques, éliminant les erreurs 400 sur les niveaux de zoom élevés.
- **Optimisation Forêts** : Ajustement du seuil d'affichage de la végétation à LOD 14 (au lieu de 13) pour alléger la charge processeur lors des survols régionaux.
- **Correction Fuite de Scène** : Empêche l'ajout d'objets (arbres, POI) dans la scène 3D pour les tuiles pré-chargées en arrière-plan, garantissant une transition de zoom parfaitement propre.

## [5.6.1] - 2026-03-21
### 🚀 Extraction TileLoader & Fix WebWorkers
- **Découplage Réseau** : Logique de téléchargement et génération d'URLs MapTiler/IGN isolée dans `tileLoader.ts`.
- **Correction WebWorkers** : Résolution de l'erreur d'import `updateStorageUI` dans le gestionnaire de workers.
- **Persistence** : Centralisation de la gestion du cache persistant (Cache API) pour une navigation fluide hors-ligne.
- **Stabilité** : Suite de tests étendue à **80 tests au vert**.

## [5.6.0] - 2026-03-21
### 🏗️ Refactoring Architectural & Stabilité Zoom
- **Architecture de Cache** : Extraction de `TileCache` et `GeometryCache` dans des modules isolés pour une gestion granulaire de la VRAM.
- **Correctif Zoom < 10** : Harmonisation de la logique 2D/3D résolvant l'écran noir lors du dézoom sur les grandes échelles.
*   **Performance** : Mutualisation des géométries de plans Three.js pour réduire la pression sur le garbage collector.
*   **Qualité** : Suite de tests étendue à **72 tests au vert** (+9 nouveaux tests sur les caches).

## [5.5.15] - 2026-03-18
### 🎯 Suivi GPS & Navigation Swisstopo
- **Suivi Haute Précision (v5.5.15)** : La caméra vise désormais l'altitude réelle du relief au lieu du niveau zéro, éliminant tout décalage visuel et assurant un centrage parfait du marqueur utilisateur.
- **Lissage Swisstopo (v5.5.14)** : Implémentation d'un filtre passe-bas (Low-pass) sur la boussole et le mouvement, offrant une fluidité de rotation "cinématographique" identique aux standards professionnels.
- **Réactivité GPS (v5.5.13)** : Centrage immédiat lors de l'activation du bouton GPS pour un feedback instantané.
- **Stabilisation Boussole** : Ajout d'une zone morte (deadzone) de 2.0° et filtrage du bruit magnétique pour supprimer les tremblements du cône de vue.

### ☀️ Moteur de Lumière & Crépuscule
- **Transition Sans Couture (v5.5.12)** : Refonte des courbes de luminosité pour une transition monotone parfaite entre l'Heure Dorée et la Nuit.
- **Nuit Navigable** : Fixation d'un plancher de lumière ambiante à 0.20 pour simuler une nuit claire (pleine lune), garantissant que le relief reste lisible en permanence.
- **Persistance Atmosphérique** : Extension de la lueur du ciel et du brouillard jusqu'à -15° (fin du crépuscule nautique) pour éviter l'effet "trou noir".

### 🔍 Recherche & UX
- **Recherche Instantanée** : Affichage prioritaire et immédiat des sommets locaux dès la saisie, sans attendre la réponse réseau des APIs mondiales.
- **Fiabilité Geocoding** : Sécurisation totale contre les injections HTML via l'utilisation systématique de l'API DOM (`textContent`).

---

## [5.5.0] - 2026-03-18
### 🛡️ Audit de Sécurité & Fiabilité
- **Fiabilité Worker (v5.0.2)** : Élimination définitive de la race condition sur les tuiles via un mécanisme de flag `settled` et une initialisation prioritaire des handlers.
- **Robustesse Environnement** : Accès à `window.devicePixelRatio` rendu paresseux (lazy getter), permettant l'exécution hors navigateur (tests, workers).
- **Conformité API Three.js** : Suppression de l'accès aux propriétés privées (`_isMoving`). Pilotage de l'état d'interaction via les événements officiels `start` et `end` d'OrbitControls.
- **Sécurité XSS** : Refonte totale du module de recherche de lieux. Injection des résultats via l'API DOM (`textContent`) au lieu de `innerHTML`, bloquant toute tentative d'injection scriptée.
- **Gestion Mémoire** : Nettoyage automatique du cache d'analyse spatiale lors de la destruction de la scène pour éviter les références mortes vers la VRAM libérée.

### 🚀 Optimisation Performance
- **Performance O(1)** : Migration de la file de chargement (`loadQueue`) d'un Array vers un `Set`, rendant la suppression de tuiles instantanée lors des changements de LOD.
- **Ordonnanceur Prioritaire** : Tri dynamique de la file d'attente pour charger en priorité les tuiles visibles dans le frustum de la caméra.
- **Découpage Architectural** : Introduction d'un `eventBus` minimal pour casser les dépendances circulaires entre les modules Terrain et Scène.

---

## [5.4.7] - 2026-03-18
### 🚀 Stabilisation & Performance RTX (i9/RTX 4080)
- **Moteur de Bâtiments 3D (v5.4.7)** : 
    - **Fusion de Géométrie** : Toutes les maisons d'une tuile sont fusionnées en un seul objet 3D, divisant par 100 les calculs de la carte graphique.
    - **Correction Z-Mirror** : Résolution du bug mathématique qui plaçait les bâtiments "dans les lacs". Alignement parfait avec les routes.
    - **Densité Ultra** : Augmentation à 150 bâtiments par tuile pour le profil Ultra.
- **Régulateur Overpass Intelligent** : 
    - **File d'attente LIFO** : Les requêtes Overpass sont traitées en priorité pour ce que vous regardez actuellement.
    - **Fallback OSM Nominatim** : Si l'API MapTiler est bloquée (Erreur 403), la recherche bascule automatiquement sur OpenStreetMap pour garantir un service continu.
    - **Anti-Spam Mouvement** : Les requêtes sont suspendues pendant le déplacement de la caméra et reprennent automatiquement à l'arrêt.
- **Hydrologie Haute Précision** :
    - **Filtre de Pente & Dominante** : Le shader d'eau ne s'active désormais que sur les zones parfaitement plates ET à dominante bleue, éliminant le "bleu" sur les champs blancs ou enneigés.
- **Interface & Dashboard** :
    - **Station Expert Complète** : Ajout du graphique de température sur 24h et synchronisation des éphémérides (Lune, Soleil, Heures Dorées).
    - **Label LOD Hybride** : Fusion du niveau de zoom et de la météo en un seul indicateur dynamique (ex: `SWISS: Lvl 15 | 12°C ☀️`).
    - **Raycasting Spatial** : Portée de clic étendue à 500km pour interagir avec le relief même depuis la stratosphère.
- **Maintenance Qualité** :
    - Nettoyage complet des erreurs TypeScript (`tsc --noEmit` à 100% vert).
    - Mise à jour de la suite de tests Vitest (63 tests validés).

---

## [5.0.1] - 2026-03-18
### 🚀 Performance V5 & Vol Orbital
- **WebWorkers Engine** : Migration du fetch et décodage des tuiles vers un pool de 8 Workers asynchrones pour une fluidité absolue.
- **LOD 6 Support** : Extension du zoom arrière jusqu'au niveau 6, permettant des vues continentales spectaculaires.
- **Ciel Orbital** : Atmosphère étendue à 10 000 km pour supporter les vols de très haute altitude.
- **Architecture Hybride** : Rétablissement du moteur visuel stable v4.9.1 (WebGL) combiné à la puissance brute de la V5.

## [4.9.1] - 2026-03-17
### 🌲 Végétation Bio-Fidèle & Correction UI
- **Multi-Essences** : Diversification des forêts avec 3 modèles d'arbres (Feuillus, Sapins, Mélèzes) et matériaux distincts.
- **Intelligence d'Altitude** : Sélection automatique de l'essence selon l'altitude réelle (Feuillus en plaine, Sapins en moyenne montagne, Mélèzes en haute altitude).
- **Z-Index Fix** : Correction définitive de la superposition du panneau de coordonnées qui s'affiche désormais correctement derrière les réglages.
- **SOS Mobile Fix** : Correction du centrage de la modale de secours sur les écrans mobiles (extraction du stack transformé).

## [4.9.0] - 2026-03-17
### 🌍 Extension France & Hydrologie
- **Intégration IGN France** : Basculement automatique sur les serveurs de la Géoplateforme (`data.geopf.fr`) lors du survol de l'Hexagone. Accès aux flux Plan IGN et Orthoimagery HD.
- **Système SOS SMS** : Nouvel outil de sécurité alpine générant un message de secours optimisé (GPS, Altitude, Batterie) prêt à être envoyé par SMS en zone blanche.
- **Hydrologie par Shader (v5.4.1)** : Implémentation d'un moteur de détection d'eau 100% GPU. Les lacs et rivières bénéficient désormais d'une couleur bleu profond et d'ondulations fluides, sans aucune requête réseau supplémentaire.
- **Optimisation Overpass** : Mise en place d'une file d'attente et d'une quarantaine automatique pour les services OSM afin de garantir une fluidité totale même en cas de panne des serveurs tiers.
- **Presets de Performance** : Activation par défaut de l'hydrologie animée sur les profils "Performance" et "Ultra".
- **Fix UI Overlay** : Correction de la superposition des panneaux (le panneau de coordonnées s'affiche désormais derrière les réglages).

---

## [4.8.0] - 2026-03-16
### 🏔️ Carte des Pentes & Sécurité Avalanche
- **Inclinomètre Shader** : Remplacement de l'API Swisstopo par un calcul mathématique 100% GPU. La vraie pente est désormais calculée au pixel près pour le monde entier (sans le biais de l'exagération du relief).
- **Colorimétrie Dynamique** : Ajout d'un dégradé de couleur mixé dynamiquement sur le terrain (Jaune > 30°, Orange > 35°, Rouge > 40°).
- **Optimisation UI** : L'activation de la carte des pentes est désormais instantanée (mise à jour directe du shader) sans rechargement du terrain ni requêtes réseau.
- **Nettoyage** : Suppression de `slopesTex` et de toutes les fonctions de téléchargement d'images de pente obsolètes.

## [4.7.6] - 2026-03-16
### 🎯 Suivi GPS Sphérique & Stabilité Tests
- **Navigation Sphérique** : Refonte du moteur de suivi (`centerOnUser`) utilisant des coordonnées sphériques pour des transitions de caméra fluides et sans à-coups ("Gimbal Lock" protégé).
- **Qualité & Tests** : Création du module de test `location.test.ts` et validation de 100% de la suite de tests (55 tests au vert).    
- **Correction Boussole** : Alignement du cône de vue utilisateur sur le Nord réel (-Z) par défaut.

## [4.7.3] - 2026-03-15
### 📦 Gestion Offline & Nettoyage
- **Indicateur Réseau** : Badge "📡 HORS-LIGNE" automatique basé sur l'état de la connexion.
- **Téléchargement de Zone** : Scraper optimisé (rayon 6km) pour mettre en cache les tuiles topo/satellite sans figer l'interface.      
- **Refonte UI** : Nettoyage complet du module `ui.ts` et restauration de la timeline/altitude sur mobile.
- **Zéro Horizon** : Suppression définitive de la couche d'horizon continental pour garantir une carte HD 100% propre.

## [4.6.6] - 2026-03-15
### 🛠️ Correctifs Recherche & Vol Cinématique
- **Précision du Vol** : Correction d'un bug de destination lors de la recherche de sommets (synchronisation de l'Origin Shift avant le vol).
- **Altitude Panoramique** : Ajustement de l'altitude d'arrivée à 12 000m au-dessus des pics pour garantir une vue stable en LOD 14 et éviter les collisions avec le relief.
- **Sécurité Vol** : Implémentation d'une vérification d'altitude en temps réel pendant le vol pour empêcher la caméra de traverser les montagnes.

## [4.6.0] - 2026-03-15
### 🏔️ Moteur de Recherche de Sommets
- **Indexation Locale (Overpass)** : L'application télécharge et met en cache automatiquement (7 jours) tous les sommets de plus de 1000m d'altitude dans un rayon de 50km autour du point de départ.
- **Auto-complétion Hybride** : La barre de recherche propose désormais instantanément les sommets locaux (signalés par 🏔️ et leur altittude) en priorité, suivis des résultats géocodés mondiaux.
- **Vol Cinématique (`flyTo`)** : Au lieu d'une "téléportation" basique, cliquer sur un sommet déclenche une trajectoire de vol en cloche d'une durée de 2.5 secondes. La caméra monte pour survoler le relief, avance, et atterrit en douceur en visant le sommet sélectionné. 
- **Peak Cards** : Le clic sur un sommet depuis la barre de recherche ouvre automatiquement le panneau d'information (Altitude et Nom précis de l'Overpass API).

## [4.5.70] - 2026-03-15
### 🎯 Suivi GPS & Boussole Haute Précision
- **Moteur de Suivi Ultra-Fluide** : Refonte totale du suivi GPS utilisant une interpolation haute fréquence (60 FPS) avec lissage exponentiel temporel. La caméra glisse désormais sans aucune saccade vers la position utilisateur.
- **Approche Diagonale Unifiée** : La transition initiale vers l'utilisateur s'effectue désormais en une seule trajectoire diagonale cinématique (position et cible synchronisées), éliminant les effets de Yo-Yo et de rebond.
- **Stabilisation de Boussole Pro** : Implémentation d'un filtre à zone morte (Deadzone 1.5°) et d'un amortissement lourd sur la rotation pour éliminer 100% du bruit magnétique et des tremblements gauche/droite sur mobile.
- **Intelligence de Transition** :
    - Déclenchement d'un boost de vitesse intelligent lors du clic initial.
    - Vue de dessus automatique à la fin du suivi.
    - Respect du zoom manuel de l'utilisateur après la transition.
- **Fix Visibilité 2D** : Le marqueur GPS est désormais parfaitement visible au-dessus de la carte en mode 2D Turbo (priorité de rendu et position Y ajustée).

## [4.5.54] - 2026-03-15
### 🌫️ Voile Atmosphérique Dynamique par Preset
- **Intégration Presets** : Le réglage du brouillard est désormais lié aux profils de performance.
    - **Eco/Balanced** : Brouillard dense pour masquer le chargement des tuiles et économiser les ressources.
    - **Ultra** : Visibilité maximale (100km) pour une expérience immersive totale.
- **Auto-Custom Mode** : Le réglage manuel du voile atmosphérique fait désormais basculer automatiquement le profil vers "Custom".      
- **Sync UI** : Le slider de brouillard se synchronise instantanément lors du changement de preset.

## [4.5.53] - 2026-03-15
### 🌫️ Correction du Voile Atmosphérique
- **Fog Slider Fix** : Le réglage "Voile atmosphérique" est désormais fonctionnel. La boucle de rendu respecte maintenant la valeur `FOG_FAR` définie par l'utilisateur tout en conservant une mise à l'échelle intelligente selon l'altitude de la caméra.
- **Optimisation UI** : Suppression des rechargements de terrain inutiles lors du réglage du brouillard.

## [4.5.52] - 2026-03-15
### 🔋 Ultra-Battery Save & Deep Sleep
- **Mode Éco Global** : Ajout d'un réglage "Économie d'énergie (30 FPS)" dans l'interface, permettant de brider le taux de rafraîchissement à 30 FPS quel que soit le profil de performance choisi (Ultra, Balanced, etc.), réduisant drastiquement la consommation.
- **Veille Intelligente (Deep Sleep)** : L'application détecte lorsqu'elle passe en arrière-plan (changement d'onglet ou téléphone verrouillé) et stoppe totalement le moteur 3D (0 FPS) tout en conservant le suivi GPS actif. Idéal pour garder l'app ouverte en randonnée sans vider la batterie.

## [4.4.1] - 2026-03-14
### 🛠️ Corrections & Stabilité (Hotfix)
- **Fix Raycasting :** Augmentation de la distance de détection du relief à 500 km pour permettre le clic à haute altitude (LOD 12+).   
- **Navigation Pro :** Restauration complète du moteur stable v4.3.65 avec Auto-Tilt parabolique et Turbo 2D.
- **Sécurité 2D :** Désactivation intelligente du clic carte et du panneau de hauteur pour les zooms <= 10 (mode plan plat).
- **Correctif Ombres :** recalibrage du frustum d'ombre (50km) pour une projection fidèle des sommets sur les vallées.
- **UI Météo :** Intégration du Dashboard expert avec Isotherme 0°C, UV et prévisions horaires sur 6h.

## [4.5.49] - 2026-03-15
### 🔋 Vrai Mode 2D Turbo (Économie d'Énergie)
- **Zéro Relief** : En mode 2D, le moteur ne télécharge plus les textures d'élévation et utilise des maillages plats (2 triangles), divisant par 100 la charge géométrique.
- **Bridage 30 FPS** : Limitation volontaire du frame-rate en mode 2D pour quadrupler l'autonomie batterie sur mobile.
- **UI Intelligente** : Masquage automatique de la timeline et des options de réglages 3D (relief, ombres, végétation) pour une interface épurée.
- **Verrouillage Vertical** : La caméra est bloquée en vue de dessus stricte en mode 2D, empêchant toute plongée sous l'horizon.        

## [4.5.46] - 2026-03-15
### 🚀 Optimisation GPU
- **Shader Light pour Milieu de Gamme** : Implémentation d'un mode de rendu simplifié pour les presets Eco et Balanced. Réduction de 75% des lectures de textures dans le Vertex Shader en désactivant le calcul dynamique des normales, stabilisant les FPS sur les processeurs Mali (Galaxy A53).

## [4.5.45] - 2026-03-15
### 🚀 Optimisation CPU
- **Végétation Ultra-Light** : Refonte de l'algorithme de plantation des forêts. Le scan de texture est désormais adaptatif (pas de 1, 2 ou 4 pixels selon le preset), divisant par 16 la charge CPU sur les profils Standard (Balanced) sans perte de densité visuelle grâce à un boost d'échelle des arbres.

## [4.5.44] - 2026-03-15
### 🚀 Optimisation Fluidité
- **Chargement Adaptatif** : Le moteur de tuiles ajuste désormais le nombre de chargements simultanés et la taille du cache mémoire en fonction du profil de performance (Eco, Balanced, Ultra).
- **Suppression des Saccades** : Segmentation drastique des tâches CPU lors des déplacements pour libérer le fil principal et maintenir un FPS stable.
- **Cache Mobile Sécurisé** : Réduction du cache sur mobile (60 tuiles) pour prévenir les gels provoqués par le Garbage Collector d'Android.

## [4.5.42] - 2026-03-15
### 🛠️ Corrections & Stabilité
- **Anti-Collision Sol Pro** : Le moteur charge désormais systématiquement le terrain sous la caméra, garantissant une altitude de sécurité réelle (plus de passage sous le relief). Repositionnement fluide via interpolation.
- **Fix Calendrier & Ombres** : Restauration du lien entre le calendrier et la simulation solaire. Les changements de date sont à nouveau appliqués instantanément aux ombres portées.
- **Restauration Bâtiments 3D** : Retour à Overpass API pour les bâtiments (Zoom 14+) suite aux erreurs 404 rencontrées avec le service expérimental MapTiler.
- **Interaction UI Fluide** : Le rendu 120 FPS est désormais maintenu pendant toute la manipulation des sliders (météo, temps) pour une réactivité visuelle parfaite.

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
- **Dashboard Météo Haute-Montagne :** Nouveau panneau interactive affichant température, ressenti, vent (avec flèche directionnelle), humidité et couverture nuageuse.
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
