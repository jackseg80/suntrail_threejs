# SunTrail v5.85 — Guidage Android natif

> État au 2026-08-13 : pré-release GitHub interne avec correctifs terrain, flag `nativeGuidance`
> désactivé par défaut.
> L'instrumentation Galaxy S23/API 36 est verte (5/5) ; la clôture reste bloquée par API 24/33,
> les validations terrain A53/S23 et les sorties longues.

## Architecture et invariants

`RecordingService`, dans le processus `:tracking`, orchestre trois modes : `recording`,
`guidance` et `both`. Il conserve une unique souscription `FusedLocationProviderClient` et un
seul `WakeLock`. Un point `gps_points` n'est écrit que lorsque REC est actif ; Guidance consomme
la même position en mémoire et ne crée aucune seconde écriture GPS.

Les anciennes méthodes du plugin Capacitor restent recording-only. Les actions nouvelles
`START/STOP/PAUSE/RESUME_GUIDANCE`, `STOP_RECORDING` et `STOP_ALL` sont indépendantes : arrêter
Guidance ne ferme pas REC, arrêter REC ne ferme pas Guidance. La WebView ne calcule pas le
guidage natif ; elle affiche les `GuidanceSnapshot` diffusés par le service.

Le chemin v5.84 TypeScript reste intact et est utilisé hors Android ou lorsque
`nativeGuidance=false`. Ce flag de release est distinct des droits Free/Pro.

## Copie de route et Room

Room passe de v1 à v2 par migration additive, sans modifier `gps_points` :

- `active_guidance_route` contient la copie défensive de `routeId`, géométrie, cues, empreinte
  et allure ;
- `guidance_session` contient le mode, le snapshot et l'état interne minimal du matcher ;
- le schéma v2 est exporté dans `android/app/schemas/` et la migration v1→v2 est testée contre
  une vraie base v1 contenant un point REC.

Le bridge valide 2 à 100 000 points, bornes latitude/longitude, valeurs finies, types/source/
confiance des cues et allure positive. Il sérialise une nouvelle copie JSON : la
`PreparedRouteV1` IndexedDB n'est jamais mutée. Une route absente ou corrompue échoue fermée,
la session native est nettoyée et REC reste actif s'il l'était. Supprimer la PreparedRoute
active arrête d'abord Guidance.

La session et la route permettent la reprise après destruction de la WebView ou du processus
principal. Après redémarrage de `:tracking`, l'état non terminal reprend avec `recovered` ; les
états `paused` et `arrived` sont conservés. `START_STICKY` n'est utilisé que tant qu'un mode est
actif. Un miroir minimal en `SharedPreferences` sert uniquement à décider la reprise ; Room
reste la source de vérité détaillée.

À la réouverture de la WebView, la route relue dans IndexedDB est aussi recréée comme calque
`prepared-*` sur la carte. Ce calque éphémère est nécessaire au tracé et au bouton Profil ; il ne
modifie ni la `PreparedRouteV1` ni la copie native Room. La restauration passe par le même chemin
que l'ouverture normale d'une route sauvegardée et annule le timer de recalcul A/B, y compris sa
course en microtâche : la géométrie, la distance et les statistiques persistées restent exactes.

## Matcher Java et parité v5.84

`guidance/GuidanceEngine.java` est un port pur Java du moteur v5.84 :

1. projection locale métrique de chaque échantillon sur tous les segments ;
2. choix par cross-track et pénalité de continuité (progression attendue, recul maximal,
   fenêtre avant, distance de segments) ;
3. progression monotone, restant, ETA selon l'allure, bearing vers look-ahead ou retour direct ;
4. rejet des positions trop anciennes, trop imprécises ou physiquement impossibles ;
5. machine d'état `idle`, `acquiring`, `onRoute`, `offRoute`, `recovered`, `arrived`, `paused`.

Le golden `guidance-parity-v5.84.json` est généré par le moteur TypeScript non modifié via
`scripts/generate-guidance-parity.ts`. JUnit rejoue les neuf fixtures partagées (droite, boucle,
aller-retour, épingles, croisement, bruit, saut, récupération, arrivée) et compare chaque sample :
état, progression, restant, cross-track, bearing, acceptation et événements. Tolérances :
**0,02 m** et **0,02°** ; états/événements/acceptation sont strictement égaux.

## Seuils centralisés

La source Java est `GuidanceThresholds.java`; elle doit évoluer avec une fixture et le golden :

| Seuil                 |                    Valeur | Rôle                                    |
| --------------------- | ------------------------: | --------------------------------------- |
| accuracy max          |                      60 m | au-delà : `acquiring`, sans alerte      |
| position stale        |                      15 s | position refusée, progression inchangée |
| bons samples          |                         2 | acquisition avant `onRoute`             |
| hors-route            | max(40 m, 1,5 × accuracy) | seuil dynamique                         |
| maintien hors-route   |                      20 s | évite les alertes brèves                |
| récupération          |  0,6 × seuil pendant 10 s | hystérésis                              |
| affichage `recovered` |                       5 s | état transitoire visible                |
| cooldown alerte       |                     120 s | pas de répétition agressive             |
| arrivée               |         25 m pendant 10 s | confirmation finale                     |
| recul max             |                      35 m | continuité de progression               |
| recherche avant       |                     600 m | boucles/lacets/croisements              |
| vitesse plausible     |                    12 m/s | rejet des sauts GPS                     |
| base saut GPS         |                     250 m | tolérance fixe minimale                 |
| look-ahead            |                      35 m | bearing de route                        |
| cue passée            |                      12 m | sélection de la prochaine indication    |

## Snapshot et bridge

Le contrat partagé contient `routeId`, `status`, `progressMeters`, `remainingMeters`,
`crossTrackMeters`, `eta`, `bearing`, `nextCue`, `distanceToNextCueMeters`, `accuracyMeters`,
`positionAgeMs` et `updatedAt`. Les événements sont `off-route`, `recovered`, `arrived`.
`onLocationUpdate` alimente la carte avec le même fix Fused, sans matcher WebView parallèle.

Le marqueur cartographique complète le point rouge par une flèche purement visuelle. Au-dessus de
**0,55 m/s**, elle privilégie `coords.heading`, donc le cap de déplacement GPS ; à faible vitesse,
elle utilise le cap absolu lissé du téléphone. Sans cap fini, elle est masquée. Ce seuil est partagé
avec l'entrée du suivi caméra et ne modifie ni le matcher Java ni les écritures REC. Le rail droit
contenant le bouton de position reste visible pendant l'auto-masquage d'inactivité ; seul un geste
de déplacement de carte peut encore le masquer temporairement.

## Foreground, notification et permissions

Le service est déclaré `foregroundServiceType="location"`, `stopWithTask="false"`, dans
`:tracking`, avec `ACCESS_COARSE/FINE_LOCATION`, `FOREGROUND_SERVICE(_LOCATION)`,
`POST_NOTIFICATIONS`, `WAKE_LOCK` et l'exemption batterie déjà opt-in. Il doit être démarré par
l'activité visible ; seul un redémarrage système d'une session déjà autorisée utilise la voie de
récupération.

La notification persistante indique mode, restant/état, REC et incident. Ses actions sont sûres :
pause/reprise Guidance, arrêt Guidance, arrêt REC. Une alerte séparée, vibrante et non vocale,
signale hors-route/arrivée. Aucune voix turn-by-turn ni recalcul réseau n'est introduit.

## Dégradations contrôlées

- GPS coupé / mode avion : incident `gps-disabled`, position vieillissante puis `acquiring` ;
  la session reste active et reprend après retour du provider.
- Permission retirée : détection au tick, arrêt de la souscription Fused, incident
  `permission-denied`, aucune progression ; reprise après permission et relance sûre.
- Position stale / accuracy > 60 m / saut : rejet sans alerte hors-route.
- Route supprimée/corrompue : arrêt Guidance et nettoyage Room ; REC indépendant préservé.
- Stockage plein : incident `storage-full`, REC est arrêté pour éviter une fausse conservation ;
  Guidance continue en mémoire avec notification, sans boucle d'écriture Room.
- Écran éteint, swipe-away, WebView/processus principal tué : service `:tracking`, notification,
  WakeLock et Room maintiennent/reprennent la session ; preuves physiques encore requises.

Les validations physiques et leurs gates sont définies dans
[`V5_85_A53_S23_FIELD_VALIDATION.md`](plans/V5_85_A53_S23_FIELD_VALIDATION.md).
