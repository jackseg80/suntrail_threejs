# ⛰️ SunTrail 3D (v4.6.6)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données MapTiler / OpenStreetMap.

## ✨ Nouveautés v4.6.x (Peaks & Cinematic Exploration)
- **Moteur de Recherche de Sommets :** Indexation locale intelligente (Overpass API) des sommets > 1000m avec auto-complétion hybride instantanée.
- **Vol Cinématique (`flyTo`) :** Trajectoire de vol parabolique sécurisée (anti-collision terrain) pour une immersion totale lors de la sélection d'un sommet.
- **Altitude Panoramique Automatique :** Stabilisation de la vue en LOD 14 (12km d'altitude) pour une observation optimale des massifs alpins.

## ✨ Nouveautés v4.5.x (Ultimate Tracking & Battery)
- **Suivi GPS & Boussole Pro :** Interpolation haute fréquence (60 FPS) et stabilisation par zone morte (1.5°) pour une navigation ultra-fluide sans tremblements.
- **Ultra-Battery Save :** Mode "Deep Sleep" mettant en pause le moteur 3D (0 FPS) en arrière-plan et toggle global 30 FPS pour maximiser l'autonomie en rando.
- **Voile Atmosphérique Dynamique :** Intégration du brouillard volumétrique aux presets de performance pour masquer le chargement des tuiles lointaines.
- **Interface Mobile Stack :** UI responsive avec ancrage dynamique du panneau d'altitude au-dessus de la timeline sur mobile.
- **Anti-Collision Sol Pro :** Système de sécurité garantissant que la caméra ne traverse jamais le relief.

## ✨ Nouveautés v4.3.x (Turbo Mobile & Space View)
- **2D Turbo Engine :** Rendu spatial (LOD <= 10) garantissant 120 FPS à haute altitude via maillages plats simplifiés.
- **Trajectoire Parabolique :** Zoom intelligent (Auto-Tilt) qui redresse la vue vers la 2D en montant pour cacher le vide de l'horizon.

## 📱 Application Mobile (Android)
SunTrail 3D est optimisé pour les processeurs de dernière génération (Snapdragon Elite, Apple M4) avec des profils de performance automatiques et une gestion rigoureuse de la VRAM.

## 📄 Documentation
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
