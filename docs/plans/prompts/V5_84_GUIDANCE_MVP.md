# Prompt autonome — SunTrail v5.84.0 Moteur de suivi interne

Travaille après validation de v5.83. Réalise un suivi de trace réellement utile hors réseau
sur Android **tant que l'application reste ouverte**, avant le cloud et avant les garanties
background de v5.85. Cette étape est interne/fermée et n'est pas une promesse Play publique.

## Préparation

Lis les instructions du dépôt, roadmap, plan transversal, contrats PreparedRoute, code GPS/REC,
foreground service, mobile UI, carte, profil et tests. Trace les abonnements GPS existants.
Préserve le REC et n'ajoute jamais une seconde source de position concurrente.

## GuidanceEngine TypeScript

Créer un moteur pur, indépendant de DOM/Three.js :

- projection sur polyline et segment proche ;
- progression avec protection contre retours/lacets/croisements ;
- distance restante, ETA, cross-track, bearing/look-ahead ;
- accuracy, fraîcheur et statuts idle/acquiring/onRoute/offRoute/recovered/arrived/paused ;
- seuils centralisés et testables, avec hystérésis temporelle et cooldown ;
- aucune alerte depuis une position stale ou trop imprécise.

Construire des fixtures JSON : droite, boucle, aller-retour, épingles proches, croisement, bruit,
saut GPS, retour sur route et arrivée. Ces fixtures seront réutilisées par Android en v5.85.

## Prochaine indication et points à venir

- Introduire `GuidanceCueV1` et un `GuidancePlanV1` local séparé de `PreparedRouteV1`, lié par
  `routeId` et empreinte de géométrie, avec migration IndexedDB additive et régénération sûre.
- Demander les instructions ORS et convertir `segments.steps` vers les cues canoniques ; accepter
  les étapes OSRM comme fallback lorsqu'elles existent, sans dépendre du réseau pendant la session.
- Afficher la prochaine indication et sa distance. Inclure départ, arrivée, virages routés et
  waypoints/POI nommés réellement associés à la trace.
- Un GPX `trk` standard n'est qu'une géométrie. Exploiter `wpt`/`rtept` nommés s'ils sont présents
  et proches de la trace ; ne pas interpréter silencieusement une extension propriétaire.
- Une indication issue du seul angle de la géométrie est `derived`, filtrée par angle, distance,
  sinuosité et confiance. La présenter comme « changement de direction approximatif », la
  supprimer dans les lacets/courbes ambigus et ne jamais inventer de nom de sentier.
- Tester droite, virages gauche/droite, boucle, lacets, croisement, demi-tour, cue dépassée,
  waypoint/POI, GPX sans cue et passage hors ligne après préparation.

GPX reste le format principal en v5.84. Ne pas ajouter d'import FIT/TCX : FIT Course Points et
TCX CoursePoint pourront avoir des adaptateurs ultérieurs sans changer le contrat canonique.
Ne pas ajouter de voix, de liste « Up Ahead » complète ni de recalcul réseau dans ce jalon.

## Session et UI

- Démarrer depuis une PreparedRoute `guidanceQuality=full` ; demander confirmation pour
  `approximate`, refuser proprement `not-ready`.
- Route disponible localement en mode avion.
- Afficher prochaine indication et distance, distance/ETA restantes, progression, écart, état
  GPS et recentrage.
- UI fort contraste, une main, nord en haut/direction en haut si fiable.
- Alertes visuelles et haptiques au premier plan.
- REC activable indépendamment ; guidance-only, recording-only et both côté orchestration JS.
- Aucune paywall ni promotion pendant la session.
- Le web peut partager le moteur au premier plan avec message explicite sur ses limites.

## Promesse limitée

Ne pas promettre ni implémenter à moitié : alertes écran éteint, notification de guidage,
voix, recalcul automatique, persistance route native, survie après kill ou matcher natif. Ces
garanties appartiennent à v5.85 ou à une portée ultérieure explicitement validée. Le REC natif
continue toutefois selon son comportement existant.

## Tests et acceptation

- Unitaires déterministes de toutes les fixtures et seuils.
- E2E démarrer/pause/reprendre/arriver/stopper et REC indépendant.
- Test Android réel application ouverte et mode avion, trace préchargée.
- Vérifier GPS imprécis, position stale et lacets proches sans alertes répétées.
- Non-régression REC, GPX, bibliothèque, solaire, offline et RevenueCat.
- Tous les gates standard et Capacitor/Android pertinents passent sur track interne/fermé.
- Aucun store listing ne présente ce jalon comme un guidage complet et aucun déploiement public
  n'est effectué.

Documenter algorithme, sources/confiance des cues, limites foreground, payload GuidanceSnapshot,
thresholds et protocole terrain. Utiliser le flag `guidanceForeground` déjà présent dans le
registre v5.83. Mettre à jour docs/release habituels. Ne commit/tag/push pas sans autorisation ;
si seule une simulation a été testée, conclure que la release Android n'est pas validée.
