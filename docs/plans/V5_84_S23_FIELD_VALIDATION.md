# v5.84.0 — Protocole terrain Galaxy S23

> Jalon interne/fermé, application ouverte. Clôturé le 2026-08-11 après acceptation de la
> validation Galaxy S23 par le testeur. Cette validation ne couvre pas le guidage Android natif.

## Préparation

1. Installer l'APK/AAB interne `5.84.0` (`versionCode 902`) sur le Galaxy S23.
2. Précharger une route `guidanceQuality=full` comportant une boucle, un croisement et plusieurs
   lacets proches. Ouvrir une seconde route GPX sans cues fiables.
3. Vérifier la route en ligne, fermer/réouvrir l'app, puis activer le mode avion.
4. Garder l'écran allumé et l'application au premier plan pendant tout le scénario guidance.

## Retour terrain du 2026-08-11

- Validé sur S23 : démarrage et réouverture d'une route, progression, hors-trace/récupération,
  fonctionnement offline avec route préchargée, profil/pente et sauvegarde REC.
- Correctifs revalidés et acceptés : stabilité du cap, repositionnement après dépliage, indication
  localisée, flèche directionnelle, arrêt REC sans notification résiduelle et réveil de carte.
- Verdict de clôture : `VALIDÉ` pour le périmètre v5.84 (application ouverte, sans promesse
  écran éteint, notification de guidage ou reprise native).

## Scénarios obligatoires

- **Guidance-only** : démarrer sans REC, marcher 5 à 10 minutes, pause, reprise, recentrage,
  arrivée et arrêt. Noter progression, distance restante, ETA, écart et fraîcheur GPS.
- **Recording-only** : arrêter le guidage, démarrer REC et confirmer le comportement historique,
  la notification REC et la sauvegarde GPX.
- **Both** : démarrer le guidage puis REC. Arrêter REC sans arrêter le guidage, puis refaire
  l'inverse. Vérifier qu'une seule position est affichée et qu'aucun point REC n'est perdu.
- **Mode avion** : route déjà chargée, aucune requête nécessaire au démarrage ou pendant la
  session ; carte éventuellement partielle mais trace et matcher disponibles.
- **GPS bruité** : bâtiment/forêt ou replay de positions. Une précision >60 m ou une position de
  plus de 15 s affiche acquisition et ne provoque aucune vibration hors-trace.
- **Lacets proches/croisement** : la progression ne saute pas au segment suivant et ne revient
  pas en arrière. Photographier/filmer la progression avant, au point ambigu et après.
- **Hors-trace/retour** : rester au-delà de `max(40 m, 1,5 × accuracy)` pendant plus de 20 s ;
  une seule alerte visuelle/haptique. Revenir sous 60 % du seuil pendant 10 s ; état récupéré.
- **Arrivée** : rester dans les 25 m finaux pendant 10 s ; état Arrivé, puis arrêt manuel.
- **Qualités de route** : `approximate` exige confirmation ; `not-ready` refuse clairement.
- **Disposition mobile** : pendant le suivi, Préparer disparaît mais son brouillon est restauré à
  l'arrêt ; nord, GPS, couches et 2D/3D restent utilisables dans le rail droit. Ouvrir Profil &
  Pentes : le guidage se réduit à une ligne de sécurité au-dessus du graphique, puis revient à
  son état précédent après fermeture. Contrôler portrait et paysage.
- **Caméra** : le démarrage ne suit pas automatiquement. Appuyer sur Recentrer une fois : le
  point reste dans le tiers supérieur visible, sans oscillation ni recentrage répété. Déplacer
  ensuite la carte manuellement et vérifier qu'elle ne lutte pas contre le geste. Déplier puis
  réduire le panneau : le point doit changer immédiatement de position à l'écran et rester hors
  de la zone couverte.
- **Flèche** : sur trace, tourner physiquement le téléphone et vérifier que la petite flèche vise
  la suite. Hors trace, elle doit viser le chemin direct vers la trace, pas simplement son sens.
- **Reprise carte** : laisser l'app immobile plusieurs minutes, ouvrir/fermer des panneaux et
  passer brièvement en arrière-plan. Une carte noire ou figée doit se réveiller seule en moins de
  3 secondes, sans devoir quitter l'application.
- **Brouillon manuel** : poser deux points dans Préparer, utiliser Suivre directement, puis
  arrêter et vérifier que le brouillon et ses commandes sont restaurés.

## Non-régressions rapides

- Import GPX, profil et réouverture Bibliothèque.
- REC sauvegardé puis réouvert.
- Route PreparedRoute disponible après redémarrage en mode avion.
- Analyse solaire et timeline.
- Zone offline/packs déjà installés.
- Écran Pro/RevenueCat accessible hors session ; aucune paywall pendant le suivi.

## Preuves à consigner

- modèle/Android/API, version affichée, SHA de l'APK/AAB et heure du test ;
- route utilisée et qualité ; durée de chaque mode guidance-only/recording-only/both ;
- captures de départ, hors-trace, récupération, arrivée et REC indépendant ;
- résultat P0/P1/P2, logs utiles et consommation batterie indicative ;
- verdict explicite : `VALIDÉ`, `VALIDÉ AVEC P2` ou `BLOQUÉ`.

Hors test v5.84 : écran éteint, notification de guidage, kill/swipe-away et reprise native. Ces
garanties ne doivent pas être interprétées comme des échecs de ce jalon foreground.
