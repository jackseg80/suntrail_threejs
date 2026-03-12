# ⛰️ SunTrail 3D (v3.5)

Moteur de visualisation topographique 3D ultra-performant basé sur Three.js et les données Swisstopo / MapTiler.

## ✨ Nouveautés v3.5
- **GPS Natif (Capacitor) :** Géolocalisation haute précision avec gestion des permissions système Android.
- **Optimisation Mémoire :** Gestion intelligente des ressources GPU (VRAM) et nettoyage des scènes 3D.
- **LOD Adaptatif :** Résolution dynamique du maillage terrain en fonction de la distance caméra.
- **Interface Touch-First :** Ergonomie repensée pour tablettes et mobiles (boutons larges, glassmorphism).
- **Sélecteur de Calques Visuel :** Basculez entre Satellite, Topo et OpenTopoMap avec prévisualisation.
- **Fusion de Couches :** Superposez les chemins de randonnée officiels sur n'importe quel fond de carte.

## 📱 Application Mobile (Android)

Suntrail 3D est désormais disponible en application Android native grâce à **Capacitor**. 
Elle supporte :
- Le rendu 3D haute performance.
- Les icônes et écrans de démarrage personnalisés.
- Le chargement de fichiers GPX depuis le stockage du téléphone.

Pour plus de détails sur le développement et le déploiement mobile, consultez le [Guide Android](./ANDROID.md).

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
