# SunTrail — Navigation & Modules Fonctionnels (v5.88.0 — stabilisation performance)

> Référence de la pré-release foreground interne v5.84. Point d'entrée :
> [CLAUDE.md](../CLAUDE.md).

---

## Parcours principal v5.82.0

- **Explorer** ouvre la recherche ; **Préparer** active un mode explicite ; **Sortie** expose la
  route courante, Guidance et REC ; **Bibliothèque** réunit import, itinéraires à suivre et activités
  enregistrées dans « Mes parcours », au sein du même `TrackSheet`.
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

### Tableau de bord Sortie v5.86.2

`buildOutingDashboard()` est le contrat déterministe de présentation :

- `rest` propose Bibliothèque ou Préparer, sans faux catalogue vide ;
- `route` montre une mini-carte, les statistiques compactes et les actions profil/guidage ;
- `guidance` montre prochaine indication, distance, écart, restant et ETA ;
- `recording` donne la priorité à la durée réelle, distance, allure et D+, avec altitude, D−,
  précision GPS et points en détail ;
- `combined` conserve deux cartes distinctes Guidance et REC ;
- `completed` affiche un résumé temporaire et un accès explicite à Bibliothèque.

Les identifiants historiques `track`, `gpx-upload` et `gpx-layers-list` sont conservés, mais les
deux derniers ne sont rendus qu'en Bibliothèque. Aucun upsell permanent ne doit interrompre une
activité ; le gate export Free intervient avant Blob, cache ou fichier.

### Bibliothèque durable v5.87.0

- `TrackRepository` est la source canonique des archives REC/import, avec géométrie complète ;
  `RouteRepository` reste réservé aux itinéraires préparés.
- Free conserve toutes les traces et en ouvre une à la fois. Pro ajoute la superposition et
  l'export fichier ; aucun entitlement ne modifie ni ne simplifie une archive.
- Ouvrir consulte la trace, le crayon la renomme et « Refaire » crée explicitement un itinéraire.
  Aucune de ces actions ne transforme silencieusement une archive en route préparée.
- L'origine et la qualité restent secondaires mais visibles. Une migration legacy garde sa
  géométrie approximative et ne reçoit ni altitude, ni précision, ni horodatage inventé.
- La seule limite de persistance est le stockage réel de l'appareil ; une erreur de quota reste
  explicite et ne déclenche aucun nettoyage silencieux.

### Recherche contextualisée

`rankSearchResults()` pondère correspondance du nom, pays de la vue et distance à la cible.
Chaque résultat affiche son type, sa région, son pays, son altitude si disponible et sa
distance. L'ordre fournisseur reste stable en cas d'égalité.

## Prepared Routes v5.83.0

- **Préparer** accepte taps carte ou recherche A/B, puis nom, heure prévue, allure, favori,
  notes et tags. La liste de waypoints permet déplacement par coordonnées, ordre, suppression,
  inversion et undo/redo.
- **Bibliothèque** reste le même `TrackSheet` que **Sortie**, mais ne montre plus des catégories
  techniques séparées. Les routes IndexedDB sont « À suivre » ; les REC historiques sont
  « Enregistré ». L'origine GPX, SunTrail ou GPS reste un badge secondaire.
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
- La sélection d’une activité reste une consultation (carte, fly, profil/pente), pas un changement
  de brouillon. « Refaire » crée un itinéraire séparé, marqué approximatif lorsque seule la
  géométrie historique simplifiée est disponible.
- Le bandeau Préparer affiche toujours le type et le nom de sa propre route. Si un autre profil
  est consulté, ses données ne remplacent pas les kilomètres/dénivelés du brouillon.
- Avant de remplacer un brouillon modifié, l’utilisateur choisit Sauvegarder puis ouvrir,
  Remplacer sans sauvegarder ou Annuler.
- Free ouvre tous les parcours mais n'en affiche qu'un à la fois. Pro ajoute explicitement des
  parcours à la carte, jusqu'à dix calques, et montre les commandes multi-affichage. Le REC actif
  reste indépendant et demeure la source des statistiques de Sortie pendant l’enregistrement.
- Les routes PreparedRoute fermées restent uniquement dans leur IndexedDB. Elles ne créent aucun
  calque Three.js avant leur ouverture ; les archives `TrackRepository` ne sont plus limitées à
  cinq entrées et les calques simultanément chargés restent bornés à dix pour Pro.

## Suivi terrain foreground v5.84

- L'écran actif met en avant la prochaine indication et sa distance, puis la distance/ETA
  restantes, l'écart à la trace et la qualité GPS. Il restera utilisable à une main et ne
  masquera ni la carte ni le prochain danger de navigation.
- Une indication issue des étapes ORS/OSRM est une manœuvre routée. Un simple changement de cap
  déduit d'une géométrie GPX est présenté comme « changement de direction approximatif », jamais
  comme une instruction certaine à une intersection.
- Les waypoints ou POI nommés réellement associés à la trace apparaissent comme prochain
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
