# Validation terrain Galaxy S23 — SunTrail v5.82.0

> v5.82 est finalisée dans le worktree et ses gates automatisés sont verts. Ce protocole
> clôt la validation réelle avant publication. Il ne couvre pas le futur guidage v5.84+.

## Bilan enregistré — 2026-08-09

- Validation manuelle acceptée sur Galaxy S23, sans anomalie P0/P1 signalée par l'utilisateur.
- L'observation « Sortie/Bibliothèque partagent encore le même flux » est classée P2 : c'est une
  transition documentée et la bibliothèque locale durable est la portée de v5.83.
- Les versions Android/WebView, durée, réseau, batterie, chauffe et captures détaillées n'ont
  pas été fournis : ils restent non renseignés, sans être présentés comme réussis.
- Play Console confirme `896` comme maximum réellement utilisé ; le bundle v5.82.0 signé porte
  donc valablement `versionCode 897`. Restent commit, tag, CI, test interne/fermé et déploiement
  progressif. v5.83 attend la clôture de cette release.

## Informations à consigner

- date, modèle exact, version Android et version Android System WebView ;
- build testé, `versionName`/`versionCode` et mode d'installation ;
- météo, température extérieure, réseau et durée du parcours ;
- batterie au départ/retour, chauffe perçue et captures utiles.

## Parcours court avant sortie

- démarrage à froid puis relance, permissions acceptées/refusées ;
- Explorer → recherche → résultat → retour carte ;
- Préparer → deux points par tap → calcul → inversion → suppression → sortie du mode ;
- Sortie/Bibliothèque → import GPX, activation, statistiques et historique récent ;
- réglages essentiels, avancés, thème, rotation portrait/paysage et textes longs ;
- zone offline ou pack déjà disponible, puis redémarrage en mode avion.

## Parcours réel

- GPS et recentrage en mouvement, précision/fraîcheur compréhensibles ;
- REC pendant au moins 30 minutes, dont 10 minutes écran éteint ;
- passage réseau → mode avion → réseau sans perte ni blocage ;
- interruption par appel/changement d'application, retour puis arrêt/export du REC ;
- fermeture/reprise de l'application et contrôle des données conservées ;
- lisibilité au soleil, manipulation à une main, vibration et absence de geste dangereux.

## Décision

- **P0/P1** : suspendre publication et v5.83, corriger v5.82 puis rejouer tous les gates.
- **P2** lié au flux principal : corriger avant publication ou documenter une décision explicite.
- **P3/cosmétique** : backlog autorisé avec capture et reproduction.
- Si aucun bloquant : consigner le bilan, vérifier le maximum `versionCode` dans Play Console,
  puis effectuer commit, tag, CI et déploiement progressif.

Le bilan doit distinguer ce qui a été observé réellement de ce qui reste simulé ou non testé.
