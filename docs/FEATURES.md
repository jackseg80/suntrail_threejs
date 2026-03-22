# 📋 Fonctionnalités de SunTrail 3D (v5.7.1)

Ce document dresse la liste exhaustive des capacités techniques et fonctionnelles du moteur SunTrail.

---

### 🌍 Moteur 3D & Terrain
*   **Moteur Asynchrone (WebWorkers)** : Déportation du téléchargement et du décodage des tuiles vers un pool de 8 WebWorkers pour une fluidité totale sans blocage du thread principal.
*   **Architecture Découplée (Event Bus)** : Utilisation d'un bus d'événements centralisé pour la communication entre les modules Terrain et Scène.
*   **Rendu de Relief Dynamique (LOD)** : Affichage du terrain 3D haute performance via MapTiler et OpenStreetMap avec un système de niveau de détail progressif (LOD 6 à 18).
*   **Support IGN France** : Basculement automatique vers les services officiels de la Géoplateforme pour une précision maximale en France.
*   **Hybride 2D/3D Adaptatif (Turbo Engine)** : Bascule automatique entre un rendu 2D optimisé à haute altitude (LOD <= 10) et une 3D détaillée au sol.
*   **Carte des Pentes (Inclinomètre)** : Shader personnalisé calculant et affichant les pentes en temps réel (Jaune 30° / Orange 35° / Rouge 40°+).
*   **Hydrologie par Shader (Pure Alpin)** : Moteur 100% GPU détectant les surfaces d'eau avec ondulations et reflets dynamiques.

### ☀️ Analyse Solaire & Astronomique
*   **Éphémérides Précises** : Calcul en temps réel des positions du Soleil et de la Lune basées sur la date, l'heure et les coordonnées GPS.
*   **Transitions Solaire Ultra-Lisses** : Refonte des courbes de luminosité pour une transition monotone parfaite entre l'Heure Dorée et la Nuit.
*   **Phases Lumineuses & Couleurs** : Identification de l'"Heure Dorée", l'"Heure Bleue", des crépuscules et de la phase lunaire.

### 🧭 Navigation & Exploration Alpiniste
*   **Suivi GPS Haute Précision** : Centrage "pixel-perfect" sur l'altitude réelle du relief et interpolation haute fréquence (60 FPS).
*   **Boussole Professionnelle Swisstopo** : Filtre passe-bas et amortissement lourd pour une rotation "cinématographique" sans tremblements.
*   **Vol Cinématique (`flyTo`)** : Trajectoires de caméra paraboliques avec protection anti-collision dynamique.
*   **Moteur de Sommets (Peaks Engine)** : Indexation locale des sommets > 1000m avec cache intelligent et auto-complétion hybride.
*   **Enregistrement de Tracé (Live Tracking)** : Capture de points GPS en temps réel (> 50cm de mouvement) avec export au format GPX.

### 🌲 Environnement & Urbanisme
*   **Végétation Bio-Fidèle** : Diversification des forêts avec 3 essences (Feuillus, Sapins, Mélèzes) selon l'altitude réelle.
*   **Bâtiments 3D RTX (OSM)** : Fusion de géométries pour des performances maximales et correction du bug de miroir Z.
*   **Points d'Intérêt (POI)** : Affichage hiérarchisé des panneaux, refuges et cols.
*   **Météo Dynamique** : Moteur de particules GPU pour les nuages, la pluie et la neige avec physique du vent réel.


### ⚡ Performance & Optimisation Mobile
*   **Presets de Performance** : 4 modes prédéfinis (Eco, Balanced, Performance, Ultra) ajustant la résolution, la portée de vue, les ombres et la densité d'objets.
*   **Auto-Eco Mode (Battery API)** : Surveillance du niveau de charge et bascule automatique en profil Éco sous les 20% de batterie.
*   **Persistance des Réglages** : Sauvegarde et restauration automatique des préférences via `localStorage`.
*   **Mode Ultra-Battery (Deep Sleep)** : Mise en pause complète du moteur 3D (0 FPS) via Visibility API lorsque l'application est en arrière-plan.
*   **Limiteur de FPS Global** : Option de bridage à 30 FPS pour maximiser l'autonomie sur les appareils mobiles en randonnée.
*   **Gestion Rigoureuse de la VRAM** : Système `disposeObject()` pour prévenir les fuites de mémoire vidéo lors de l'exploration de zones vastes.

### 🛠️ Outils Spécialisés & Sécurité
*   **Architecture Offline-First (PWA)** : Mise en cache complète des assets et des tuiles cartographiques pour un fonctionnement sans réseau.
*   **Lecteur PMTiles Natif** : Support des archives de cartes locales pour charger des régions entières hors-ligne.
*   **Générateur SOS SMS** : Outil de secours générant un message texte optimisé contenant les coordonnées GPS, l'altitude et l'état de la batterie.
*   **Support GPX Pro** : Importation et exportation de traces avec calcul de pente.
