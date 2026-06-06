# SunTrail — Navigation & Modules Fonctionnels (v5.57.0)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Mouvements de Caméra

- **Vue de démarrage** : Centroïde Suisse — `TARGET_LAT: 46.8182, TARGET_LON: 8.2275`, `ZOOM: 6`.
- **Cinematic flyTo** : Trajectoire parabolique (`easeInOutCubic`) via `cameraManager.ts`.
- **Adaptive Zoom** : Saut intelligent de LOD lors des téléportations.
- **Tilt Parabola** : Inclinaison max dynamique — pic au LOD 14.
- **Tilt Transition 2D↔3D** : `state.isTiltTransitioning` — lerp du polar angle vers 85% du `tiltCap`.

---

## Navigation Tactile style Google Earth

`src/modules/touchControls.ts` — module autonome interceptant les **PointerEvents**.

### Architecture 2 doigts :
- **Zoom** : pinch-spread → `zoomToPoint()` via raycasting.
- **Rotation** : twist → `doRotate()`, avec zone morte `ROT_DEADZONE`.
- **Tilt** : Détection par le **placement initial des doigts**. Si doigts côte à côte (angle < `TILT_ANGLE`) → pré-armement du tilt.
- **Pan** : 1 doigt (avec inertie) ou 2 doigts horizontaux.
- **Double-Tap** : Zoom rapide sur le point cliqué.
- **Inertie** : Désactivée si `prefers-reduced-motion` est actif.

---

## GPS & Orientation

- **Origin Shift** : Recentrage dynamique (seuil 35km) — translation atomique de tous les objets (caméra, soleil, marqueur, GPX, forêts, étiquettes).
- **Lissage Boussole** : Filtre passe-bas 10% sur `DeviceOrientation`.

---

## Modules Fonctionnels

### Offline Zones (v5.57.0)
- **Selection visuelle interactive** : Un rectangle vert semi-transparent (intersection frustum camera + sol) permet de définir la zone à télécharger.
- **LOD Slider** : Slider double LOD indépendant du zoom (5→18).
- **Toolbar** : Affiche le compteur de tuiles et la taille estimée. Warning orange > 500, rouge > 1000, bloqué > 2000 tuiles.
- **Fichiers** : `ZoneSelector.ts`, `ZoneOverlay.ts`, `ZoneSelectToolbar.ts`.

### Recherche & Géocodage (`SearchSheet.ts`)
- **BaseComponent** avec recherche hybride : filtrage local `state.localPeaks` + géocodage distant MapTiler/OSM Nominatim (debounce 400ms).
- **Classification** : `classifyFeature()` → pays/région/ville/village/sommet/POI. Zoom adaptatif : pays → LOD 6, ville → LOD 11, sommet → LOD 14.
- **Filtres chips** : `activeFilter: 'all' | 'cities' | 'mountains' | 'countries'`.

### Profil d'Élévation (`profile.ts`)
- **Interaction** : survol affiche distance/alt/pente% + **heure estimée** (v5.52.3).
- **Bande solaire SVG 12px** (v5.52.3) : Affichée sous le graphique (or/bleu-ombre/bleu-nuit).
- **Touch fix** (v5.52.3) : `touch-action:none` sur conteneur pour éviter les conflits de scroll.

### POI & Signalisation (`poi.ts`)
- **Détection unifiée** (v5.40.38) : supporte SwissTopo et MapTiler.
- **8 catégories** : trail (🔶), hut (🟤), rest (🟢), attraction (🔵), viewpoint (🔭), shelter (🏠), info (i), guidepost.
- Sprites Three.js à altitude terrain + 12m.

### Analyse Solaire (`solarRoute.ts`)
- **Deux modes** (v5.56.18) :
    - **Snapshot** : Ombre à l'heure du slider (Free).
    - **Hiker Timeline** : Ombre à l'heure d'arrivée estimée (Pro).
- **Overlay 3D** : TubeGeometry coloré live (soleil or / forêt vert / ombre bleu / nuit bleu-nuit).
- **Recommandations** : Grille 3×2 stats + alerte exposition forte + recommendation lampe frontale si nuit.

### Météo (`weather.ts`)
- **Particules 3D** (v5.56.4) : Système `THREE.Points` avec `ShaderMaterial`. Toggle pluie/neige via uniforme `uIsRain`.
- **Garde-fou température** : Si `temp > 5°C`, force pluie au lieu de neige.

---

### Navigation Bar & 2D/3D (`NavigationBar.ts`)
- **Bouton Dynamique** : Affiche le mode de destination (Cube isométrique → 3D, Plan → 2D).
- **Verrouillage LOD ≤ 10** : Forcé en 2D pour performance overview.
- **Timeline Auto** : S'ouvre en 3D, se ferme en 2D.
