# 🛰️ SunTrail 3D - Manifeste de Transition Technique (v4.8.5)

Ce document sert de spécification technique exhaustive pour la migration du moteur SunTrail de Three.js (Web) vers Unity + Cesium (Natif).

---

## 1. Algorithmes Fondamentaux

### A. Décodage de l'élévation (Terrain-RGB)
Le moteur utilise des tuiles MapTiler Terrain-RGB v2.
- **Formule de décodage** : 
  `Height (m) = -10000 + ((R * 256^2 + G * 256 + B) * 0.1)`
- **Interpolation** : Utiliser une interpolation bi-linéaire sur les pixels adjacents pour une fluidité à 60 FPS lors du suivi GPS.

### B. Sonde Solaire (Analyse d'Horizon)
Calcul de l'ensoleillement cumulé sur un point (Ray-marching).
1. **Échantillonnage** : 96 pas (toutes les 15 min sur 24h).
2. **Ray-Marching** :
   - Origine : `Position du clic (x, y, z)`.
   - Direction : `Vecteur Soleil (Azimut, Altitude)`.
   - Pas de marche : 300m.
   - Distance max : 40km (suffisant pour masquer l'horizon montagneux).
   - Condition d'ombre : Si `Altitude_Terrain(Rayon_P) > Hauteur_Rayon(Rayon_P)`.

### C. Shader d'Inclinomètre (Calcul de Pente)
Calculé dans le fragment shader pour une performance maximale.
- **Normale de surface** : Calculée par différence finie entre 4 échantillons de hauteur (L/R/U/D).
- **Angle de pente** : `slopeRad = acos(dot(Normal, UpVector))`.
- **Seuils de couleur (Sécurité Avalanche)** :
  - **Jaune** : > 30° (Attention)
  - **Orange** : > 35° (Danger)
  - **Rouge** : > 40° (Danger critique)
- **Opacité conseillée** : 55% pour garder la lisibilité de la carte topo.

---

## 2. Configuration & State

### Paramètres de Performance (Presets)
- **Eco** : Résolution terrain 2px, Range 3 tuiles, Shadows OFF.
- **Balanced** : Résolution terrain 64px, Range 4 tuiles, Shadows ON (basse res).
- **Ultra** : Résolution terrain 256px, Range 8 tuiles, Shadows HQ.

### Logique de Navigation
- **FlyTo** : Trajectoire parabolique (interpolation `easeInOutCubic`). Altitude cible proportionnelle à la distance parcourue.
- **GPS Smoothing** : Interpolation linéaire (LERP) des coordonnées à 60 FPS pour compenser le saut des 1Hz du capteur GPS.

---

## 3. Fonctionnalités Implémentées (V4.6)
- [x] Moteur de recherche de sommets (Overpass API + Cache local 7j).
- [x] Boussole stabilisée (Zone morte 1.5°).
- [x] Profil altimétrique dynamique le long d'une trace.
- [x] Mode "Deep Sleep" (Stop rendu à 0 FPS si app en arrière-plan).
- [x] Scraper Offline (Rayon 6km).

---

## 4. 🧭 ROADMAP ALPINISTE (TODOs Critiques pour Unity)

### Étape 1 : Sécurité Alpine
- [ ] **SOS SMS Low-Bandwidth** : Générateur de message (Lat/Lon, Alt, % Bat) pour zones sans data.
- [ ] **Calcul de pente GPX** : Analyser chaque segment d'une trace importée et colorer le profil altimétrique selon la difficulté.

### Étape 2 : Immersion & Données
- [ ] **Hydrologie Réelle** : Rendu des lacs/rivières via données OSM (Shaders de réflexion).
- [ ] **Végétation Bio-Fidèle** : Adaptation des essences d'arbres selon l'altitude (Mélèzes > 1800m, etc.).
- [ ] **Données Mondiales** : Intégration SRTM/Copernicus via Cesium Ion.

### Étape 3 : Optimisation Native
- [ ] **Moteur Hybride WebGL/WebGPU** (pour la version Web Unity).
- [ ] **Textures Compressées (KTX2/Basis)** pour un chargement instantané sur mobile.

---

## 5. Recommandations Unity + Cesium
- **Précision** : Utiliser impérativement `CesiumGeoreference` pour le placement 64-bit.
- **UI** : Utiliser Unity UI Toolkit pour une interface responsive haute performance.
- **Shaders** : Porter l'inclinomètre dans Unity Shader Graph pour le support URP (Universal Render Pipeline).
