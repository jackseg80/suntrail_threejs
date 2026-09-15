# SunTrail — Protocole de performance mobile (v5.90.1)

> Cibles de référence : Galaxy A53 en Équilibré et Galaxy S23 en Performance. Une impression de
> fluidité ne remplace pas une mesure, et une fenêtre courte ne prouve pas l'autonomie.

## Préserver avant de mesurer

1. Relever appareil, OS, version/versionCode, preset, mode Free/Pro, batterie, température,
   connexion, source de carte, LOD, route, Guidance et REC.
2. Ne pas effacer données, caches, zones, packs, Room ou Preferences.
3. Éviter de comparer deux runs avec batterie, température, cache, réseau ou scène différents.
4. Conserver les rapports USB localement s'ils contiennent position ou identifiants d'appareil.

## Outils

- Chrome DevTools via `chrome://inspect/#devices` pour la WebView ;
- panneau Stats/diagnostic uniquement lorsqu'il est explicitement activé ;
- Android Studio Profiler ou outils Android pour CPU, mémoire, thermique et services ;
- capture des mêmes fenêtres T0/T15/T30 pour un essai long.

## Scénarios reproductibles

### 1. Démarrage et première carte

- démarrage à froid sans changer le cache ;
- temps avant première tuile et avant carte stable ;
- compteur de chargement revenant au repos ;
- absence de chunk obsolète, écran HTML sans styles ou reload en boucle.

### 2. Navigation 2D et 3D

- 20 s au repos, 20 s de pan/zoom, puis 20 s au repos en 2D ;
- même séquence en 3D au même endroit et au même LOD ;
- relever FPS, p50/p95 des tâches longues, nombre de chargements et mémoire ;
- vérifier que les animations/Stats cachés ne continuent pas un travail visuel inutile.

### 3. Transitions et cache

- alterner deux LOD proches puis revenir à la vue initiale ;
- distinguer téléchargement réseau, hit CacheStorage, restauration texture et restauration pixels ;
- mesurer le temps jusqu'à opacité complète et relever tout trou persistant ;
- ne pas compter un cache chaud comme un gain de calcul si la baseline était froide.

### 4. Suivi caméra

- suivre une route présentant un remplacement de tuiles ;
- relever p95 de soumission/rendu et tout rebond vertical ;
- vérifier que l'absence temporaire d'altitude conserve la dernière hauteur valide sans modifier les
  points GPS.

### 5. Guidance + REC

- route sauvegardée, guidage et REC actifs avec une seule source GPS ;
- séquence écran actif, écran éteint puis reprise ;
- contrôler notification, continuité des points, service `:tracking`, mémoire et température ;
- STOP doit archiver le même lot final que l'export/couche/résumé.

### 6. Faible réseau et offline

- télécharger préalablement une zone/corridor et mesurer sa couverture ;
- exécuter 30 min en mouvement avec route + Guidance + REC ;
- comparer T0/T15/T30, événements réseau, tâches longues, mémoire, batterie et thermique ;
- noter séparément les manques de carte, qui ne doivent pas interrompre la géométrie suivie.

## Références 5.88, pas seuils universels

- scénario de rebond A53 : p95 CPU 109,4 ms avant correctif et 23,8 ms après ;
- transitions S23 contrôlées : environ 16–17 s avant et 0,9 s après ;
- marche S23/Garmin 2,76 km : aucune portion perdue, écart de distance 0,72 m, écart spatial
  médian 1,50 m et p95 5,01 m.

Ces chiffres prouvent seulement les scénarios et appareils consignés. Pour déclarer une régression
ou un gain, reproduire au moins trois runs homogènes et rapporter la dispersion.

## Critères de décision

- aucune perte de points, archive ou route ;
- aucun service REC/Guidance résiduel après arrêt explicite ;
- aucune dégradation durable de résolution provoquée par le repos volontaire ;
- mémoire bornée sans éviction d'une texture encore affichée ;
- carte utilisable après interaction et retour au premier plan ;
- résultats comparés dans un contexte identique, avec limites explicites.
