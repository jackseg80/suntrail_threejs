# ⛰️ SunTail 3D (v4.0.0)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.0.0 (Randonnée HD)
- **Signalétique 3D :** Affichage des panneaux de signalisation de randonnée (données OSM) directement sur le relief.
- **Cache Persistant Global :** Stockage local de toutes les données (Relief, Couleur, Sentiers) pour un usage fluide et offline.
- **Optimisation Industrielle :** File d'attente de requêtes intelligentes et miroirs Overpass pour une stabilité totale.

## ✨ Nouveautés v3.10.0 (Consolidation)
- **Indicateur de Position Live :** Suivez vos déplacements en temps réel avec un marqueur 3D haute visibilité.
- **Champ de Vision Dynamique :** Cône de direction synchronisé avec la boussole magnétique de votre appareil.
- **Mode Suivi Automatique :** La caméra reste verrouillée sur votre position pendant votre marche.

## ✨ Nouveautés v3.9.4
- **Forêts 3D Denses :** Immersion totale avec des milliers d'arbres générés en temps réel là où les forêts existent réellement (Swisstopo & OpenTopoMap).
- **Détection Intelligente :** Algorithme de scan haute définition éliminant les arbres isolés pour un rendu de massifs forestiers naturel et touffu.
- **Brouillard Adaptatif :** Voile atmosphérique dynamique lié à l'altitude pour une visibilité cristalline au premier plan et un horizon naturel.
- **Profil d'Altitude Interactif :** Graphique dynamique synchronisé avec vos traces GPX en 3D.
- **Moteur de Picking HD :** Lecture d'altitude par Ray-marching CPU (Précision ~6m).
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
