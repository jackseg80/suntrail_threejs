# SunTrail — Navigation & Modules Fonctionnels (v5.83.1)

> Référence de la release publique corrective v5.83.1. Point d'entrée :
> [CLAUDE.md](../CLAUDE.md).

---

## Parcours principal v5.82.0

- **Explorer** ouvre la recherche ; **Préparer** active un mode explicite ; **Sortie**
  regroupe l'enregistrement/import ; **Bibliothèque** cible la liste locale dans le même
  `TrackSheet`. Réglages, aide et compte restent secondaires.
- `data-tab="search|prepare|track|library|settings"` constitue le contrat courant.
  `track` et les IDs historiques du sheet sont conservés pour les modules et tests existants.
- En mode `state.isRoutePlanningMode`, un tap terrain ajoute un waypoint. Hors de ce mode,
  le même tap conserve la sélection carte/POI/GPX ; l'appui long de 500 ms reste disponible
  comme raccourci expert avec une astuce affichée une seule fois.
- La barre de route reste visible à vide en mode Préparer, expose chargement, erreur ou
  statistiques, et conserve inversion, réordonnancement, suppression et effacement.
- À partir de 900 px, les sheets deviennent un rail droit et le panneau de route un atelier
  latéral. Les fonctions restent identiques à Android/mobile.
- L'onboarding comporte trois écrans et mène vers Explorer, Planifier ou Importer. Il est
  fermable avec Échap et piège le focus dans le dialogue.

### Recherche contextualisée

`rankSearchResults()` pondère correspondance du nom, pays de la vue et distance à la cible.
Chaque résultat affiche son type, sa région, son pays, son altitude si disponible et sa
distance. L'ordre fournisseur reste stable en cas d'égalité.

## Prepared Routes v5.83.0

- **Préparer** accepte taps carte ou recherche A/B, puis nom, heure prévue, allure, favori,
  notes et tags. La liste de waypoints permet déplacement par coordonnées, ordre, suppression,
  inversion et undo/redo.
- **Bibliothèque** reste le même `TrackSheet` que **Sortie**, mais affiche les routes IndexedDB,
  leurs actions locales et les cinq traces récentes legacy dans une section distincte.
- Une route sauvegardée se rouvre sans appel routing : géométrie complète et statistiques sont
  restaurées. Un brouillon en échec n'écrase pas le dernier snapshot validé.
- Un GPX ouvert conserve chacun de ses points dans la géométrie, sans créer autant de marqueurs
  éditables. Un GPX ouvert utilise A/B ; une boucle détectée utilise A, deux passages
  intermédiaires et B revenu au départ, afin que les marqueurs ne semblent pas réduits à un point.
- L'ouverture d'une route préparée ferme d'abord la Bibliothèque puis garantit l'affichage du
  profil de sa géométrie restaurée.
- ORS fournit SAC/couverture ; OSRM ou données absentes affichent une difficulté inconnue expliquée.
  Un GPX importé sans données SAC vérifiables reste lui aussi « inconnu » ; effort, ETA et soleil
  restent calculés indépendamment.
- La sélection d’une trace récente est une consultation (carte, fly, profil/pente), pas un
  changement de brouillon. « Préparer cette trace » est l’unique transition explicite d’un GPX
  vers l’atelier.
- Le bandeau Préparer affiche toujours le type et le nom de sa propre route. Si un autre profil
  est consulté, ses données ne remplacent pas les kilomètres/dénivelés du brouillon.
- Avant de remplacer un brouillon modifié, l’utilisateur choisit Sauvegarder puis ouvrir,
  Remplacer sans sauvegarder ou Annuler.
- Sortie affiche un compteur de traces réellement visibles, la trace consultée et des commandes
  Masquer les autres / Tout masquer. Le REC est signalé comme indépendant et reste la source des
  statistiques de Sortie pendant l’enregistrement.
- Les routes PreparedRoute fermées restent uniquement dans IndexedDB. Elles ne créent aucun
  calque Three.js avant leur ouverture ; l’historique récent reste limité à cinq entrées et les
  calques chargés à dix.

## Suivi terrain prévu en v5.84

- L'écran actif mettra en avant la prochaine indication et sa distance, puis la distance/ETA
  restantes, l'écart à la trace et la qualité GPS. Il restera utilisable à une main et ne
  masquera ni la carte ni le prochain danger de navigation.
- Une indication issue des étapes ORS/OSRM est une manœuvre routée. Un simple changement de cap
  déduit d'une géométrie GPX est présenté comme « changement de direction approximatif », jamais
  comme une instruction certaine à une intersection.
- Les waypoints ou POI nommés réellement associés à la trace peuvent apparaître comme prochain
  point utile avec leur distance. Une trace GPX sans ces données reste parfaitement navigable
  en suivi de ligne, sans inventer de noms ni de points d'intérêt.
- Les alertes v5.84 sont visuelles et haptiques, application ouverte. Voix, notification écran
  verrouillé, recalcul réseau et survie après fermeture restent hors de ce jalon interne.

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
