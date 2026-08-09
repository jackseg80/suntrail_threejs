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

## Session et UI

- Démarrer depuis une PreparedRoute `guidanceQuality=full` ; demander confirmation pour
  `approximate`, refuser proprement `not-ready`.
- Route disponible localement en mode avion.
- Afficher distance, ETA, progression, écart, état GPS et recentrage.
- UI fort contraste, une main, nord en haut/direction en haut si fiable.
- Alertes visuelles et haptiques au premier plan.
- REC activable indépendamment ; guidance-only, recording-only et both côté orchestration JS.
- Aucune paywall ni promotion pendant la session.
- Le web peut partager le moteur au premier plan avec message explicite sur ses limites.

## Promesse limitée

Ne pas promettre ni implémenter à moitié : alertes écran éteint, notification de guidage,
persistance route native, survie après kill ou matcher natif. Ces garanties appartiennent à
v5.85. Le REC natif continue toutefois selon son comportement existant.

## Tests et acceptation

- Unitaires déterministes de toutes les fixtures et seuils.
- E2E démarrer/pause/reprendre/arriver/stopper et REC indépendant.
- Test Android réel application ouverte et mode avion, trace préchargée.
- Vérifier GPS imprécis, position stale et lacets proches sans alertes répétées.
- Non-régression REC, GPX, bibliothèque, solaire, offline et RevenueCat.
- Tous les gates standard et Capacitor/Android pertinents passent sur track interne/fermé.
- Aucun store listing ne présente ce jalon comme un guidage complet et aucun déploiement public
  n'est effectué.

Documenter algorithme, limites foreground, payload GuidanceSnapshot, thresholds et protocole
terrain. Ajouter `guidanceForeground` au registre de release flags. Mettre à jour docs/release
habituels. Ne commit/tag/push pas sans autorisation ; si seule une simulation a été testée,
conclure que la release Android n'est pas validée.
