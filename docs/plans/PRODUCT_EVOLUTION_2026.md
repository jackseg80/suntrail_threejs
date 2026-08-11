# SunTrail — Plan d'évolution produit révisé v5.82 → v6.1

> Autorité d'exécution de la [roadmap](../../ROADMAP.md).
> Révision : 2026-08-11 après clôture du jalon foreground.
> v5.83.3 / Android 901 reste la dernière release corrective publique. v5.84.0 / Android 902 est
> clôturée comme pré-release GitHub interne après validation Galaxy S23 et gates ; aucun
> téléversement Play Console et aucune v5.85 n'est démarrée.

## 1. Ordre de réalisation

```text
v5.82 validation terrain S23 + publication ✓
   ↓
v5.83 planifier + évaluer + sauvegarder localement ✓
   ↓
v5.84 valider le moteur de suivi en interne/fermé
   ↓
v5.85 livrer le guidage Android natif robuste
   ↓
v5.86 vérifier le départ + télécharger le corridor
   ↓
v6.0 compte optionnel + synchronisation
   ↓
v6.1 outils experts + finition professionnelle
```

Chaque version a une valeur autonome. La synchronisation est un confort et ne bloque plus le
suivi local. v5.84 est un jalon technique non promu publiquement ; v5.85 porte la première
promesse complète de guidage Android et traite le risque natif avant le cloud.

## 2. Référence de qualité

| Dimension | Attendu |
|---|---|
| Débutant | Une action principale, vocabulaire randonnée, état vide utile, récupération claire |
| Préparation | A/B explicites, sauvegarde, difficulté/effort, ETA et marge de jour visibles |
| Terrain | Gros contrôles, contraste soleil, GPS/fraîcheur visibles, aucune paywall |
| Offline | Couverture mesurée, téléchargement repris, état obsolète et quota compréhensibles |
| Expert | Même modèle de route, détails repliables, variantes/comparaisons sans perte |
| Confiance | Sources, fraîcheur, inconnues et limites affichées ; aucun faux score rassurant |

SuisseMobile sert de référence pour la sobriété, la carte officielle, la préparation et la
continuité web/app. AllTrails sert de référence pour l'état avant départ, le suivi et les alertes.
Komoot et Garmin servent de référence pour la prochaine indication, la distance au prochain
point utile, le hors-trace et la sobriété de l'écran terrain. SunTrail doit se différencier par
le relief 3D, le soleil projeté et l'heure de passage.

## 3. Contrats

### Domaine local v5.83

> Implémenté dans le worktree le 2026-08-09 avec le contrat ci-dessous, sans enveloppe cloud.

```ts
interface PreparedRouteV1 {
  schemaVersion: 1;
  id: string;
  name: string;
  source: 'manual' | 'gpx-import' | 'legacy-conversion';
  activityProfile: string;
  waypoints: RouteWaypoint[];
  geometry: RoutePoint[];
  stats: RouteStats;
  bounds: RouteBounds;
  plannedStartAt: string | null;
  plannedPaceKmh: number;
  favorite: boolean;
  notes: string;
  tags: string[];
  guidanceQuality: 'full' | 'approximate' | 'not-ready';
  createdAt: string;
  updatedAt: string;
}
```

`plannedStartAt` et `plannedPaceKmh` sont des données métier : elles alimentent ETA et soleil.
`syncState`, révision distante, curseur et tombstone n'appartiennent pas à ce contrat.

Le contrat d’écran v5.83 distingue trois rôles sans introduire le guidage :

- `routeWaypoints` + `routeComputation` forment l’unique route en préparation et alimentent
  exclusivement le bandeau Préparer ;
- `activeGPXLayerId` désigne la trace consultée pour le profil, la pente, la visibilité et le
  cadrage, sans remplacer automatiquement la route en préparation ;
- `recordedPoints` reste la source indépendante du REC et conserve la priorité dans les
  statistiques de Sortie pendant l’enregistrement.

Le passage consultation → préparation est explicite. Tout brouillon modifié est protégé par
Sauvegarder / Remplacer / Annuler. La Bibliothèque compte uniquement les calques réellement
affichés ; une route IndexedDB fermée n’est pas chargée ni rendue sur la carte.

### Sync v6.0

```ts
interface RouteSyncEnvelope {
  routeId: string;
  remoteRevision: number | null;
  state: 'local' | 'dirty' | 'synced' | 'conflict' | 'read-only';
  remoteUpdatedAt: string | null;
  deletedAt: string | null;
}
```

Le repository local reste la source d'usage. Le sync service échange des snapshots et ne
laisse jamais l'UI parler directement à Supabase.

### Readiness v5.86

Le rapport est composé de sections indépendantes :

- `route`: local, toujours disponible ;
- `light`: calcul local si données solaires disponibles ;
- `offline`: calcul local depuis géométrie et index de cache ;
- `conditions`: réseau, optionnel, daté ;
- `device`: Android, optionnel.

Chaque section a `status: available | stale | unknown | error`, `computedAt`, `source` et des
signaux `info | warning | critical`. Une section inconnue ne bloque pas les autres.

### Guidage v5.84/v5.85

```ts
interface GuidanceCueV1 {
  id: string;
  kind: 'depart' | 'continue' | 'slight-left' | 'left' | 'sharp-left' |
    'slight-right' | 'right' | 'sharp-right' | 'u-turn' | 'arrive' | 'waypoint' | 'poi';
  progressMeters: number;
  label: string | null;
  source: 'ors' | 'osrm' | 'gpx-waypoint' | 'manual' | 'geometry-derived';
  confidence: 'routed' | 'declared' | 'derived';
}

interface GuidancePlanV1 {
  schemaVersion: 1;
  routeId: string;
  geometryFingerprint: string;
  cues: GuidanceCueV1[];
  createdAt: string;
}

interface GuidanceSnapshot {
  routeId: string;
  status: 'idle' | 'acquiring' | 'onRoute' | 'offRoute' | 'recovered' | 'arrived' | 'paused';
  progressMeters: number;
  remainingMeters: number;
  crossTrackMeters: number;
  eta: string | null;
  bearing: number | null;
  nextCue: GuidanceCueV1 | null;
  distanceToNextCueMeters: number | null;
  accuracyMeters: number | null;
  positionAgeMs: number | null;
  updatedAt: string;
}
```

`GuidancePlanV1` est un artefact local dérivé et stocké à côté de `PreparedRouteV1`, sans modifier
son contrat v1. Il est invalidé si l'empreinte de géométrie change et peut être régénéré. La
migration IndexedDB est additive et les routes v5.83 sans plan restent lisibles.

Les étapes ORS (`segments.steps`) sont conservées avec leurs types de manœuvre ; les étapes OSRM
peuvent servir de fallback lorsqu'elles existent. Un GPX `trk` standard ne porte que la géométrie :
ses `wpt`/`rtept` nommés ne deviennent des cues que s'ils sont spatialement associés à la trace.
Une cue déduite du seul angle est `geometry-derived`/`derived`, filtrée pour éviter courbes et
lacets, et formulée « changement de direction approximatif », jamais comme une intersection
certaine. Aucune cue fiable n'est inventée si les données ne le permettent pas.

v5.84 calcule en TypeScript au premier plan sur un track interne/fermé et affiche la prochaine
indication avec sa distance. v5.85 porte la source de vérité dans le service Android et conserve
les mêmes fixtures/payloads avant publication. FIT Course et TCX peuvent transporter des points
de parcours plus riches, mais leurs imports, la voix, la liste « Up Ahead » complète et le
recalcul réseau sont différés afin de ne pas diluer la validation du matcher v5.84.

## 4. Décisions Free / Pro

Toujours gratuit :

- préparation et bibliothèque locale selon stockage appareil ;
- un tracé importé actif sur la carte ;
- suivi essentiel, alertes hors trace et REC ;
- avertissements de sécurité ;
- une zone manuelle existante et un corridor actif de 1 km remplaçable ;
- cinq routes cloud choisies en écriture après v6.0.

Pro :

- multi-affichage de traces ;
- plusieurs corridors et largeurs 0,5/1/2 km ;
- cloud illimité ;
- calendrier/analyses solaires détaillées, comparaisons et organisation avancée.

Downgrade : aucune suppression cloud. Le surplus reste lisible/téléchargeable et toute
modification locale reste locale jusqu'à disponibilité d'un slot.

## 5. Difficulté, effort et informations pratiques

- ORS `foot-hiking` doit demander `traildifficulty`, `steepness`, `surface` et `waytype`.
- La difficulté technique affiche le niveau fourni et le pourcentage couvert.
- OSRM ou donnée absente → difficulté inconnue, pas de T1–T6 inventé.
- L'effort est séparé, calculé depuis distance/D+/durée avec seuils documentés et testés.
- v5.86 ajoute, si disponibles, parking/transports, eau/refuges et équipement conseillé ;
  toutes ces informations indiquent source, couverture et fraîcheur.

## 6. Stockage et tests IndexedDB

- `RouteRepository` dépend d'une interface de stockage et reçoit `IDBFactory`.
- `fake-indexeddb` est une dépendance de développement pour les unitaires.
- Nouvelle factory par test, tests d'upgrade, transactions, concurrence, corruption et erreur.
- Playwright Chromium teste la vraie IndexedDB, reload et persistance.
- Le legacy localStorage reste lisible ; aucune migration destructive.
- Une entrée legacy simplifiée se convertit explicitement avec qualité `approximate` et ne
  devient pas silencieusement une route de guidage fiable.

## 7. Offline : responsabilités

| Stockage | Responsabilité |
|---|---|
| Service Worker/Workbox | shell PWA et assets versionnés |
| CacheStorage normal | cache réseau opportuniste |
| CacheStorage offline | zone manuelle et corridor explicites |
| OPFS/PMTiles | packs pays volumineux |
| IndexedDB | routes, index/métadonnées et état des téléchargements |

Un service de quota expose taille estimée, taille réelle, dernière utilisation et suppression.
Le corridor ne duplique pas silencieusement une tuile déjà couverte par un pack.

## 8. Identité et RevenueCat

- OAuth Google Android : Authorization Code + PKCE et deep link custom scheme.
- Magic link : même callback et reprise documentée.
- Secrets exclus du dépôt ; SHA Play signing et redirects documentés par environnement.
- Android : `Purchases.logIn(Supabase UID)`, comparaison `CustomerInfo` avant/après et restore.
- Web : liaison/restauration dédiée ; ne pas utiliser l'e-mail comme App User ID.
- E2E : achat anonyme, login, autre appareil, logout, relogin, changement de compte et suppression.
- La configuration RevenueCat « transfer behavior » est un prérequis contrôlé, pas une hypothèse.

## 9. Release flags

Créer avant v5.83 un registre séparé de `featureFlags.ts` :

- valeurs sûres build-time ;
- overrides distants versionnés avec TTL et last-known-good ;
- override développeur local ;
- journal du motif de désactivation ;
- aucun contrôle de sécurité ou entitlement via ces flags.

Flags prévus : `preparedRoutes`, `guidanceForeground`, `routeReadiness`, `routeCorridor`,
`accountSync`, `nativeGuidance`, `expertWorkbench`.

## 10. Accessibilité et analytics

Le canvas reste visuel. L'équivalent accessible comprend recherche départ/arrivée, liste de
waypoints, actions déplacer/supprimer/inverser et résumé textuel du parcours. Les tests couvrent
clavier, focus, lecteur d'écran sur panneaux et reduced motion.

Mesure UX : E2E chronométré et sessions de test utilisateur avant télémétrie. Toute télémétrie
future est opt-in, agrégée, sans coordonnées/géométrie, documentée RGPD et sans SDK publicitaire.

## 11. Gates par version

Avant : `git status --short`, `npm run check`, `npm test`.

Avant remise :

```powershell
npm run check
npm test
npm run build
npm run check:bundle
npm run audit:i18n
npm run test:e2e:smoke
```

Si Android est touché : `npm run cap:sync`, Gradle `test`/`lint` et instrumentation ciblée.
Les tests échoués ou non exécutés sont des gates rouges, jamais des notes secondaires.

Guidage v5.85 : API 24/33/36, A53 et S23 physiques, mode avion, écran éteint, swipe-away,
permission refusée et GPS bruité. Mesurer trois runs REC-only puis guidance+REC d'une heure ;
cible initiale ≤ +1 point de batterie/heure sur A53.

## 12. Hotfix et compatibilité

- P0/P1 suspend la prochaine version.
- Hotfix `x.y.z` depuis le dernier tag publié, sans fonctions futures.
- Report ciblé dans le worktree suivant ; pas de reset destructif.
- Migrations additives et compatibilité du client précédent au moins une release.
- Couper le release flag avant rollback binaire lorsque possible.
- Commit/tag/push uniquement après accord explicite.

## 13. Discussions à ouvrir

1. [Clôturer le terrain et publier v5.82](prompts/V5_82_FIELD_RELEASE.md)
2. [v5.83 planifier/sauvegarder](prompts/V5_83_PREPARED_ROUTES.md)
3. [v5.84 moteur de suivi interne](prompts/V5_84_GUIDANCE_MVP.md)
4. [v5.85 guidage natif](prompts/V5_85_ANDROID_GUIDANCE.md)
5. [v5.86 readiness/offline](prompts/V5_86_READINESS_OFFLINE.md)
6. [v6.0 compte/sync](prompts/V6_0_ACCOUNT_SYNC.md)
7. [v6.1 power user](prompts/V6_1_POWER_USER.md)

Ne jamais démarrer la version suivante tant que le bilan de la précédente contient un gate rouge.
