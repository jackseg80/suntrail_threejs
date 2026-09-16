# SunTrail — Guide IA (version source 5.91.0)

> Point d'entrée obligatoire pour les agents IA. Mis à jour le 2026-09-16 après la refonte du
> profil de pente et le cadrage adaptatif des tracés 5.91.0.

## État vérifié

- Version npm : `5.91.0`.
- Android : `versionName 5.91.0`, `versionCode 913`, minSdk 24, compile/target SDK 36. Le code 913
  est supérieur au dernier code local connu ; le maximum effectif dans Play Console reste à vérifier
  avant tout upload.
- Révision courante `5.91.0` (code 913) : profil de pente en bandes de couleur façon Openrunner
  (échelle unique montée/descente), cadrage caméra adapté aux dimensions réelles du tracé et relance
  automatique de l'analyse solaire du parcours dès que le relief devient disponible. La release
  GitHub `v5.91.0` produit l'AAB signé par la CI ; aucun upload Play n'est revendiqué.
- Les releases GitHub `v5.90.0` (code 911) et la préparation locale `5.90.1` (code 912) précèdent
  cette révision ; 912 n'a pas été publiée. La qualification S23/A53 reste la référence terrain.
- 5.86.0/904 est importée dans Play, 5.86.1/905 y est visible et le propriétaire a indiqué un
  envoi de 5.86.2/906 en test. 5.87.0/907 est publiée sur GitHub sans upload Play revendiqué.
- Le contrôle long de 30 minutes en faible réseau reste un suivi post-release, pas une fonction
  manquante ni une preuve déjà acquise.

Aucun commit, tag, push, release, upload Play, déploiement ou installation sur appareil n'est
implicite. Chacune de ces actions demande une autorisation explicite distincte. Une validation
locale n'autorise jamais une publication.

## Produit actuel

SunTrail est une application de randonnée mobile-first fondée sur Three.js/WebGL et Capacitor.
Android est la plateforme terrain principale ; le Web sert aussi à explorer, préparer et analyser.
Aucun compte n'est requis dans la version actuelle.

Le parcours produit est : **explorer → préparer → sauvegarder → vérifier → suivre → enregistrer**.

### Fonctions actives

- carte 2D/3D, LOD 5 à 18, sources par pays et replis mondiaux ;
- relief, pentes, hydrologie, végétation, bâtiments, POI et sentiers selon les données disponibles ;
- ombres solaires, timeline, sonde et analyse de l'exposition d'un parcours ;
- météo Open-Meteo et particules pluie/neige ;
- planification ORS avec repli OSRM, waypoints, profil, effort, difficulté et durée ;
- `PreparedRouteV1` et `RouteRepository` pour les itinéraires locaux ;
- `StoredTrackV1` et `TrackRepository` pour les imports/REC pleine fidélité ;
- Bibliothèque unique « Mes parcours » et Sortie contextuelle ;
- guidage TypeScript sur le Web et service natif Java/Room sur Android ;
- REC, guidage ou mode combiné dans le processus Android `:tracking` ;
- readiness en cinq sections, zones hors ligne, corridors de route et packs PMTiles ;
- français, anglais, allemand et italien.

La référence exhaustive est [docs/FEATURES.md](docs/FEATURES.md). Ne pas utiliser
`docs/archives/FEATURES.md`, qui décrit la version 5.53.2.

### Navigation visible

La barre contient cinq destinations : Explorer, Préparer, Sortie, Bibliothèque et Plus.
`data-tab="track"` reste l'adaptateur historique de Sortie ; Bibliothèque ouvre le même
`TrackSheet` avec une vue catalogue. Aucun catalogue n'est rendu dans Sortie.

Préparer possède un brouillon nommé. En mode `state.isRoutePlanningMode`, un appui long de 500 ms
ajoute un point et le toucher court reste consacré à la carte. Le bandeau donne accès à Suivre,
Enregistrer, Points, Profil altimétrique et Configuration ; les points se gèrent dans un panneau
dédié. Remplacer un brouillon modifié demande Sauvegarder, Remplacer ou Annuler.

### Guidage et REC

- `guidanceForeground=true` active le moteur et l'interface essentiels.
- `nativeGuidance=true` est le défaut actuel sur Android : matcher Java, Room v2, notification,
  écran éteint et reprise après destruction de la WebView/processus principal.
- Hors Android, ou si le natif est désactivé, le moteur TypeScript dépend du maintien de la page
  active par le navigateur.
- REC et Guidance sont indépendants mais partagent une seule source GPS native en mode combiné.
- Aucune instruction vocale ni aucun recalcul réseau automatique n'est livré.
- STOP REC archive durablement le lot natif final avant acquittement/nettoyage.

### Stockage

- `localStorage` / Preferences : réglages et petits états ;
- IndexedDB `suntrail-prepared-routes` : itinéraires préparés ;
- IndexedDB `suntrail-tracks` : archives REC/import en chunks atomiques ;
- Room v2 : session native REC/Guidance et points GPS ;
- IndexedDB `suntrail-route-corridors` + CacheStorage : manifestes et ressources de corridor ;
- OPFS/PMTiles : packs pays ;
- Workbox : shell PWA, distinct des cartes et données utilisateur.

L'historique legacy de cinq traces `localStorage` est une source de migration copy-first en lecture
seule ; ce n'est plus la capacité de la Bibliothèque.

### Hors ligne et readiness

Le rapport avant départ conserve cinq sections indépendantes : route, lumière, offline,
conditions et appareil. Il n'existe pas de score global. Une information absente reste `unknown`.

Le corridor Free est remplaçable et large de 1 km ; Pro peut conserver plusieurs corridors et
choisir 0,5/1/2 km. Une zone manuelle Free et un corridor Free sont deux objets distincts. Aucun
téléchargement automatique n'est lancé sur réseau mobile. « Installé » ou une bbox ne prouvent pas
la couverture : la lecture locale réelle fait foi.

### Performance 5.88–5.89

La version 5.88 stabilise le suivi caméra 3D lorsque l'altitude manque pendant un remplacement,
allège réellement la 2D, fiabilise cache/transitions/préchargement et corrige STOP REC ainsi que les
animations cachées. Les contrôles A53/S23 et la comparaison S23/Garmin sont consignés dans
`CHANGELOG.md` et les dossiers locaux `outputs/v5.88-*`.

La 5.89 retire le relief du chemin critique 2D au LOD 14, réutilise la texture couleur lors du
passage en 3D et borne cache/préchargement selon le preset. Sur A53 Équilibré avec couleur OPFS, la
médiane de première soumission passe de 1 074,4 à 253,6 ms. Les essais réels A53/S23 rapportés par
le propriétaire sont positifs ; un contrôle court S7/Android 8 rend aussi la 3D sans le plantage
antérieur. Cela attribue le défaut au pipeline de ressources, pas à une limite WebGL démontrée.

Les mesures sont bornées : le p95 du scénario de rebond A53 passe de 109,4 à 23,8 ms et les
transitions S23 contrôlées d'environ 16–17 s à 0,9 s. Cela ne prouve ni un gain GPU universel ni une
autonomie globale. Ne transformer aucune fenêtre courte en promesse produit.

## Flags et monétisation

Les flags de release et les droits Pro sont séparés.

Valeurs de build dans `releaseFlags.ts` :

| Flag | Défaut |
| :--- | :---: |
| `preparedRoutes` | activé |
| `guidanceForeground` | activé |
| `routeReadiness` | activé |
| `routeCorridor` | activé |
| `nativeGuidance` | activé |
| `accountSync` | désactivé |
| `expertWorkbench` | désactivé |

Contrat Free/Pro actuel :

- LOD 14 Free, LOD 18 Pro ;
- solaire du jour courant Free, calendrier Pro ;
- REC, nom, résumé, archives locales et guidage essentiel Free ;
- export fichier GPX et multi-affichage jusqu'à 10 calques Pro ;
- une zone manuelle et un corridor 1 km Free ; zones/corridors multiples Pro ;
- satellite, météo détaillée et inclinomètre Pro ;
- aucune suppression/simplification d'archive au downgrade.

Voir [docs/MONETIZATION.md](docs/MONETIZATION.md). Le compte/sync reste différé et hors du produit
courant, même si des pages ou dépendances de préparation existent. La replanification du
2026-09-08 n'engage plus de numéro pour ce lot.

## Sources et packs

`tileSources.ts` configure swisstopo (CH), IGN (FR), basemap.at (AT), BKG (DE), IGN España (ES)
et Kartverket (NO), avec OpenTopoMap/MapTiler/OSM en repli. L'Italie utilise le repli mondial.

Le catalogue embarqué `packCatalog.ts` contient trois packs :

- `switzerland`, 664 MB, LOD 8–14 ;
- `france_alps`, 515 MB, LOD 8–14 ;
- `austria`, 985 MB, LOD 8–14.

Un catalogue distant peut remplacer cette liste. Toujours lire les métadonnées runtime avant de
présenter un pack comme disponible.

Pour construire un pack :

1. modifier `PACKS` dans `scripts/build-country-pack.ts` ;
2. lancer `npx tsx scripts/build-country-pack.ts --pack <id> --maptiler-key <key> --clean` ;
3. contrôler l'archive ;
4. demander une autorisation distincte avant tout upload R2 ;
5. mettre à jour le catalogue et les quatre locales.

## Architecture et documentation

Jalon clôturé localement : [v5.89 — évaluation cartographique](docs/plans/V5_89_MAP_ARCHITECTURE_EVALUATION.md).
La décision est de conserver Three.js/WebGL et de poursuivre les fonctions en 5.90+. La
reconstruction du pack Suisse v4 reste séparée. Une future 6.0 correspondra à un saut d'expérience
démontré, avec ou sans WebGPU.

Ordre de lecture conseillé :

1. [docs/README.md](docs/README.md) ;
2. [docs/FEATURES.md](docs/FEATURES.md) ;
3. [docs/AI_ARCHITECTURE.md](docs/AI_ARCHITECTURE.md) ;
4. le document du domaine modifié ;
5. [TODO.md](TODO.md), [ROADMAP.md](ROADMAP.md) et [CHANGELOG.md](CHANGELOG.md) si la version ou
   la planification sont concernées.

Documents techniques principaux :

- rendu et batterie : [docs/AI_PERFORMANCE.md](docs/AI_PERFORMANCE.md) ;
- navigation et UI : [docs/AI_NAVIGATION_UX.md](docs/AI_NAVIGATION_UX.md) et
  [docs/AI_UI_STYLE_GUIDE.md](docs/AI_UI_STYLE_GUIDE.md) ;
- guidage : [docs/GUIDANCE_ANDROID.md](docs/GUIDANCE_ANDROID.md) et
  [docs/GUIDANCE_FOREGROUND.md](docs/GUIDANCE_FOREGROUND.md) ;
- traces : [docs/TRACK_STORAGE.md](docs/TRACK_STORAGE.md) ;
- readiness/offline : [docs/READINESS_OFFLINE.md](docs/READINESS_OFFLINE.md) ;
- Android : [docs/ANDROID_LINT.md](docs/ANDROID_LINT.md) ;
- publication : [docs/RELEASE.md](docs/RELEASE.md) ;
- débogage : [docs/AI_DEBUGGING.md](docs/AI_DEBUGGING.md).

`docs/archives/` est historique. Les plans et prompts versionnés décrivent leur propre lot et ne
doivent pas être généralisés à l'état actuel.

## Règles de travail

1. Inspecter `git status` et préserver toutes les modifications qui ne concernent pas la tâche.
2. Ne jamais supprimer une donnée utilisateur, un cache terrain ou une session native pour
   simplifier un test sans autorisation explicite.
3. Séparer preuve automatisée, mesure appareil, témoignage utilisateur et hypothèse.
4. Sur Windows, écrire en UTF-8 sans BOM ; éviter les commandes PowerShell qui réencodent les
   fichiers Android.
5. Après un changement de code : `npm run check`, `npm test`, puis les contrôles ciblés adaptés.
6. Après un changement de texte visible : modifier les quatre locales et lancer
   `npm run audit:i18n`.
7. Pour Android, `npm run cap:sync` reconstruit d'abord avec une base relative et contrôle les
   assets. Une sync ou un build n'autorise aucune installation/publication.

## Protocole de release

1. Vérifier le worktree, les versions npm/Android et le maximum Play réellement consommé.
2. Exécuter `npm run check`, `npm test`, le build, le budget bundle, l'audit i18n, les E2E adaptés,
   `cap:sync` et les contrôles Gradle requis.
3. Mettre à jour `CHANGELOG.md`, `TODO.md`, `ROADMAP.md` si nécessaire, `CLAUDE.md`, `GEMINI.md`,
   `README.md`/`docs/FEATURES.md` si la promesse change, ainsi que les versions npm/Android.
4. Faire valider sur appareil selon le risque et consigner précisément ce qui est prouvé.
5. S'arrêter avant chaque effet externe : commit, tag, push, release GitHub, upload Play et
   déploiement nécessitent chacun leur autorisation explicite.

## Calculs et précision

- distance : Haversine ;
- D+/D- : hystérésis 5 m ;
- lissage : moyenne mobile 5 points ;
- épaisseur GPX : adaptation exponentielle au zoom ;
- deep sleep : cadence très réduite après inactivité, avec réveil sur interaction/session.
