# Readiness et corridor hors ligne v5.86

> Clôture v5.86.0 au 2026-08-13 : readiness local, planification/mesure, téléchargement et registre
> persistant des corridors sont validés dans la Bibliothèque. Le propriétaire a validé un corridor
> Norvège après fermeture complète et relance hors connexion, avec bibliothèque et suivi jusqu'au
> LOD 14. Les enrichissements réseau/appareil restent optionnels et inconnus sans preuve ; v5.85.1
> reste en validation séparée.

## Contrat du rapport

`src/modules/readiness/routeReadiness.ts` construit un `RouteReadinessReport` déterministe à
partir d'une `PreparedRouteV1`, sans modifier ni republier ce contrat. Le rapport conserve cinq
sections indépendantes :

| Section | Source du premier lot | Comportement |
| :--- | :--- | :--- |
| `route` | `PreparedRouteV1.stats` | Toujours local ; distance, D+/D-, durée, effort, difficulté et qualité de guidage. |
| `light` | Résumé SunCalc persisté dans la route | Disponible seulement si une heure de départ et les dates calculées existent. |
| `offline` | plan corridor + cache/packs locaux | Mesure 5→14 pour le corridor Free de 1 km ; `unknown` avant la première mesure. |
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
| `suntrail-offline-zones` | Blobs demandés explicitement pour zones et corridors. |
| OPFS / PMTiles | Packs pays volumineux. |
| IndexedDB `suntrail-routes` | Contrat et bibliothèque des Prepared Routes, inchangés. |
| IndexedDB `suntrail-route-corridors` | Manifestes versionnés, état, propriété et activation des corridors. |

Une bbox de zone ou un simple état `installed` ne suffit pas à annoncer une couverture complète.
`routeCorridor.ts` intersecte chaque segment avec les tuiles du corridor, déduplique les résultats,
rejette l'antiméridien et s'arrête au-delà de 2 000 tuiles. La mesure vérifie les blobs réellement
lisibles dans PMTiles local, overview embarqué, pack OPFS, cache offline ou cache opportuniste. Une
tuile est couverte si son fond cartographique est lisible hors ligne. Le relief et les sentiers sont
des compléments de rendu : leur taille est comptée lorsqu'ils existent, mais leur absence ne masque
pas une carte utilisable, conformément au comportement du worker hors ligne.

La recherche des packs reste mondiale et data-driven : le gestionnaire de packs applique le
catalogue, les LOD et les bornes de chaque archive. La mesure ne contient aucune liste de pays et
n'utilise pas les polygones embarqués comme prérequis à la lecture d'un pack local.

La mesure est bornée à huit inspections simultanées et les routes sont traitées en série. Son cache
de cinq minutes est invalidé si la route, la source cartographique, MapTiler, les sentiers ou les
packs installés changent. Aucune requête réseau n'est effectuée.

`routeCorridorDownload.ts` construit une file dédupliquée et typée (couleur, élévation,
sentiers), puis la traite avec au plus quatre requêtes simultanées par défaut. Un blob absent est
un échec explicite et produit un résultat `partial`. L'annulation interrompt les requêtes en cours
mais conserve les ressources déjà acquises ; relancer le même plan reprend via les hits packs/cache.

`RouteCorridorInstallService` écrit un manifeste `downloading` avant le transfert, puis un état
`completed`, `partial` ou `cancelled`. En Free, un corridor actif différent impose une confirmation.
L'ancien reste actif tant que le remplaçant n'est pas complet ; l'activation et le remplacement des
manifestes sont atomiques. En Pro, plusieurs corridors peuvent rester actifs.

Le nettoyage intervient seulement après cette activation. Une ressource gérée est transférée si un
autre corridor la référence ; une tuile encore couverte par une zone manuelle est protégée. Les
ressources présentes avant le corridor, notamment celles des packs et zones existantes, ne deviennent
pas sa propriété. Un échec de nettoyage peut donc laisser un blob orphelin, mais ne peut ni désactiver
l'ancien corridor trop tôt ni casser le nouveau.

La carte de route propose le corridor Free de 1 km ou, en Pro, 0,5/1/2 km. Elle affiche la progression
et permet l'annulation. Une connexion cellulaire impose une confirmation explicite. La marge de
stockage vient de `navigator.storage.estimate()` : si elle est inconnue, aucun faux blocage n'est
créé ; si elle est inférieure à l'estimation maximale, l'utilisateur confirme en sachant que packs
et caches locaux seront réutilisés. En mode hors ligne, le moteur relit seulement les sources locales
et annonce un résultat partiel si elles ne suffisent pas.

## Invariants

- géométrie du corridor dérivée uniquement de la route ; aucune dépendance météo ou sync ;
- une zone manuelle Free et un corridor Free de 1 km restent deux objets distincts ;
- remplacement Free confirmé et limité à l'ancien corridor, sans purge silencieuse d'une route ;
- absence d'auto-téléchargement sur réseau mobile ;
- progression, reprise, annulation, intégrité, quota et couverture partielle explicites ;
- suivi de la géométrie possible sans fond de carte, avec avertissement.

## Validation

Les tests couvrent le rapport à horloge fixée, les états `unknown`, l'arrivée après la nuit, les
rayons 0,5/1/2 km, la déduplication, l'antiméridien, le plafond de volume, les caches corrompus ou
incomplets, l'exclusion des packs CDN, un pack Suisse sans préfiltre pays, un cache hors catalogue
européen, l'invalidation de contexte, la progression, les résultats partiels, l'annulation
conservatrice, l'adressage des layers d'un pack, la persistance/réouverture des manifestes, le
remplacement atomique Free, la coexistence Pro, la protection des zones manuelles, le préflight
réseau/quota et l'absence de requête en mode strictement local. Le redémarrage mode avion avec
corridor et les validations appareil restent ouverts.
