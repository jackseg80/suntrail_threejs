# ⛰️ SunTrail 3D (v4.9.1)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données MapTiler / OpenStreetMap / IGN France.

## ✨ Nouveautés v4.9.x (Expansion & Immersion)
- **Végétation Bio-Fidèle :** Diversification des forêts avec 3 essences (Feuillus, Sapins, Mélèzes) sélectionnées dynamiquement selon l'altitude réelle.
- **Support IGN France :** Basculement automatique sur les serveurs de la Géoplateforme (`data.geopf.fr`) pour une précision officielle lors du survol de l'Hexagone (Plan & Satellite).
- **Hydrologie par Shader (Pure Alpin) :** Moteur de rendu d'eau 100% GPU avec détection dynamique, ondulations fluides et reflets cristallins sans impact réseau.
- **Système SOS SMS :** Générateur de message de secours optimisé (Coordonnées, Altitude, Batterie) pour les zones à faible couverture (Sécurité Alpine).
- **Optimisation Overpass :** File d'attente et quarantaine intelligente pour les services OSM, garantissant une fluidité de 60 FPS constante.

## ✨ Nouveautés v4.8.x (Safety & Precision)
- **Inclinomètre Mathématique :** Calcul de la pente réelle au pixel près (100% GPU) avec coloration de sécurité (Jaune > 30°, Orange > 35°, Rouge > 40°).
- **Gestion GPX Pro :** Importation de traces avec profil altimétrique interactif (survol 3D) et calcul automatique des pentes le long du parcours.

## ✨ Nouveautés v4.7.x (Spherical Navigation & Offline)
- **Suivi GPS Sphérique :** Moteur de caméra ultra-lisse protégé contre le "Gimbal Lock" pour un suivi utilisateur cinématique.
- **Gestion Offline :** Système de mise en cache locale (Scraper) permettant de précharger des zones de 6km pour un usage sans réseau.

## ✨ Nouveautés v4.5.x (Battery & Intelligence)
- **Ultra-Battery Save :** Mode "Deep Sleep" mettant en pause le moteur 3D (0 FPS) en arrière-plan et toggle global 30 FPS pour maximiser l'autonomie.
- **Anti-Collision Sol Pro :** Système de sécurité garantissant que la caméra ne traverse jamais le relief maillé.

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les processeurs mobiles de dernière génération avec des profils de performance adaptatifs (Eco, Standard, High, Ultra) et une gestion rigoureuse de la VRAM.

## 📄 Documentation
- [Liste des Fonctionnalités](./docs/FEATURES.md)
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude/Gemini)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
