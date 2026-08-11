# SunTrail v5.84 — Moteur de suivi au premier plan

> Jalon interne/fermé clôturé. Le suivi fonctionne tant que l'application reste ouverte et visible.
> Il ne fournit ni notification de guidage, ni fonctionnement écran éteint, ni reprise après
> kill/swipe-away. Le REC natif conserve son comportement indépendant existant.

## Architecture

- `GuidanceEngine.ts` est TypeScript pur : aucune dépendance DOM, Three.js, Capacitor ou réseau.
- `GuidanceForegroundService.ts` orchestre l'UI, les permissions, les alertes et l'unique flux
  `state.userLocation` déjà alimenté par `location.ts` et `nativeGPSService.ts`.
- Le guidage ne lance pas de deuxième source GPS. `startLocationTracking()` est idempotent ; le
  REC peut fonctionner seul, le guidage seul ou les deux ensemble.
- `GuidancePlanV1` est stocké dans l'object store IndexedDB `guidancePlans`, séparé de
  `PreparedRouteV1`. La migration de base passe de v2 à v3 sans réécrire les routes.
- Le plan est lié par `routeId` et `geometryFingerprint`. Une empreinte différente invalide le
  plan ; il est alors régénéré sans modifier la route.

## Projection et progression

La géométrie est préparée en segments avec longueurs Haversine, distances cumulées et bearings.
Chaque position est projetée orthogonalement sur tous les segments dans un repère local
équirectangulaire. Le candidat combine :

1. distance perpendiculaire à la trace (`crossTrackMeters`) ;
2. continuité par rapport à la progression attendue ;
3. pénalité forte au-delà de 35 m en arrière ou 600 m en avant ;
4. proximité de l'index de segment précédent.

À la première acquisition, les segments à moins de 8 m du meilleur candidat sont départagés par
la plus faible progression. Cette règle évite de confondre départ et arrivée sur une boucle. La
progression publiée est monotone : le bruit, les croisements, les allers-retours et les lacets
proches ne peuvent pas la faire reculer. Un déplacement impossible est rejeté avant projection.

`remainingMeters = longueurTotale - progressMeters`. L'ETA utilise l'allure préparée de la route.
Le bearing vise un point situé 35 m en avant sur la polyligne. En état `offRoute`, il vise
directement le point projeté sur la trace : la flèche du panneau indique alors le chemin à vol
d'oiseau pour la retrouver.

## Seuils v5.84

| Seuil | Valeur | Effet |
|---|---:|---|
| Précision GPS maximale | 60 m | Au-delà : `acquiring`, aucune alerte |
| Fraîcheur maximale | 15 s | Position plus vieille : `acquiring`, aucune alerte |
| Acquisition | 2 positions valides | Passage à `onRoute` |
| Hors-trace | `max(40 m, 1,5 × accuracy)` | Seuil dynamique |
| Maintien hors-trace | 20 s | Évite une alerte sur un point isolé |
| Retour sur trace | 60 % du seuil hors-trace | Hystérésis spatiale |
| Maintien récupération | 10 s | Passage à `recovered` |
| Affichage récupération | 5 s | État transitoire lisible |
| Cooldown alerte | 120 s | Pas de répétition haptique rapprochée |
| Arrivée | 25 m pendant 10 s | Passage à `arrived` |
| Retour arrière toléré | 35 m | Protection bruit/lacets |
| Fenêtre avant | 600 m | Protection croisements/sauts |
| Vitesse plausible max | 12 m/s | Détection de saut GPS |
| Saut GPS minimum | 250 m | Rejet avant matching |
| Look-ahead | 35 m | Bearing de la direction à venir |
| Cue dépassée | 12 m | Passage à l'indication suivante |

Les positions stale, imprécises ou rejetées ne déclenchent jamais d'alerte visuelle/haptique.

## États

- `idle` : aucune session ;
- `acquiring` : attente de positions valides/fraîches ;
- `onRoute` : projection valide sous le seuil ;
- `offRoute` : seuil dépassé pendant 20 s ;
- `recovered` : retour sous 60 % du seuil pendant 10 s ;
- `arrived` : maintien dans le rayon final ;
- `paused` : progression et alertes gelées, session conservée.

## GuidancePlanV1 et indications

Les étapes ORS sont demandées avec `instructions: true` et la langue active de l'application,
puis converties depuis
`properties.segments[].steps`. OSRM est demandé avec `steps=true` et sert de fallback. Ces cues
sont `routed`. Les `wpt` et `rtept` nommés d'un GPX deviennent des cues `declared` uniquement à
moins de 50 m de la trace.

Sans cue routée, un angle géométrique peut produire une cue `geometry-derived`/`derived` : jambes
d'au moins 25 m, espacement de 80 m, angle entre 45° et 120°. Les demi-tours/lacets plus serrés
sont supprimés. L'UI dit toujours « changement de direction approximatif » et n'invente jamais
de nom de sentier.

```ts
interface GuidanceSnapshot {
  routeId: string;
  status: 'idle' | 'acquiring' | 'onRoute' | 'offRoute' | 'recovered' |
    'arrived' | 'paused';
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

## Démarrage et limites

- `guidanceQuality=full` : démarrage direct depuis une route sauvegardée.
- `approximate` : confirmation explicite avant démarrage.
- `not-ready` : refus avec demande de recalcul/réimport de la géométrie complète.
- Le panneau démarre compact. Le déplier n'active pas le suivi caméra permanent, mais effectue
  une correction ponctuelle si une position GPS existe afin de placer le point dans la zone
  visible haute.
- Le suivi caméra est déclenché explicitement avec **Recentrer**. La position est alors conservée
  au-dessus du centre par un décalage stable lié à l'orbite, sans recentrage forcé au démarrage.
  La rotation utilise une hystérésis de cap de 12° à l'entrée et 5° à la sortie pour absorber le
  bruit du compas pendant la marche.
- Une flèche compacte indique la direction relative à l'orientation du téléphone : look-ahead
  sur la trace en situation normale, ou retour direct au segment projeté en hors-trace.
- Le chrome d'édition Préparer (résumé, réglages et barre basse) est masqué pendant la session,
  sans supprimer le brouillon ; il redevient disponible à l'arrêt.
- Les quatre commandes cartographiques (nord, GPS, couches et 2D/3D) restent accessibles dans
  un rail droit réservé. Le panneau de guidage n'occupe jamais ce rail aux largeurs mobiles
  contrôlées (360, 384 et 412 px, plus paysage 800 × 412 px).
- Le profil est une vue secondaire exclusive : le panneau de guidage se réduit temporairement
  à une bande de sécurité sur toute la largeur au-dessus du graphique. Fermer le profil restaure
  le panneau compact ou étendu sans modifier la session.
- `guidanceForeground` est un release flag, pas un entitlement. Le suivi essentiel et REC ne
  déclenchent aucune paywall pendant une session.
- Le web partage le même moteur mais dépend des garanties de géolocalisation et de maintien au
  premier plan du navigateur.
- Un watchdog réarme la boucle de rendu WebGL si Android WebView laisse l'interface active mais
  suspend la carte ; le retour natif au premier plan force également resize et nouveaux rendus.
- STOP REC depuis le panneau passe par le même arrêt central que Sortie. Les statistiques de
  notification sont coupées avant l'arrêt natif et le service Android annule explicitement toute
  notification résiduelle.

Fixtures partagées : `src/modules/guidance/fixtures/guidance-fixtures.json` (droite, boucle,
aller-retour, épingles proches, croisement, bruit, saut GPS, récupération et arrivée).

Protocole terrain : [V5_84_S23_FIELD_VALIDATION.md](plans/V5_84_S23_FIELD_VALIDATION.md).
