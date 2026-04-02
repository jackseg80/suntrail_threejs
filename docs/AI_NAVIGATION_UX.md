# SunTrail — Navigation & Modules Fonctionnels (v5.19.6)

> Référence détaillée pour agents IA. Point d'entrée : [CLAUDE.md](../CLAUDE.md)

---

## Mouvements de Caméra

- **Vue de démarrage (v5.11.2)** : Centroïde Suisse — `TARGET_LAT: 46.8182, TARGET_LON: 8.2275`, `ZOOM: 6`. Caméra initiale à `(0, 2000000, 2000000)`. `TARGET_LAT/LON` et `ZOOM` non persistés en localStorage.
- **Cinematic flyTo** : Trajectoire parabolique (`easeInOutCubic`) + vérification anti-collision en temps réel.
- **Adaptive Zoom (v5.8.6)** : Saut intelligent de LOD lors des téléportations — netteté immédiate à l'arrivée.
- **Tilt Parabola** : Inclinaison max dynamique — pic au LOD 14, redressement à haute altitude pour masquer l'horizon vide.
- **Tilt Transition 2D↔3D (v5.16.8)** : `state.isTiltTransitioning` — lerp du polar angle vers 85% du `tiltCap`. `rebuildActiveTiles()` décalé de 150ms.

---

## Navigation Tactile Google Earth (v5.11)

`src/modules/touchControls.ts` — module autonome interceptant les **PointerEvents** (pas TouchEvents) en phase capture avant OrbitControls. Désactive `controls.enabled = false` au premier contact, réactive à la fin.

### Architecture 2 doigts :
- **Zoom** : pinch-spread → `doZoomToPoint()` raycasting (zoome vers le centre des doigts).
- **Rotation** : twist → `doRotate()`, 3 guards : `|dAngle| > ROT_DEADZONE` + `|dAngle| > spreadDelta × 0.5` + `|dAngle| × 150 > |dy|`.
- **Tilt** : détecté par le **placement initial des doigts** (style Google Earth). Si doigts côte à côte (angle < `TILT_ANGLE = 45°`) → `_tiltPreArmed = true`. Dès `|dy| > |dx|` + spread stable → `_tiltLocked = true` → seul `doTilt(dy)`. **⚠️ Erreur fatale** : détecter par accumulation (v2→v5) → PointerEvents un pointeur à la fois → faux positifs. Seule la détection par placement fonctionne.
- **Pan** : 1 doigt (avec inertie) ou 2 doigts horizontaux.
- **Paramètres** ajustables en tête de fichier : `PAN_SPEED`, `TILT_SPEED`, `INERTIA`, `ROT_DEADZONE`, `TILT_ANGLE`.

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
- **Source** : Overpass API (`information~"guidepost|map|board"`).
- Sprites Three.js (cercle doré) à altitude terrain + 25m.
- Cache mémoire + Cache API (zone-based, zoom 12). Cooldown 60s/zone en erreur.

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
