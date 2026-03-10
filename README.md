# ⛰️ SunTrail V10 (Three.js)

**SunTrail** est un moteur de visualisation de terrain 3D haute performance développé avec Three.js. Il génère des reliefs réalistes en temps réel à partir de données topographiques mondiales et simule la position exacte du soleil pour projeter des ombres physiques sur le paysage.

## 🚀 Fonctionnalités

- **Relief 3D Haute Fidélité :** Génération de maillages denses à partir de tuiles Terrain-RGB (MapTiler).
- **Simulation Solaire Réelle :** Calcul de l'azimut et de l'élévation du soleil via `SunCalc`.
- **Ombres Portées Physiques :** Utilisation de Shadow Maps pour un rendu réaliste des reliefs.
- **Navigation Géographique :** Système de géocodage intégré pour explorer n'importe quel sommet ou ville dans le monde.
- **Chargement Dynamique :** Gestion intelligente des tuiles (LOD de base) pour une exploration fluide.

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

## 🔑 Configuration

Le projet nécessite une **clé API MapTiler** (gratuite pour un usage personnel). Elle vous sera demandée au lancement de l'application.

## 📦 Stack Technique

- **Moteur 3D :** [Three.js](https://threejs.org/)
- **Données Cartographiques :** [MapTiler Cloud](https://www.maptiler.com/cloud/)
- **Calculs Astronomiques :** [SunCalc](https://github.com/mourner/suncalc)
- **Outil de Build :** [Vite](https://vitejs.dev/)

---
Développé avec passion pour l'exploration 3D.
