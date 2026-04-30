# SunTrail — Navigation & Modules Fonctionnels (v5.40.39)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Mouvements de Caméra

- **Vue de démarrage** : Centroïde Suisse — `TARGET_LAT: 46.8182, TARGET_LON: 8.2275`, `ZOOM: 6`.
- **Cinematic flyTo** : Trajectoire parabolique (`easeInOutCubic`) via `cameraManager.ts`.
- **Adaptive Zoom** : Saut intelligent de LOD lors des téléportations.
- **Tilt Parabola** : Inclinaison max dynamique — pic au LOD 14.
- **Tilt Transition 2D↔3D** : `state.isTiltTransitioning` — lerp du polar angle vers 85% du `tiltCap`.

---

## Navigation Tactile style Google Earth (v6.3)

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

### Recherche & Géocodage (`SearchSheet.ts`)
- **BaseComponent** avec recherche hybride : filtrage local `state.localPeaks` + géocodage distant MapTiler/OSM Nominatim (debounce 400ms).
- **Classification (v5.18.0)** : `classifyFeature()` → pays/région/ville/village/sommet/POI. Zoom adaptatif : pays → LOD 6, ville → LOD 11, sommet → LOD 14.
- **Filtres chips** : `activeFilter: 'all' | 'cities' | 'mountains' | 'countries'`. Overpass `natural=peak` **uniquement** sur filtre "Montagnes" (timeout 5s). **Ne jamais lancer Overpass sur "Tout"**.
- ARIA complet : `aria-label`, `role="listbox"`, live regions.

### Profil d'Élévation (`profile.ts`)
- **SVG** avec gradient, redimensionnement responsive.
- **Interaction** : survol affiche distance/altitude/pente%. Marqueur 3D cyan synchronisé.
- **Calculs** : D+/D-, pente par segment, distance haversine.
- **Tiroir swipe-to-dismiss (v5.16.8)** : Panel repositionné juste au-dessus du menu nav. Drag handle + swipe.
- **Exports** : `updateElevationProfile()`, `closeElevationProfile()`, `haversineDistance()`.

### Boussole 3D (`compass.ts`)
- Scène Three.js dédiée (canvas 120×120px). Cône rouge (Nord) + blanc (Sud), lettres N/S/E/O en sprites.
- Inverse le quaternion de la caméra principale. Animation reset-to-North 800ms.
- **Exports** : `initCompass()`, `renderCompass()`, `resetToNorth()`, `updateCompassAnimation()`, `isCompassAnimating()`.

### POI & Signalisation (`poi.ts`)
- **Source** : Vector Tiles PBF — SwissTopo (`ch.swisstopo.base.vt`) en CH via zoom 14, MapTiler v3 hors CH via zoom 12.
- **Détection unifiée** (v5.40.38) : supporte le format SwissTopo (`class`/`subclass`, ex: `lodging`/`alpine_hut`) et MapTiler (`class` seule).
- **8 catégories** : trail (🔶 sentiers nommés via `transportation_name`), hut (🟤 refuges/cabanes), rest (🟢 haltes/pique-nique/eau), attraction (🔵 cascades/grottes), viewpoint (🔭), shelter (🏠), info (i), guidepost.
- Sprites Three.js à altitude terrain + 12m, échelle 24×24.
- **Interaction** : clic → affiche le nom du POI dans `coords-pill` avec sa catégorie.
- **Filtrage couches** : ignore `line`, `poly`, `water`, `landuse`, `building`, `transportation`, `road`, `highway` mais conserve `transportation_name`.
- Cache mémoire + Cache API (zone-based, 200 entrées max). Cooldown 60s/zone en erreur.

### Sommets (`peaks.ts`)
- **Source** : Overpass API (`natural=peak`, `ele > 1000m`), trié par altitude décroissante.
- Cache localStorage 7 jours, invalidé si déplacement > 25km.
- **Export** : `fetchLocalPeaks()` → `state.localPeaks`.

### GPS & Localisation (`location.ts`)
- Capacitor Geolocation (high accuracy, timeout 5s, maxAge 3s).
- Filtres : bruit statique GPS (seuil ~50cm) + low-pass 10% sur boussole.
- Marqueur : Group Three.js (anneau bleu + cône de vue 60° + dot canvas-texture HD). Rotation par `state.userHeading`.
- **REC** : Enregistrement dans `state.recordedPoints` quand `state.isRecording=true`.
- **Exports** : `startLocationTracking()`, `stopLocationTracking()`, `updateUserMarker()`, `centerOnUser()`.

### Analyse Solaire (`analysis.ts`)
- **`runSolarProbe()`** : `SolarAnalysisResult` — lever/coucher, midi solaire, golden hours, phase lunaire (nom + %), courbe élévation 24h (144 points), azimut/élévation courants, minutes totales d'ensoleillement.
- **Détection d'ombre** : Ray-cast vers le soleil, pas adaptatif (500m base, 1km+ au-delà de 10km).
- **Échantillonnage terrain** : Interpolation bilinéaire sur height maps (encodage Terrain-RGB).
- Dépendance : SunCalc.

### Météo (`weather.ts`)
- **Source** : Open-Meteo API (sans clé) — courant, horaire 24h, prévisions 3 jours.
- ShaderMaterial sur Points (15 000 particules max). Pluie = traits verticaux (4000 u/s). Neige = flocons 6 branches avec dérive sinusoïdale (700 u/s). Vent issu de l'API.
- **Exports** : `fetchWeather()`, `initWeatherSystem()`, `updateWeatherSystem()`, `getWeatherIcon()`.

### Géo-utilitaires (`geo.ts`)
- Web Mercator : `lngLatToWorld()`, `worldToLngLat()`, `lngLatToTile()`, `getTileBounds()`.
- `clampTargetToBounds()` pour clamping caméra.

### Worker Pool (`workerManager.ts`)
- **Singleton `tileWorkerManager`** : 4 workers (mobile) / 8 workers (desktop).
- Gestion par ID avec Promises, déduplication, timeout 15s. Annulation via `cancelTile()` → `AbortController.abort()`.
- Reporting erreurs 403 pour désactiver MapTiler globalement.

---

### Timeline / Simulation Solaire (`TimelineComponent.ts`)
- **Toggle** : Bouton `#timeline-toggle-btn` dans la top status bar (🕒). Ouvert seulement en mode 3D.
- **Auto-open/close** : La timeline s'ouvre automatiquement au passage en 3D, se ferme au passage en 2D.
- **Drag** : Swipe down pour fermer, drag libre vers le haut pour repositionner. Chevauchement dynamique des widgets voisins.
- **FAB stack** : Les boutons flottants restent visibles sur écrans larges (>600px). Masqués sur petits écrans où la timeline les chevauche.

### Bouton 2D/3D (`NavigationBar.ts`)
- **Emplacement** : FAB stack (bas-droite). Icône et label indiquent le **mode de destination** (appel à l'action).
  - En mode 2D : icône cube isométrique + label "3D" → "cliquez pour la 3D"
  - En mode 3D : icône plan quadrillé + label "2D" → "cliquez pour la 2D"
- **Verrouillage LOD ≤ 10** : Forcé en 2D, bouton désactivé (0.35 opacité). Le mode précédent est restauré au dézoom > 10.
