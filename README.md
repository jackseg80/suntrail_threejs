# ⛰️ SunTail 3D (v3.9.3)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v3.9.3
- **Brouillard Adaptatif :** Système de voile atmosphérique intelligent lié à l'altitude. La visibilité reste constante et naturelle, quel que soit le niveau de zoom.
- **Optimisation de l'Horizon :** Extension de la portée visuelle à 250 km et bridage du dézoom à 100 km pour un équilibre parfait entre spectacle et performance.
- **Profil d'Altitude Interactif :** Visualisez le dénivelé de vos traces GPX synchronisé avec la vue 3D.
- **Moteur de Picking 3D :** Lecture d'altitude ultra-précise par Ray-marching CPU (Précision ~6m).
- **Full TypeScript :** Codebase entièrement typée pour une stabilité et une maintenance de niveau professionnel.
- **Heures Magiques :** Rendu immersif des phases dorées et bleues (Golden & Blue Hours) avec interpolation des couleurs.
- **GPS Natif (Capacitor) :** Géolocalisation haute précision avec gestion native des permissions Android.
- **Optimisation Mobile :** Gestion intelligente de la VRAM (cache dynamique) et nettoyage automatique des scènes.
- **LOD Adaptatif :** Résolution dynamique du maillage terrain en fonction de la distance caméra.

## 📱 Application Mobile (Android)

Suntrail 3D est optimisé pour les appareils mobiles grâce à **Capacitor**. 
- Icônes et Splash Screens adaptatifs.
- Gestion fluide de l'orientation (Portrait/Paysage).
- Importation et suivi de traces GPX.

Pour plus de détails sur le développement mobile, consultez le [Guide Android](./docs/ANDROID.md).

## 🛠️ Installation
1. Clonez le dépôt.
2. `npm install`
3. `npm run dev` (Web) ou `npm run deploy` (Android).
4. Entrez votre clé API MapTiler au lancement.

## 🧪 Tests & Qualité
Le projet intègre une suite de tests unitaires et d'intégration complète avec **Vitest** pour garantir la fiabilité des calculs cartographiques et astronomiques.

- **Couverture :** 28 tests validés (Terrain, Sun, UI, Utils).
- **CI/CD :** Validation automatique des tests avant chaque déploiement GitHub Pages.
- **Détails :** Consultez le [Guide des Tests](./docs/TESTS.md).

## ⚙️ Technologies
- **Moteur :** Three.js (WebGL) + TypeScript
- **Tests :** Vitest + JSDOM
- **Plateforme :** Capacitor (Hybride Natif)
- **Données :** MapTiler Cloud & Swisstopo
- **Calculs :** SunCalc (Astronomie)

## 📄 Documentation
- [Guide des Tests](./docs/TESTS.md)
- [Historique des versions (Changelog)](./docs/CHANGELOG.md)
- [Feuille de route (TODO)](./docs/TODO.md)
- [Guide Développeur (Claude)](./CLAUDE.md)
- [Guide Android](./docs/ANDROID.md)
