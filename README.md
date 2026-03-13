# ⛰️ SunTrail 3D (v4.2.3)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v4.2.3 (Analytique Solaire)
- **Solar Insight Dashboard :** Nouvel outil d'analyse complet avec calcul du lever de soleil réel (tenant compte du relief) et cumul d'ensoleillement ultra-précis.
- **Timeline Interactive :** Cliquez sur la barre de temps pour visualiser instantanément l'ombre portée à une heure précise.
- **Précision Métrique :** Nouveau moteur d'interpolation bi-linéaire pour un relief lissé et une analyse d'occlusion à 5 minutes d'intervalle.
- **Interface Responsive :** Panneaux d'analyse et contrôles optimisés pour tous les écrans mobiles.

## ✨ Nouveautés v4.1.x (Immersion & UX)
- **Interface Éphémère :** Masquage automatique des contrôles après 5 secondes d'inactivité pour une immersion totale dans le relief.
- **Signalétique Interactive :** Les panneaux de randonnée 3D sont désormais cliquables pour afficher le nom du lieu ou du carrefour.
- **Capture d'écran HD :** Bouton 📸 dédié pour capturer la vue 3D actuelle sans les éléments d'interface.
- **Thème Système :** Synchronisation automatique avec le mode Sombre/Clair de votre appareil.

## ✨ Nouveautés v4.0.3 (Performance Flagships)
- **Optimisation Galaxy S23 :** Augmentation de la densité du maillage à 160 pour le profil "High", offrant un relief plus ciselé sur les écrans haute résolution.
- **Correctifs TS :** Résolution des erreurs de typage et nettoyage des imports pour un build de production optimal.

## ✨ Nouveautés v4.0.2 (Turbo & Stabilité)
- **Format WebP :** Migration vers le format WebP pour toutes les sources MapTiler, réduisant le poids des tuiles de 30 à 50%.
- **Chargement Parallèle :** Augmentation du parallélisme à 12 requêtes simultanées pour un remplissage ultra-rapide.
- **Robustesse Signalétique :** Système de "Mega-Zones" (Z10) et file d'attente globale pour l'API Overpass, éliminant les erreurs 429/504.

## ✨ Nouveautés v4.0.0 (Randonnée HD)
- **Signalétique 3D :** Affichage des panneaux de signalisation de randonnée (données OSM) directement sur le relief.
- **Cache Persistant Global :** Stockage local de toutes les données (Relief, Couleur, Sentiers) pour un usage fluide et offline.

## 📱 Application Mobile (Android)

SunTrail 3D est optimisé pour les appareils mobiles grâce à **Capacitor**. 
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
Le projet intègre une suite de tests unitaires et d'intégration complète avec **Vitest**.
- **Couverture :** 28 tests validés (Terrain, Sun, UI, Utils).
- **CI/CD :** Validation automatique avant chaque build.

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
