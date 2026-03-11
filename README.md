# ⛰️ SunTrail 3D (v3.3)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v3.3
- **Interface Touch-First :** Ergonomie repensée pour tablettes et mobiles (boutons larges, glassmorphism).
- **Sélecteur de Calques Visuel :** Basculez entre Satellite, Topo et OpenTopoMap avec prévisualisation.
- **Fusion de Couches :** Superposez les chemins de randonnée officiels sur n'importe quel fond de carte.
- **Bouton GPS :** Positionnement temps réel sur le terrain.
- **Optimisation RTX :** Support complet des GPU dédiés pour un rendu fluide à 144 FPS.

## 🛠️ Installation
1. Clonez le dépôt.
2. `npm install`
3. `npm run dev`
4. Entrez votre clé API MapTiler au lancement.

## ⚙️ Technologies
- **Moteur :** Three.js (WebGL)
- **Données :** MapTiler Cloud (Terrain RGB + Sat) & Swisstopo (WMTS)
- **Calculs :** SunCalc (Astronomie précise)
- **Style :** CSS Moderne (Glassmorphism & Flexbox)
