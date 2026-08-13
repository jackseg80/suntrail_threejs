# Readiness et corridor hors ligne v5.86

> État au 2026-08-13 : premier lot local implémenté. Le corridor, sa couverture mesurée et les
> enrichissements réseau/appareil restent à réaliser. v5.85.1 reste en validation séparée.

## Contrat du rapport

`src/modules/readiness/routeReadiness.ts` construit un `RouteReadinessReport` déterministe à
partir d'une `PreparedRouteV1`, sans modifier ni republier ce contrat. Le rapport conserve cinq
sections indépendantes :

| Section | Source du premier lot | Comportement |
| :--- | :--- | :--- |
| `route` | `PreparedRouteV1.stats` | Toujours local ; distance, D+/D-, durée, effort, difficulté et qualité de guidage. |
| `light` | Résumé SunCalc persisté dans la route | Disponible seulement si une heure de départ et les dates calculées existent. |
| `offline` | futur index corridor/pack | `unknown` tant qu'un index n'a pas compté les tuiles requises et présentes. |
| `conditions` | futur enrichissement réseau | `unknown` sans requête ; n'empêche jamais le rapport ni le guidage. |
| `device` | futur bridge Android | `unknown` hors preuve explicite fournie par l'appareil. |

Chaque section expose `available`, `stale`, `unknown` ou `error`, une source, une date et des
signaux `info`, `warning` ou `critical`. Il n'existe pas de score global : une donnée inconnue
n'est jamais transformée en conclusion sûre.

Le flag `routeReadiness` active le rendu compact dans la bibliothèque. Le bouton de démarrage du
guidage reste indépendant ; les enrichissements absents ne le désactivent pas.

## Responsabilités de stockage

Le corridor doit prolonger les stockages existants, sans cache parallèle :

| Stockage | Responsabilité |
| :--- | :--- |
| Service Worker / Workbox | Shell PWA et assets versionnés. |
| CacheStorage normal | Cache réseau opportuniste. |
| `suntrail-offline-zones` | Tuiles demandées explicitement pour zones et futurs corridors. |
| OPFS / PMTiles | Packs pays volumineux. |
| IndexedDB | Routes, futur index de couverture et état des téléchargements. |

Une bbox de zone, un état `installed` ou la présence d'un cache ne suffit pas à annoncer une
couverture complète. Le prochain lot doit calculer la liste de tuiles du corridor, vérifier chaque
ressource réutilisable (pack/cache), conserver le total requis et mesurer la couverture réelle.

## Invariants pour les lots suivants

- géométrie du corridor dérivée uniquement de la route ; aucune dépendance météo ou sync ;
- une zone manuelle Free et un corridor Free de 1 km restent deux objets distincts ;
- remplacement Free confirmé et limité à l'ancien corridor, sans purge silencieuse d'une route ;
- absence d'auto-téléchargement sur réseau mobile ;
- progression, reprise, annulation, intégrité, quota et couverture partielle explicites ;
- suivi de la géométrie possible sans fond de carte, avec avertissement.

## Validation

Le premier lot est couvert par des tests à horloge fixée pour les données locales, les états
`unknown`, l'arrivée après la nuit, la fraîcheur et l'isolation d'une erreur réseau. Les tests
appareil, le mode avion avec corridor et la couverture réelle ne sont pas encore réalisés.
