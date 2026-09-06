# Prompt autonome — SunTrail v5.88.0 Audit complet et stabilisation performance

> Statut : exécuté et clôturé pour publication GitHub le 2026-09-06 en version 5.88.0 / Android
> 908. Les contrôles A53/S23 et la comparaison terrain S23/Garmin sont positifs. Le contrôle long
> de 30 minutes en faible réseau reste un suivi post-release accepté ; aucun upload Play n'est inclus.

## Configuration Codex recommandée

- Modèle : **GPT-6 Astra** (`gpt-6-astra`).
- Effort de raisonnement : **élevé (`high`)** pour toute la discussion.
- Ne passer à `xhigh` que si le profiling produit des signaux contradictoires, si une régression
  multi-couche résiste à l'analyse ou avant une décision architecturale réellement difficile.
- Ne pas utiliser `max`/`ultra` par défaut : les mesures reproductibles, les profils et les tests
  comptent davantage qu'un raisonnement plus long sur des données insuffisantes.

Ce chantier transversal convient à Astra : TypeScript/Three.js, WebView/Capacitor, Java/Room,
Android/USB, dépendances et préservation d'un worktree déjà modifié. Un modèle plus léger suffit
ensuite pour une correction mécanique bien isolée, mais la même discussion Astra doit conserver le
contexte, arbitrer les preuves et diriger la validation de bout en bout.

Tu travailles sur SunTrail dans `D:\Python\suntrail_threejs`. L'objectif de v5.88 est de rendre
l'usage terrain combiné — itinéraire affiché, Guidance et REC simultanés — sensiblement plus fluide
sur Galaxy A53, sans régression fonctionnelle, énergétique ou de fidélité des traces. Le Galaxy S23
sert de contrôle de non-régression. Cette passe de stabilisation précède v6.0 et n'ajoute aucune
fonction produit.

Le mode combiné sur A53 est le symptôme prioritaire et le gate appareil, mais l'audit est global :
démarrage, rendu Three.js, données/tuiles, calculs, UI, mémoire, stockage, réseau, bridge Capacitor,
service Android, WebView, bundle et dépendances. Il faut rechercher les gains généraux qui rendent
la base plus saine avant v6, sans transformer le chantier en réécriture spéculative.

## Constat utilisateur à traiter

Le 2026-09-05, la build v5.87.0 a été utilisée sur un Galaxy A53. REC seul paraît acceptable, mais
l'application devient « passablement lente » lorsque l'itinéraire, le suivi/Guidance, le REC et le
reste de la carte fonctionnent ensemble. Le ralentissement se ressent dès l'utilisation normale,
sans devoir effectuer une sortie, et la carte 3D devient particulièrement lente. C'est une
observation crédible et suffisante pour ouvrir le chantier, mais pas encore un diagnostic. Il faut
reproduire, mesurer, isoler puis corriger.

La passe v5.85.1 a déjà réduit plusieurs coûts : rendu au repos, boussole, reconstruction REC bornée,
persistance différée, cache/préchargement LOD, travaux UI masqués, broadcasts/écritures Room et
recherche de segments. Ne réimplémente pas ces corrections sans vérifier leur présence dans le HEAD
actuel et leur comportement réel sur appareil. Les validations comparatives A53/S23 prévues alors
n'ont pas été closes de façon complète.

## Autorité, sécurité et état à préserver

1. Lis intégralement `AGENTS.md`, puis `CLAUDE.md`.
2. Lis le haut de `CHANGELOG.md`, toute la section active de `ROADMAP.md` avant son archive, `TODO.md`,
   `docs/AI_ARCHITECTURE.md`, `docs/AI_PERFORMANCE.md`, `docs/GUIDANCE_FOREGROUND.md`,
   `docs/GUIDANCE_ANDROID.md`, `docs/TRACK_STORAGE.md`,
   `docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md` et
   `docs/plans/V5_86_BATTERY_VALIDATION.md`.
3. Lis les prompts v5.87, v6.0, v6.1 et l'index des prompts pour comprendre les contrats livrés et
   le prochain périmètre, sans commencer une fonction v6.
4. Exécute `git status --short`, inspecte les diffs existants et relève HEAD, branche et tags avant
   toute modification. Le worktree contient potentiellement des mises à jour documentaires et un
   dossier `outputs/` qui appartiennent au propriétaire : préserve-les intégralement.
5. Vérifie les versions source et Android réellement présentes. Ne déduis jamais l'état Play Console
   d'un fichier local ou d'un tag Git.

Aucun stage, stash, commit, tag, push, pull, changement de branche, bump de version, release,
téléversement Play, déploiement ou suppression sans autorisation explicite. Ne désinstalle pas
l'application des téléphones et n'efface ni données, ni Room, ni `TrackingPrefs`, ni traces. Toute
installation sur appareil ou remise à zéro de compteurs de diagnostic demande un accord distinct.

Ne lance jamais `TrackingServiceInstrumentedTest` sur le S23 ou l'A53 personnels : ce test efface
Room et `TrackingPrefs`. Si une instrumentation destructive devient indispensable, utiliser un
package de test isolé et expliquer d'abord exactement ce qui sera effacé.

## Première réponse attendue dans la nouvelle discussion

Commence en lecture seule. Réaudite le worktree et présente avant tout changement de code :

- l'état Git et les modifications à protéger ;
- l'architecture effective du flux combiné, du fix GPS natif jusqu'au rendu WebView ;
- une reproduction locale immédiate et une matrice de mesures A53/S23 ;
- les coûts observés, classés par preuve, avec fichiers/fonctions concernés ;
- les hypothèses encore non prouvées ;
- un plan de corrections petit, séquencé, réversible et testable ;
- les gates proposés et les mesures de référence disponibles.

Attends ensuite l'accord du propriétaire avant de modifier le code. Une fois le plan accepté,
travaille par lots indépendants : une mesure avant, une modification ciblée, la même mesure après.
Écarte toute modification qui n'apporte pas de gain reproductible ou qui dégrade un contrat.

## Photographie USB initiale de l'A53

Le propriétaire peut brancher le Galaxy A53 en USB pour cette discussion. Dès qu'il confirme qu'il
est connecté et déverrouillé, commencer par des relevés non destructifs :

- `adb devices -l`, modèle, API, build/fingerprint, architecture, mémoire et état thermique ;
- package SunTrail réellement installé, `versionName`, `versionCode`, chemin APK et processus actifs ;
- package/version du moteur Android System WebView ou Chrome effectivement utilisé ;
- état du service `:tracking`, PSS par processus, CPU applicatif, `gfxinfo`/frame stats disponibles,
  erreurs ANR/crash/WebGL et activité réseau/Room observable sans vider les journaux ;
- état de batterie et compteurs SunTrail déjà présents, explicitement marqués « cumulés » tant
  qu'aucune fenêtre de mesure dédiée n'a été autorisée.

Ne lance pas immédiatement une installation, un test instrumenté, un reset de `batterystats`, un
`logcat -c` ou une modification de réglage. Demande au propriétaire d'ouvrir la build déjà installée,
de charger le même itinéraire et d'activer les mêmes fonctions jusqu'à l'état lent, notamment en 3D,
puis capture l'état avant de proposer une instrumentation plus intrusive. Aucune marche ni sortie
réelle n'est requise pour cette première reproduction. Le relevé A53 doit rester dans cette
discussion pour que contexte, build, scénario et mesures ne soient pas dissociés.

## Audit global de la base et des dépendances

Ne limite pas l'analyse au GPS. Produis une vue d'ensemble des coûts et de l'obsolescence technique :

- démarrage froid/chaud, ordre d'initialisation, cache, recherche/configuration distante, imports
  dynamiques, chunks, parsing et hydratations non critiques ;
- taille du bundle initial et des chunks, doublons, tree-shaking, source maps de mesure et poids des
  bibliothèques réellement exécutées sur le chemin terrain ;
- boucle Three.js, géométries, matériaux, shaders, ombres, post-traitements, DPR, allocations par
  frame, uploads GPU, disposal et possibilités d'API déjà disponibles dans la version installée ;
- tuiles couleur/élévation/overlay, décodage, files d'attente, concurrence, cache mémoire/disque,
  préchargement, annulation, LOD et comportement offline ;
- état/UI, EventBus, écouteurs, timers, observers, panneaux fermés, profil d'altitude, solaire,
  météo et travaux déclenchés plusieurs fois ;
- IndexedDB, Room, Preferences et CacheStorage : volume, sérialisation, transactions, copies,
  contention et fréquence d'écriture ;
- Android : Capacitor, plugins, service/processus, Fused Location, notifications, wake locks,
  Gradle/AGP/JDK, R8 et compatibilité API 24→36 ;
- tests, outillage de profiling et zones critiques dépourvues de mesure ou de garde de complexité.

Audite également toutes les dépendances directes et de développement à partir de `package.json`,
du lockfile et des fichiers Gradle. Pour Three.js — probablement la bibliothèque visée par le terme
« OsiriJS » dans le retour utilisateur —, Capacitor, Vite, TypeScript, Vitest, Playwright, plugins
Android, RevenueCat, Supabase, PMTiles/PBF et l'outillage Android :

1. relever version déclarée, version réellement verrouillée, dernière version stable disponible et
   compatibilités exigées ;
2. lire les release notes, guides de migration et avis de sécurité officiels, pas un résumé tiers ;
3. distinguer mise à jour corrective, mineure et majeure, avec bénéfice attendu, risques, changements
   cassants, poids de bundle et matrice de tests ;
4. utiliser `npm outdated`/audit et les équivalents Gradle en lecture seule lorsque le réseau est
   autorisé, sans modifier le lockfile ;
5. recommander explicitement « rester sur la version actuelle » lorsqu'une mise à jour n'apporte
   aucun gain utile ou élargit inutilement le risque.

Une version plus récente n'est jamais en elle-même une optimisation. Ne mélange pas une mise à jour
majeure avec une correction de performance causale. Si une mise à jour semble prometteuse, la tester
dans un lot isolé avec bundle, comportement, performance et rollback avant/après ; ne la conserver
qu'après accord du propriétaire et preuve de bénéfice ou nécessité de maintenance/sécurité.

## Cartographie technique obligatoire

Retrace au minimum :

- `RecordingService` : abonnement Fused Location, modes `recording`, `guidance`, `both`, filtrage,
  buffer Room, notification, broadcasts et persistance de session ;
- bridge Capacitor et `nativeGPSService` : fréquence des événements/synchronisations, récupération
  de points, copies de tableaux, déduplication, persistance locale, statistiques et cadence du mesh ;
- `gpxLayers` : géométrie canonique contre géométrie d'affichage, drapage terrain,
  simplification, `TubeGeometry`, outline, profil et coût en fonction de la longueur ;
- `scene`, `location`, contrôles et performance adaptative : cadence réelle quand
  `isFollowingUser` est actif, rendu caché/visible, LOD, météo/eau/soleil, préchargement et GPU ;
- moteur Guidance Java et TypeScript : taille de route, fenêtre de recherche, fallbacks, snapshots,
  alertes et parité des résultats ;
- panneaux Sortie/Bibliothèque et abonnements d'état : travail effectué quand ils sont ouverts,
  fermés ou en arrière-plan ;
- caches de tuiles/textures, workers et processus `:tracking`/WebView : CPU, mémoire, GPU, I/O et
  croissance pendant une session longue, sur table d'abord.

## Hypothèses à mesurer, pas à présumer

Le code actuel justifie notamment de vérifier :

1. le rendu maintenu à cadence élevée par `isFollowingUser`, même lorsque la caméra ou les données
   visuelles n'ont pas changé de façon utile ;
2. les scans de toute `state.recordedPoints`, créations de `Set`/`Map`, copies de tableaux, tri et
   reconstruction complète de `TubeGeometry` à chaque rafraîchissement REC, malgré la limite de
   2 500 points rendus ;
3. l'addition des broadcasts de localisation, snapshots Guidance, lots Room, statistiques de
   notification et mises à jour UI dans le mode `both` ;
4. les recherches complètes de segments au premier fix ou dans le fallback Guidance sur une route
   longue ou ambiguë ;
5. le drapage/rebuild des routes, profil d'altitude, overlay solaire, LOD, tuiles et textures pendant
   le suivi ;
6. les allocations, GC, long tasks JavaScript, uploads GPU et variations thermiques propres à
   l'A53.

Une lecture statique n'est pas une preuve. Pour chaque hypothèse, consigne le signal attendu,
l'outil de mesure, le scénario de reproduction et le verdict observé.

## Baseline reproductible

Construis d'abord une baseline sur table, sans toucher au comportement :

- appareils : A53 cible principale, S23 contrôle ; relever modèle, API, build Android, build
  SunTrail, température, charge, mode batterie, réseau et écran ;
- données : une route courte et une route longue/complexe fixes, plus un replay GPS déterministe si
  possible ; conserver exactement les mêmes données avant/après ;
- scénarios séparés : carte 2D puis 3D, rotation/zoom/panoramique, route affichée seule, Guidance
  seule, REC seul, puis Guidance + REC avec route affichée. Utiliser une position fixe, le simulateur
  ou un replay déterministe lorsque le mouvement GPS est nécessaire ;
- durées : diagnostics reproductibles de quelques minutes pour isoler la lenteur immédiate, puis
  30 minutes sur table pour mémoire, thermique et croissance avec la longueur du REC. Les sorties
  d'une heure ne sont nécessaires qu'en validation finale si une correction touche l'autonomie,
  le GPS, le service de fond ou la continuité terrain ;
- relevés : temps de démarrage, délai d'interaction, FPS/frame pacing, jank, long tasks, temps des
  handlers GPS et reconstructions, PSS Java/native/graphics, heap WebView si accessible, CPU par
  processus, GPU, I/O Room, nombre de broadcasts/écritures/rendus/rebuilds, température et erreurs ;
- batterie : attribuer uniquement la part SunTrail/UID et ses processus, avec GNSS, CPU, écran et
  wakelock séparés. Ne pas tirer de conclusion de la consommation globale du téléphone. Résoudre
  dynamiquement l'UID au lieu de réutiliser un ancien identifiant.

Les commandes ADB de lecture sont permises. Avant `batterystats --reset`, `logcat -c`, modification
d'un réglage système ou installation d'une autre build, demander l'autorisation et documenter la
portée. Les relevés cumulés sans fenêtre dédiée sont signalés comme tels.

Ajoute, si nécessaire, une instrumentation de développement désactivée en production : mesures
`performance.mark/measure`, compteurs de cadence et durées des phases coûteuses. Elle ne doit
collecter ni coordonnées, ni géométrie, ni donnée personnelle, ni dépendre d'un service distant.

## Principes d'optimisation

- Corriger le travail démontré inutile avant de réduire la qualité ou la fréquence des données.
- Préserver tous les points et métadonnées canoniques. Une représentation d'affichage peut être
  incrémentale ou simplifiée ; le repository, la reprise et l'export restent pleine fidélité.
- Préserver la précision GPS, la progression, les alertes, l'indépendance REC/Guidance, les STOP
  séparés, l'écran éteint, la reprise après mort de WebView et le fonctionnement offline.
- Préférer les mises à jour incrémentales, index bornés, lots et cadences adaptées à la visibilité
  aux reconstructions globales. Chaque debounce possède un flush garanti aux transitions critiques.
- Ne diminuer ni le LOD, ni la qualité graphique, ni la fréquence GPS par défaut pour masquer un
  problème CPU. Une dégradation adaptative éventuelle doit être justifiée, bornée, visible dans les
  réglages existants et testée sur la lisibilité terrain.
- Ne pas lancer un refactor architectural général, un passage WebGPU, une migration de framework,
  un changement de format de stockage ou une mise à jour massive de dépendances dans ce lot.
- N'ajouter aucune télémétrie distante. Les traces et mesures de diagnostic restent locales.
- Ne pas confondre modernisation et optimisation : aucune mise à jour de dépendance ne partage un lot
  avec une correction algorithmique ou de rendu, afin de conserver une comparaison causale.
- Un commentaire historique `v5.x` n'est pas une raison de conserver ou de modifier un code : le
  comportement et les tests actuels font foi.

Ordre de travail recommandé, uniquement si les mesures le confirment : supprimer les traitements
dupliqués ; rendre le mesh REC réellement incrémental/borné ; réduire les copies et scans croissants ;
adapter la cadence du rendu et des panneaux ; réduire le fan-out bridge/Room/notification ; indexer
la recherche Guidance ; enfin traiter LOD/overlays. Ne cumule pas plusieurs changements avant de
répéter la mesure causale.

## Gates de performance et de non-régression

Le premier audit fixe les budgets absolus réalistes à partir de la baseline. Ne fabrique pas un
objectif FPS ou batterie sans mesure. Les gates minimaux suivants sont toutefois bloquants :

1. le scénario A53 qui reproduit la lenteur montre un gain stable et perceptible, soutenu par une
   baisse mesurée d'au moins 30 % du coût p95 du ou des traitements identifiés ;
2. aucun scénario de contrôle ne régresse de plus de 10 % sur son indicateur principal sans décision
   explicite et documentée ;
3. aucune longue tâche récurrente ni croissance mémoire monotone inexpliquée sur 30 minutes ; comparer
   notamment T15 et T30 à conditions identiques ;
4. Guidance + REC conserve 100 % des points acceptés, l'ordre, les timestamps et la géométrie
   persistée/exportée ; aucune optimisation visuelle ne touche la source canonique ;
5. mêmes résultats sur les fixtures Guidance Java/TypeScript, mêmes transitions et alertes, même
   récupération après écran éteint, pause, STOP séparé et mort de la WebView ;
6. aucun crash, ANR, écran noir, fuite WebGL, texture résiduelle, trou de trace ou perte offline ;
7. si les modifications touchent le GPS, le service natif, la cadence de fond ou l'autonomie : sur
   A53, la médiane de trois runs comparables Guidance + REC respecte la cible historique de surcoût
   d'au plus 1 point de batterie par heure face à REC seul, ou le dépassement bloque la clôture ;
8. le S23 ne présente aucune régression fonctionnelle ou énergétique attribuable à SunTrail.

Si le p95 ne peut pas être mesuré de manière fiable sur un outil donné, explique la limite et utilise
une mesure équivalente répétable. Un ressenti seul ouvre ou rejette une hypothèse, mais ne clôt pas
le chantier.

## Validation automatisée et appareils

- Ajouter des tests de complexité/régression sur trace longue, route longue et lots GPS, sans seuil
  chronométrique fragile en CI ; vérifier surtout que le travail ne croît plus inutilement avec tout
  l'historique quand seule la fin change.
- Rejouer les tests unitaires ciblés après chaque lot, puis `npm run check`, `npm test`,
  `npm run build`, `npm run check:bundle`, `npm run audit:i18n` et `git diff --check`.
- Rejouer `npm run test:e2e:smoke`, puis les scénarios Guidance/REC pertinents. Toute impossibilité
  Chromium/Playwright est un gate rouge documenté, pas un succès implicite.
- Si Android est modifié : `npm run cap:sync`, tests JVM/Gradle et lint ciblés avant appareil réel.
  Ne remplace pas les tests API 24/33/36 par un seul téléphone récent.
- Valider d'abord sur table avec l'A53 : carte 2D/3D, route affichée + Guidance + REC, rotation,
  zoom et panoramique. Refaire sur S23 comme contrôle. Ajouter écran éteint, retour app, STOP depuis
  notification, récupération et sortie longue seulement si les fichiers modifiés peuvent affecter
  ces contrats.
- Une APK peut être installée avec conservation des données seulement après accord explicite ;
  vérifier package/version avant et après, et ne jamais désinstaller comme raccourci.

## Livrables

- un rapport de baseline avec tableau A53/S23, scénario, build, données, durée et limites ;
- un inventaire global des performances et des dépendances, avec verdict conserver/mettre à jour/
  expérimenter/reporté pour chaque évolution pertinente ;
- une carte du flux et un classement preuve/hypothèse des coûts ;
- pour chaque correction : mesure avant/après, tests, risques, rollback et fichiers touchés ;
- des tests de non-régression et, si utile, une instrumentation locale maintenable ;
- un protocole reproductible sur table ; compléter par une matrice terrain REC seul contre
  Guidance + REC uniquement si le périmètre corrigé l'exige ;
- la mise à jour honnête de `docs/AI_PERFORMANCE.md`, de la roadmap, du TODO et du changelog ;
- un bilan séparant automatisé, simulé, appareil réel et non exécuté.

Ne déclare pas v5.88 terminée tant que la lenteur combinée et le mode 3D ne sont pas reproduits puis
améliorés sur A53, que les données et contrats sont intacts, et que le S23 est vert. Une fois les gates verts,
présente l'état et demande séparément l'autorisation pour chaque étape de clôture : bump/versionCode,
commit, tag, push, release GitHub, installation ou Play Console. Aucune de ces actions n'est incluse
dans ce prompt.
