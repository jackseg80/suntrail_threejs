# ⛰️ SunTrail V2.5 (Three.js)

**SunTrail** est un moteur de visualisation de terrain 3D haute performance développé avec Three.js. Il génère des reliefs réalistes en temps réel à partir de données topographiques mondiales et simule la position exacte du soleil pour projeter des ombres physiques sur le paysage.

## 🚀 Fonctionnalités (v2.5)

- **Architecture Orientée Objet :** Chaque tuile est une instance de la classe `Tile` avec son propre cycle de vie.
- **LOD Dynamique Universel :** Ajustement automatique de la résolution du maillage (128, 64, 32) et du niveau de zoom (12 à 14) selon la distance et l'altitude.
- **Transitions Fluides :** Système de fondu (Fade-in) à l'apparition des nouvelles tuiles et compensation mathématique des changements d'origine pour éviter les sauts visuels.
- **Mise en cache intelligente :** Cache mémoire (RAM) pour les textures et données d'élévation afin d'accélérer les allers-retours entre niveaux de zoom.
- **Trace GPX Haute Visibilité :** Import de fichiers GPX avec rendu en tube rouge brillant, épaisseur adaptative et synchronisation automatique avec le relief.
- **Simulation Solaire Réelle :** Calcul de l'azimut et de l'élévation via `SunCalc` avec boussole solaire intégrée.
- **Relief 3D Haute Fidélité :** Interpolation bilinéaire pour des raccords de tuiles parfaits et sans cassures.

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

Le projet nécessite une **clé API MapTiler**. Elle vous sera demandée au lancement de l'application.

## 📦 Stack Technique

- **Moteur 3D :** [Three.js](https://threejs.org/)
- **Données Cartographiques :** [MapTiler Cloud](https://www.maptiler.com/cloud/) (Swisstopo par défaut)
- **Calculs Astronomiques :** [SunCalc](https://github.com/mourner/suncalc)
- **Outil de Build :** [Vite](https://vitejs.dev/)

---
Développé avec passion pour l'exploration 3D.
