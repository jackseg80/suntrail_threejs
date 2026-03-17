# 📋 Fonctionnalités de SunTrail 3D (v4.9.1)

Ce document dresse la liste exhaustive des capacités techniques et fonctionnelles du moteur SunTrail.

---

### 🌍 Moteur 3D & Terrain
*   **Rendu de Relief Dynamique (LOD)** : Affichage du terrain 3D haute performance via MapTiler et OpenStreetMap avec un système de niveau de détail progressif (Level of Detail).
*   **Support IGN France** : Basculement automatique vers les services officiels de la Géoplateforme (`data.geopf.fr`) pour une précision maximale en France (Plan & Orthophoto).
*   **Hybride 2D/3D Adaptatif (Turbo Engine)** : Bascule automatique entre un rendu 2D optimisé à haute altitude (LOD <= 10) et une 3D détaillée au sol pour garantir 120 FPS.
*   **Carte des Pentes (Inclinomètre)** : Shader personnalisé calculant et affichant les pentes en temps réel (Jaune 30° / Orange 35° / Rouge 40°+) pour l'aide à la décision en zone avalancheuse.
*   **Hydrologie par Shader (Pure Alpin)** : Moteur 100% GPU détectant les surfaces d'eau pour appliquer des ondulations douces et des reflets de ciel dynamiques sans impact réseau.
*   **Exagération du Relief** : Multiplicateur dynamique permettant d'accentuer la perception visuelle des versants.
*   **Anti-Collision Sol Pro** : Algorithme de sécurité garantissant que la caméra ne traverse jamais le maillage du relief.
*   **Brouillard Atmosphérique Dynamique** : Système de voile volumétrique intégré aux presets de performance pour masquer le chargement des tuiles lointaines.

### ☀️ Analyse Solaire & Astronomique
*   **Éphémérides Précises** : Calcul en temps réel des positions du Soleil et de la Lune (via SunCalc) basées sur la date, l'heure et les coordonnées GPS.
*   **Phases Lumineuses & Couleurs** : Identification automatique de l'"Heure Dorée", l'"Heure Bleue", des crépuscules et de la phase lunaire actuelle.
*   **Sonde Solaire (Analyse d'Horizon)** : Outil avancé calculant la durée d'ensoleillement cumulée sur 24h à un point précis, en tenant compte du "masque d'horizon" généré par le relief environnant.
*   **Timeline Interactive** : Contrôle manuel fluide de l'heure du jour pour simuler les ombres portées et l'éclairage de la scène.

### 🧭 Navigation & Exploration Alpiniste
*   **Suivi GPS Ultra-Lisse** : Interpolation haute fréquence (60 FPS) des données de position pour un déplacement fluide sans saccades sur la carte.
*   **Boussole Professionnelle** : Stabilisation de l'orientation avec gestion de zone morte (1.5°) pour une navigation précise sans tremblements.
*   **Vol Cinématique (`flyTo`)** : Trajectoires de caméra paraboliques avec interpolation `easeInOutCubic`, altitude automatique et protection anti-collision.
*   **Moteur de Sommets (Peaks Engine)** : Indexation locale des sommets > 1000m (via Overpass API) avec cache intelligent de 7 jours et système d'auto-complétion hybride.
*   **Profil Altimétrique Dynamique** : Calcul et affichage en temps réel du profil d'altitude pour les tracés et points d'intérêt sélectionnés.

### 🌲 Environnement & Urbanisme
*   **Végétation Procédurale** : Système de génération de forêts et d'arbres avec densité "bio-fidèle" adaptée à la zone géographique réelle.
*   **Bâtiments 3D (OSM)** : Chargement et extrusion progressive des bâtiments issus d'OpenStreetMap avec support des ombres portées (selon preset).
*   **Points d'Intérêt (POI)** : Affichage hiérarchisé des panneaux indicateurs, refuges, cols et repères topographiques selon le niveau de zoom.
*   **Météo Dynamique** : Moteur de particules simulant les nuages, la pluie ou la neige, avec ajustement de la densité et de la vitesse selon les conditions simulées.

### ⚡ Performance & Optimisation Mobile
*   **Presets de Performance** : 4 modes prédéfinis (Eco, Balanced, Performance, Ultra) ajustant la résolution, la portée de vue, les ombres et la densité d'objets.
*   **Mode Ultra-Battery (Deep Sleep)** : Mise en pause complète du moteur 3D (0 FPS) via Visibility API lorsque l'application est en arrière-plan.
*   **Limiteur de FPS Global** : Option de bridage à 30 FPS pour maximiser l'autonomie sur les appareils mobiles en randonnée.
*   **Gestion Rigoureuse de la VRAM** : Système `disposeObject()` pour prévenir les fuites de mémoire vidéo lors de l'exploration de zones vastes.

### 🛠️ Outils Spécialisés & Sécurité
*   **Gestion Offline (Scraper)** : Possibilité de précharger une zone locale (rayon de 6km) pour une utilisation sans connexion internet.
*   **Générateur SOS SMS** : Outil de secours générant un message texte optimisé contenant les coordonnées GPS, l'altitude et l'état de la batterie.
*   **Support GPX Pro** : Importation de traces avec calcul automatique de la pente moyenne et maximale le long de l'itinéraire.
