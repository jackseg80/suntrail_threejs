# Fonctionnalités actuelles de SunTrail 3D

> Référence canonique de la version source 5.91.4, mise à jour le 2026-09-17.
> Ce document décrit le code activé par défaut. Les plans futurs et anciens documents archivés ne
> constituent pas des fonctionnalités livrées.

## Parcours utilisateur

La navigation visible comporte cinq destinations :

1. **Explorer** : recherche et consultation de la carte.
2. **Préparer** : création ou modification du brouillon d'itinéraire.
3. **Sortie** : route consultée, guidage, REC et résumé de fin.
4. **Bibliothèque** : itinéraires à suivre et activités enregistrées.
5. **Plus** : cartes, météo, solaire, SOS, réglages et outils.

`data-tab="track"` reste un identifiant interne de compatibilité pour Sortie. Sortie et
Bibliothèque utilisent le même composant `TrackSheet`, avec deux responsabilités visuelles
distinctes.

Au premier lancement, la prise en main utilise deux étapes sur la carte réelle : gestes essentiels,
puis lecture du détail ou accès au bouton 2D/3D. Les explications métier restent ensuite au point
d'usage : appui long A/B dans Préparer, REC dans Sortie et premier accès Free à une fonction Pro.

## Inventaire fonctionnel

| Domaine         | Fonction actuelle                                                                                                                                                                                | Disponibilité                                                   | Référence principale                                    |
| :-------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------- | :------------------------------------------------------ |
| Carte           | Relief Three.js, bascule 2D/3D, couleur 2D prioritaire et LOD 5 à 18                                                                                                                             | Free jusqu'à 14, Pro jusqu'à 18                                 | `scene.ts`, `terrain.ts`                                |
| Sources         | Sélection par pays et replis OpenTopoMap/MapTiler/OSM                                                                                                                                            | Selon couverture et clés                                        | `tileSources.ts`                                        |
| Terrain         | Pentes, eau, végétation, bâtiments, POI et sentiers                                                                                                                                              | Données variables ; certains outils Pro                         | `terrain.ts`, `landcover.ts`, `buildings.ts`, `poi.ts`  |
| Solaire         | Données astronomiques en 2D/3D ; ombres, frise 24 h et exposition lorsque le relief est disponible                                                                                               | Jour courant Free, calendrier Pro                               | `sun.ts`, `solarRoute.ts`, `SolarProbeSheet.ts`         |
| Météo           | Conditions Open-Meteo et particules pluie/neige                                                                                                                                                  | Base Free, détails Pro                                          | `weather.ts`, `WeatherSheet.ts`                         |
| Recherche       | Lieux, adresses, sommets locaux et distants                                                                                                                                                      | Free                                                            | `geocodingService.ts`, `peaks.ts`                       |
| Préparation     | Bandeau Suivre/Enregistrer/Points/Profil/Configuration, panneau de points avec centrage, déplacement carte, réorganisation et suppression, activité, boucle, inversion et recalcul ORS puis OSRM | Free jusqu'à 25 km, Pro jusqu'à 500 km                          | `routeManager.ts`, `routingService.ts`                  |
| Itinéraires     | `PreparedRouteV1`, brouillon, sauvegarde, duplication, favoris et suppression                                                                                                                    | Local et illimité selon le stockage                             | `preparedRoutes/`, `RouteRepository.ts`                 |
| Évaluation      | Distance, D+/D-, durée, effort, difficulté et qualité de guidage                                                                                                                                 | Les données absentes restent inconnues                          | `preparedRoute.ts`, `routeDifficulty.ts`                |
| Bibliothèque    | Catalogue unique « Mes parcours »                                                                                                                                                                | Toutes les entrées restent accessibles                          | `TrackSheet.ts`, `trackCatalogAdapter.ts`               |
| Traces          | Import GPX et archive REC/import `StoredTrackV1` pleine fidélité                                                                                                                                 | Toutes conservées localement                                    | `tracks/`, `TRACK_STORAGE.md`                           |
| Affichage       | Une trace de Bibliothèque à la fois en Free ; ajout multi-carte en Pro                                                                                                                           | Maximum technique de 10 calques                                 | `gpxService.ts`, `TrackSheet.ts`                        |
| Export          | GPX dans Téléchargements Android ou via le navigateur                                                                                                                                            | Pro ; refus avant création de fichier en Free                   | `recordingService.ts`                                   |
| Guidage         | Panneau bandeau/compact/détails, indication, distance, progression, ETA, écart, profil avec retour explicite et alertes                                                                          | Essentiel Free                                                  | `guidance/`, `GUIDANCE_ANDROID.md`                      |
| REC             | Enregistrement, pause/reprise avec durée active, récapitulatif avec aperçu de trace et métriques, nom, récupération et abandon explicite                                                         | REC essentiel Free                                              | `recordingService.ts`, `RecordingService.java`          |
| Sortie combinée | Guidage et REC avec une seule source GPS native et action principale pour terminer les deux                                                                                                      | Android                                                         | `GuidanceForegroundService.ts`, `RecordingService.java` |
| Readiness       | Rapport route/lumière/offline/conditions/appareil sans score artificiel                                                                                                                          | Free                                                            | `readiness/routeReadiness.ts`                           |
| Corridor        | Planification, mesure, téléchargement, reprise, annulation et remplacement sûr                                                                                                                   | 1 km remplaçable Free ; 0,5/1/2 km et plusieurs en Pro          | `readiness/`, `READINESS_OFFLINE.md`                    |
| Zones           | Sélection visuelle et cache hors ligne                                                                                                                                                           | Une zone Free, illimité Pro                                     | `ZoneSelector.ts`, `cachedZones.ts`                     |
| Packs           | PMTiles via OPFS et catalogue local/distant                                                                                                                                                      | Suisse, Alpes françaises et Autriche dans le catalogue embarqué | `packCatalog.ts`, `packManager.ts`                      |
| Terrain Android | REC/guidage dans `:tracking`, notification, WakeLock et Room                                                                                                                                     | Android uniquement                                              | `RecordingPlugin.java`, `RecordingService.java`         |
| Outils          | Boussole, profil, inclinomètre, SOS, thème et réglages de performance                                                                                                                            | Mix Free/Pro                                                    | `ui/components/`, `performance.ts`                      |
| Langues         | Français, anglais, allemand et italien                                                                                                                                                           | Détection au premier démarrage                                  | `src/i18n/locales/`                                     |

## Différences Android/Web

- Sur **Android**, `nativeGuidance=true` utilise le matcher Java, Room, une notification
  persistante et le processus `:tracking`. Une session peut survivre à l'extinction de l'écran, à
  la destruction de la WebView et à une interruption du processus principal.
- Sur le **Web**, le moteur TypeScript fournit les mêmes calculs essentiels tant que le navigateur
  autorise la géolocalisation et maintient la page active. Il n'existe pas de promesse de suivi en
  arrière-plan, de notification native ni de reprise après fermeture du navigateur.
- Aucune plateforme ne fournit actuellement d'instructions vocales turn-by-turn ni de recalcul
  automatique de route pendant le guidage.

## Stockage actuel

| Donnée                   | Stockage                               | Remarque                                       |
| :----------------------- | :------------------------------------- | :--------------------------------------------- |
| Réglages et petits états | `localStorage` / Capacitor Preferences | Local à l'appareil                             |
| Itinéraires préparés     | IndexedDB `suntrail-prepared-routes`   | Géométrie et métadonnées versionnées           |
| Traces REC/import        | IndexedDB `suntrail-tracks`            | Géométrie complète en chunks atomiques         |
| Session terrain Android  | Room v2 dans `:tracking`               | Source de reprise REC/guidage                  |
| Corridors                | IndexedDB + CacheStorage               | Manifeste séparé et ressources partagées       |
| Packs pays               | OPFS/PMTiles                           | Archives volumineuses installées explicitement |
| Shell PWA                | Service Worker/Workbox                 | Séparé des cartes et données utilisateur       |

L'ancien historique de cinq traces en `localStorage` n'est plus la bibliothèque canonique. Il est
conservé en lecture seule pour une migration copy-first vers `TrackRepository`.

## Droits Pro et flags de release

Les droits commerciaux ne sont pas des flags de déploiement :

- `featureFlags.ts` et les contrôles `isProActive()` appliquent les limites Free/Pro ;
- `releaseFlags.ts` permet d'activer ou désactiver un lot livré sans modifier les droits d'achat.

Valeurs de build actuelles :

| Flag                 |  Défaut   | Sens                                        |
| :------------------- | :-------: | :------------------------------------------ |
| `preparedRoutes`     |  activé   | Itinéraires préparés et bibliothèque locale |
| `guidanceForeground` |  activé   | Moteur et interface de guidage              |
| `nativeGuidance`     |  activé   | Service de guidage Android                  |
| `routeReadiness`     |  activé   | Rapport avant départ                        |
| `routeCorridor`      |  activé   | Corridor hors ligne                         |
| `accountSync`        | désactivé | Compte et synchronisation non livrés        |
| `expertWorkbench`    | désactivé | Atelier expert futur                        |

Un endpoint `VITE_RELEASE_FLAGS_URL` peut fournir une décision distante temporaire ; le dernier
payload valide n'est utilisé que pendant son TTL. Une surcharge développeur locale reste réservée
au diagnostic.

## Limites à annoncer honnêtement

- Aucun compte, sauvegarde cloud ou synchronisation PC–Android n'est actif.
- La couverture cartographique, les bâtiments, les sentiers et le satellite dépendent des sources,
  des licences, des clés et de la zone géographique.
- « Hors ligne » signifie que les ressources nécessaires ont été téléchargées et relues avec
  succès. Une bbox enregistrée ou un pack listé ne prouve pas à lui seul une couverture complète.
- Les conditions météo et l'état de l'appareil restent `unknown` dans Readiness tant qu'aucune
  preuve fraîche n'est fournie.
- GPS, altitude, D+/D-, difficulté et estimations solaires restent des aides à la décision, pas des
  garanties de sécurité. L'utilisateur doit vérifier le terrain et les conditions réelles.
- Les archives locales sont limitées par le stockage réel de l'appareil, sans suppression
  silencieuse ni quota commercial artificiel.

## Documents historiques

L'ancien `docs/archives/FEATURES.md` décrit la version 5.53.2 et reste volontairement figé. Pour
toute décision actuelle, ce fichier-ci, le code et les documents référencés dans
[README.md](README.md) font foi.
