# ⛰️ SunTrail V3.0 (Three.js)

**SunTrail** est un moteur de visualisation de terrain 3D haute performance développé avec Three.js. Il génère des reliefs réalistes en temps réel à partir de données topographiques mondiales et simule la position exacte du soleil.

## 🚀 Nouveautés de la Version 3.0

- **Horizon Infini (Multi-Zoom) :** Système de double grille combinant des tuiles de haute précision (Z12-14) sous la caméra et un fond de carte planétaire (Z9) couvrant plus de 400 km.
- **Intelligence Géographique :** Détection automatique des frontières suisses pour basculer dynamiquement entre les données ultra-précises de **Swisstopo** et la couverture mondiale d'**OpenTopoMap**.
- **Ergonomie Adaptative :** Détection automatique de l'appareil pour utiliser des contrôles optimisés : mode "Map" (translation) pour PC et mode "Orbit" (pivot) pour Mobile/Tablette.
- **Monitoring Performance :** Intégration d'un module de statistiques (FPS, temps de rendu, mémoire) et d'un indicateur de charge GPU (textures + géométries).
- **Stabilité Réseau :** Système "Anti-Burst" pour étaler les requêtes API et éviter les erreurs de quota (429) ou CORS lors des déplacements rapides.
- **Transitions Luxueuses :** Fondu (Fade-in) à l'apparition des tuiles et compensation mathématique des changements d'origine pour une navigation sans aucun saut visuel.

## 🛠️ Installation

1. **Cloner le dépôt :**
   ```bash
   git clone https://github.com/jackseg80/suntrail_threejs.git
   cd suntrail_threejs
   ```

2. **Installer les dépendances :**
   ```bash
   npm install
   ```

3. **Lancer le serveur de développement :**
   ```bash
   npm run dev
   ```

## 📦 Stack Technique

- **Moteur 3D :** Three.js (R160+)
- **Données :** MapTiler Cloud (Terrain-RGB v2)
- **Astronomie :** SunCalc
- **Contrôles :** MapControls & OrbitControls (Adaptatifs)
- **Stats :** Stats.js

---
Version 3.0 - Stable & Performante.
