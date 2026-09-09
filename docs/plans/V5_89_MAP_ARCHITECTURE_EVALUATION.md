# v5.89 — Réactivité cartographique et décision d'architecture

Date : 2026-09-08. Statut : instrumentation locale, baseline navigateur et contrôle A53 obtenus ;
le pack Suisse déclaré installé présente des défauts de format et doit être reconstruit. Relais :
[session du 8 septembre](V5_89_SESSION_HANDOFF_2026-09-08.md), puis
[progression du 9 septembre](V5_89_SESSION_PROGRESS_2026-09-09.md).
Baseline source : 5.88.0, commit `86c44538` (documentation après `f48c3556`).
Ce document ne change ni la version de l'application ni son état de publication.

## Décision à prendre

Déterminer si SunTrail peut afficher une carte rapidement utilisable et permettre des gestes
fluides avec Three.js/WebGL/Capacitor, dans les budgets mémoire et qualité des presets actuels.
Ne présumer ni que WebGL est la limite, ni que le moteur maison doit absolument être conservé.
WebGPU est une option à comparer lorsque les mesures justifient un prototype, pas le correctif
par défaut d'une lecture de tuiles lente.

Le résultat attendu est une décision étayée : correction ciblée, refonte du chargement dans
Three.js, comparaison avec un moteur cartographique spécialisé, ou étude d'un composant natif.
Une migration complète n'est pas incluse dans ce lot d'évaluation.

**Priorité précisée par le propriétaire après l'essai navigateur : les cas décisifs sont le
cache et le pack installé.** Le réseau froid est un contrôle secondaire. Une apparition par blocs
pendant un téléchargement ne suffit pas à justifier une refonte du moteur. Aucune décision de
migration ne sera fondée sur ce seul cas tant que les scénarios locaux ne sont pas qualifiés.

## Signalements et référence navigateur

- Le propriétaire observe une apparition progressive des tuiles sur A53, sur un téléphone
  Snapdragon Elite et sur PC, y compris avec un pack Suisse selon son témoignage.
- Cas reproductible demandé : Suisse au LOD 14, déplacement horizontal puis vertical,
  particulièrement dans une zone sans cache, puis retour au même endroit.
- URL fournie : https://jackseg80.github.io/suntrail_threejs/app.html.
- Brave avec Intel HD, plutôt que RTX, est un cas prioritaire. Modèles exacts, GPU effectivement
  utilisé par le navigateur, version Brave et accélération matérielle restent à relever.
- Le navigateur intégré Codex est un environnement distinct. Il permet une observation initiale,
  mais ne prouve ni le comportement Brave/Intel HD, ni celui de la WebView Android.
- Compte rendu initial : [observation navigateur](V5_89_BROWSER_INITIAL_OBSERVATION.md).

Les signalements ne sont pas des mesures instrumentées. Un temps de réponse d'un outil de
contrôle navigateur ne mesure pas le temps d'affichage de SunTrail.

## Faits de code à investiguer, sans attribution causale prématurée

1. `terrain/Tile.ts` : le chemin normal utilise encore `zoom <= 10` pour `fetchAs2D`, alors que
   le rendu plat considère aussi `state.IS_2D_MODE`. Une nouvelle expérience couleur seule capture
   le mode de données à la création et sépare les clés 2D/3D. Elle accélère fortement l'A53 mais
   reste désactivée par défaut à cause du pic mémoire observé pendant le retour en 3D.
2. `tileLoader.ts` : caches, packs et ressources complémentaires précèdent l'envoi au worker.
   Certaines lectures couleur/relief/overlay du pack se suivent avec `await`.
3. `workers/tileWorker.ts` : couleur, relief et overlay sont attendus ensemble ; la réponse
   incluant la couleur est envoyée après le traitement du relief disponible.
4. `terrain/tileQueue.ts` : réseau et lecture locale partagent un plafond de tuiles en cours,
   dérivé du preset, augmenté de deux pendant certaines transitions. La construction des meshes
   est répartie entre frames avec un budget de 10 ms, qui ne préempte pas une construction isolée.
5. `terrain/Tile.ts` : fondu individuel d'environ 200 ms en 3D, absent en 2D. La conservation
   des anciennes tuiles reste nécessaire pour éviter les trous ; ne pas simplement la supprimer.
6. `tileCache.ts` : capacité en nombre d'entrées, textures visibles épinglées. Le nombre
   d'entrées n'est pas une mesure en octets de l'ensemble mémoire CPU + GPU.
7. `packManager.ts` : distinguer archive réellement lue dans OPFS et archive distante ; un
   état installé peut avoir un repli CDN si le fichier est absent. Le catalogue embarqué Suisse
   annonce LOD 8–14 ; vérifier le catalogue runtime, la couche et la lecture locale réelle.
8. `appInit.ts` / `performance.ts` : premier preset détecté puis benchmark différé possible.
   Relever le preset effectif au début et à la fin, pas uniquement le toast de démarrage.
9. `terrain.ts` : le préchargement au repos couvre les LOD adjacents, pas une couronne au LOD
   courant. Le premier panoramique peut donc découvrir directement une bordure sans fond prêt.

## Presets et mémoire : contraintes conservées

| Profil visible | Identifiant | RANGE | Résolution nominale | DPR plafond  | Tuiles en cours usuelles / transition | Cache mobile / desktop, entrées |
| -------------- | ----------- | ----: | ------------------: | ------------ | ------------------------------------- | ------------------------------- |
| Endurance      | eco         |     3 |                   2 | 1            | 2 / 4                                 | 80 / 80                         |
| Équilibré      | balanced    |     5 |                  64 | 1,2          | 4 / 6                                 | 120 / 400                       |
| Fluide         | performance |     6 |                 160 | 1,5          | 6 / 8                                 | 120 / 500                       |
| Maximum        | ultra       |    12 |                 256 | DPR appareil | 12 / 14                               | 160 / 800                       |

Source : `state.ts`, `terrain/tileQueue.ts`, `tileCache.ts`. Les valeurs effectives peuvent varier :
2D à résolution 1, relief plafonné à 64 au LOD >= 15, adaptation de DPR, mode batterie, viewport.
Les profils supérieurs augmentent aussi portée, ombres et objets. Une comparaison entre presets
est une comparaison d'expériences produit, pas une preuve à qualité identique.

Ne pas augmenter globalement les plafonds de cache, de concurrence ou de portée. Mesurer les
pics de décodage, pixels altitude/normales, géométries, textures et anciennes/nouvelles générations.
Ne pas fermer un ImageBitmap encore requis pour la restauration ni libérer une texture affichée.
La mémoire JS seule ne représente ni la mémoire totale du navigateur ni la VRAM.

## Phase A — Reproduire sans changer le moteur

Ordre de qualification :

1. **Textures en mémoire** : charger A, aller sur B voisine, revenir sur A sans recharger la page ;
   vérifier les hits mémoire, les éventuelles évictions et l'absence de lecture/décodage redondant.
2. **Cache persistant** : recharger l'application puis revoir la même zone, cache HTTP/CacheStorage
   et pack distingués. Les textures GPU ne sont plus celles de la page précédente : ce cas mesure
   aussi le décodage et la remise en mémoire graphique, pas seulement le stockage.
3. **Pack installé** : profil disposant réellement du pack Suisse, LOD 14 et couche topo contenue,
   choisir une zone du pack non encore parcourue dans la session. Vérifier la lecture OPFS et
   l'absence de réseau pour les ressources attendues, puis refaire le retour à textures chaudes.
4. **Réseau froid** : contrôle de l'arrivée des données et de la couverture progressive, après
   les cas locaux prioritaires. Ne pas attribuer les délais serveur au moteur.

Le passage réseau déjà observé n'acquitte aucun gate pack. Un simple retour visuellement couvert
n'acquitte pas le gate cache sans preuve de réutilisation. Si le pack n'est pas disponible dans
l'environnement accessible, laisser le verdict d'architecture ouvert jusqu'à ce contrôle.

Préparation commune :

1. Vérifier source locale, version servie, viewport, zoom, mode 2D/3D, droits Pro, preset réel,
   DPR effectif, GPU/backend, navigateur/OS, réseau, packs et origine des ressources.
   Exiger une carte couverte au repos et un état réseau cohérent avant chronométrage. Si le
   navigateur indique OFFLINE ou si les gestes changent involontairement le LOD, arrêter la
   comparaison et expliquer cette condition séparément ; voir l'observation initiale.
2. Prendre une zone publique fixe en Suisse, LOD 14, hors frontière, sans GPS personnel,
   route, Guidance ou REC. Noter le centre et la trajectoire des gestes.
3. Faire un déplacement horizontal, puis vertical, puis retour. Répéter trois fois les runs
   comparables ; garder les premières explorations séparées des répétitions chaudes.
4. Commencer avec le preset du signalement. Comparer ensuite Équilibré et Fluide, puis Maximum
   seulement sur les appareils adaptés. Endurance est un contrôle de simplification, pas un gain
   à qualité égale. Rejouer 2D et 3D séparément.
5. Utiliser une origine/profil de test isolé ou des zones nouvelles pour le froid. Ne jamais
   effacer les caches, packs, zones ou données personnelles existants. Un nouvel onglet seul ne
   garantit pas un cache vide ; le cache HTTP et le cache OS peuvent rester chauds.

| État                                      | Preuve à conserver                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| Réseau, ressources nouvelles              | Requêtes effectivement observées, durées, statuts et fournisseur ; froid non prouvé sinon |
| Pack local, images pas encore décodées    | Lecture OPFS réelle pour chaque couche attendue, pas de requête distante correspondante   |
| Cache persistant chaud après rechargement | Hits CacheStorage/pack distingués du cache HTTP, textures reconstruites                   |
| Retour immédiat, textures chaudes         | Réutilisation mémoire vérifiée et absence de nouveau décodage/chargement inutile          |

Ne pas acheter ou télécharger un pack entier juste pour amorcer ce diagnostic. Si aucun pack local
n'est disponible dans le profil de test, consigner ce scénario comme non testé et prévoir un petit
jeu de données local autorisé ou l'appareil déjà équipé.

## Phase B — Attribuer les délais

Instrumenter localement seulement après la reproduction, avec instrumentation désactivable et
preuve que son coût ne fausse pas les mesures. Utiliser un build de production local pour les
comparaisons chiffrées, pas les temps HMR du serveur de développement.

Pour chaque tuile, horodater : sélection, attente dans la file, lecture cache/pack/réseau,
décodage par ressource, calcul des normales, transfert worker, attente de construction,
construction du mesh, soumission texture, première image effectivement visible et fin du fondu.
Le retour de `render()` ne prouve pas la présentation GPU ; utiliser des traces/captures adaptées.

Mesures par scénario : première couverture utile, couverture 95 % de la surface cartographique
visible, détail cible 95 %, durée et surface des trous, réponse au geste, intervalles de frames
p50/p95/p99, tâches > 50 ms, octets/requêtes par source, pic mémoire et retour au repos.
Définir le masque de viewport hors panneaux avant de mesurer une couverture ; le nombre de meshes
seul ne suffit pas. Séparer première carte lisible et fin de tous les détails.

Relever textures actives/inactives, buffers et générations retenues en plus du heap JS ; annoncer
explicitement les compteurs estimés et les mesures indisponibles. Une capture de performance courte
ne prouve pas l'autonomie.

## Phase C — Expériences bornées

Choisir au maximum deux expériences selon le coût dominant identifié, une variable à la fois :

- rendre le fond prêt avant relief/overlay, en préservant altitude, solaire et passage 2D/3D ;
- séparer budgets de lecture locale, décodage et construction, avec limitation en octets en vol ;
- dédupliquer une ressource d'altitude partagée et éviter décodages/rechargements déjà satisfaits ;
- conserver une couverture grossière et améliorer le remplacement des tuiles/fondus ;
- si le rendu domine à données chaudes, réduire les soumissions ou comparer un chemin de rendu
  simplifié à qualité contrôlée.

Ne pas présenter un réseau plus rapide, un cache plus chaud, un DPR inférieur, un zoom moindre
ou des couches manquantes comme un gain d'architecture. Ne pas attendre toutes les tuiles sur fond
vide pour fabriquer artificiellement une apparition simultanée.

## Phase D — Décision et arrêt de l'évaluation

Point d'arrêt obligatoire après baseline attribuée et au plus deux expériences : produire le
tableau avant/après et une recommandation. Si l'environnement empêche de conclure, livrer les
preuves disponibles et le contrôle manquant ; ne pas prolonger une suite d'optimisations au hasard.

Cibles de travail proposées, à figer avant les expériences, pas promesses de la version actuelle :

- retour à textures chaudes : couverture utile 95 % en <= 250 ms ;
- pack local non décodé : couverture utile 95 % en <= 1 s ; détails complets mesurés séparément ;
- pendant les gestes : p95 d'intervalle entre images <= 33,3 ms, cible 16,7 ms sur matériel puissant ;
- aucun trou persistant après stabilisation ni crash/perte de contexte ;
- pic mémoire comparable : pas de hausse > 10 % sans décision explicite et explication ;
- après cinq allers-retours identiques : pas de croissance monotone inexpliquée de la rétention.

Pour le réseau froid, distinguer les délais fournisseur du délai interne après ressource reçue.
Rapporter les trois répétitions et la dispersion ; ne pas calculer un p95 fiable sur trois seuls
temps de chargement. Les percentiles de frames exigent une fenêtre et un nombre d'images suffisants.

| Conclusion des mesures                                         | Suite recommandée                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Attentes évitables dominantes, gains sans dépassement mémoire  | Correction ciblée dans l'architecture actuelle                           |
| Couplage 2D/3D et ordonnancement dominants                     | Refonte bornée du chargement en conservant Three.js                      |
| Carte minimale lente malgré données chaudes et coûts attribués | Prototype comparatif d'un moteur spécialisé sur les mêmes ressources     |
| Coût navigateur/WebView démontré à scène et données identiques | Étudier un composant cartographique natif, conserver les domaines métier |
| Soumission GPU ou calcul parallèle pertinent dominant          | Prototype WebGPU représentatif, backend réel et repli vérifiés           |

Un moteur alternatif doit être comparé sur les mêmes données, source, projection, caméra, détails
et budget mémoire, avec coût d'intégration des fonctions solaires/offline. Un résultat Google Earth
ou SuisseMobile reste une référence d'expérience utilisateur, pas un benchmark à charge identique.
Pour WebGPU, tester adaptateur/device réels, shaders terrain/ombres/météo et repli ; la présence
de `navigator.gpu` ne suffit pas. Aucun portage complet sur la seule base d'un exemple simplifié.

### Décision finale après les contrôles appareils

Les défauts reproduits se situent avant la soumission GPU : couverture hors écran insuffisante,
état `installed` pouvant masquer un fichier OPFS absent, archive v3 qui rend son relief et son
overlay inaccessibles, et canevas de secours conservé comme une tuile réussie. WebGPU ne peut
corriger ni une lecture locale absente, ni un index PMTiles invalide, ni une politique de cache qui
empêche une nouvelle tentative.

La décision est de terminer v5.89 dans Three.js/WebGL. Le writer, les états OPFS et les reprises
après erreur sont corrigés ; la reconstruction puis l'éventuelle publication du pack Suisse v4
restent un lot séparé. Un prototype WebGPU ne devient pertinent que si le rendu reste dominant une
fois les mêmes données valides déjà en mémoire. Les fonctions prévues après 5.89 peuvent avancer
en 5.90+, tandis qu'un futur numéro 6 doit correspondre à un gain d'expérience mesuré plutôt qu'à
un simple changement d'API graphique.

L'APK diagnostic Pro renforce cette décision. Sur A53, un retour vers une zone dont les textures
sont encore actives s'affiche dès la première capture et ne crée aucune nouvelle demande. Une zone
nouvelle montre au contraire un grand blanc et une médiane de première soumission de 1 582,1 ms,
avec huit couleurs issues du cache de navigation, quatre du CDN et 12 reliefs réseau. Le test de
reprise hors ligne a aussi remplacé automatiquement neuf fonds de secours, mais les ressources
distantes ont encore demandé 893,8 à 3 323,1 ms. Le chemin GPU n'est donc pas le coût dominant
démontré par ces essais. Le gain prioritaire vient d'une vraie lecture OPFS, d'une couverture
hors écran bornée et d'un fond parent pendant l'attente.

Le relevé mémoire impose toutefois de borner cette couverture. Sur deux séries de cinq
allers-retours, les pics PSS sont proches, 730 puis 739 Mo, et redescendent après 30 secondes à
590 puis 672 Mo. Un trajet visible déjà chaud ne recharge aucune tuile, mais le préchargement au
repos a créé 103 textures invisibles au LOD adjacent pendant sept secondes. La prochaine
expérience doit donc arbitrer le budget entre LOD adjacent et couronne au LOD courant, avec un
plafond d'octets en vol et des compteurs de cache ; augmenter simplement RANGE ou le nombre de
requêtes dégraderait la marge mémoire de l'A53.

L'expérience couleur seule départage maintenant plus directement le rôle du relief. Sur A53
Équilibré au LOD 14, le même déplacement horizontal passe de 3 337,0 à 366,1 ms à la médiane et
de 4 727,4 à 2 072,3 ms au p90 exploratoire lorsque les 27 reliefs réseau sont retirés du chemin
2D. Le PSS après mouvement passe de 548 679 à 404 957 Ko. Cela confirme qu'une refonte bornée du
chargement au-dessus de Three.js est plus pertinente qu'un portage WebGPU pour ce défaut.

Le pack Suisse v3 a ensuite été installé dans l'application diagnostic. Sa couleur est bien lue
depuis `country-pack-opfs`. Sur le même déplacement, le chemin complet descend à 1 074,4 ms de
médiane et la couleur seule à 253,6 ms ; le p90 passe de 1 619,8 à 482,4 ms. Le pack apporte donc
un gain réel, mais le relief réseau reste le verrou principal de la 2D.

La promotion partage maintenant la texture couleur entre les caches 2D et 3D et omet sa seconde
lecture lors du chargement terrain. Sur trois paires lancées dans des processus neufs, la médiane
du chemin actuel en 3D est de 895 Mo de PSS au premier relevé et 814 Mo après repos ; la transition
corrigée donne 619 puis 690 Mo. Les médianes Graphics passent de 664/601 à 416/481 Mo. Un passage
de transition a atteint 858 Mo avant de redescendre à 646 Mo après repos prolongé, ce qui impose
de conserver la surveillance des pics mais n'indique pas une fuite continue propre à la promotion.

Après l'acceptation visuelle du propriétaire sur A53, le comportement est activé par défaut dans
le code local. Les tests ciblés des fonctions qui consomment l'altitude passent. Le propriétaire
rapporte ensuite des essais réels positifs avec l'APK final sur A53 et S23. Le même paquet démarre
sur Tab S8. Sur Galaxy S7/Android 8, un contrôle court confirme la carte et la 3D sans le plantage
de l'ancienne version ; aucun essai en balade n'est revendiqué sur cet appareil. WebGPU reste hors
du chemin critique : le gain mesuré vient de la séparation des ressources et de leur réutilisation
dans le pipeline actuel.

## Phase E — Confirmation Android et livraison

**État au 2026-09-09 : gate appareil accepté.** Les mesures directes A53 et les contrôles
automatisés sont complétés par le retour terrain du propriétaire sur A53/S23 et par un contrôle de
compatibilité court sur S7. La Tab S8 constitue un contrôle de démarrage. Le test Brave/Intel HD et
les compteurs d'octets en vol restent utiles pour de futures comparaisons, mais ne remettent pas en
cause l'attribution du défaut ni le correctif retenu.

Le navigateur permet de reproduire et départager les hypothèses. Avant toute conclusion produit,
confirmer sur A53 Équilibré et un appareil puissant, preset effectif, batterie/thermique relevées.
Comparer Chrome et WebView sur le même appareil avec données/viewport/cache contrôlés ; relever
séparément Brave Intel HD et un éventuel contrôle RTX, sans changer le GPU du système implicitement.

Si le correctif touche les caches ou le cycle de rendu : contrôler hors ligne, transitions,
retour de veille, précision solaire et Guidance/REC. Préserver intégralement les archives.
Après code : `npm run check`, `npm test`, build/budget et tests ciblés selon `CLAUDE.md`.
Installation, commit, tag, push, release, upload et déploiement restent des actions distinctes.

## Séquence produit proposée après ce jalon

- 5.89 : évaluation et éventuels correctifs validés de réactivité cartographique.
- 5.90+ : répartir progressivement les périmètres aujourd'hui nommés 6.0 (outils locaux) et 6.1
  (lumière utile), après bilan et sans ajouter de charge permanente au rendu.
- Prototype WebGPU possible avant la fin de ces fonctions si les mesures le justifient.
- 6.0 : réserver la décision à un saut d'expérience démontré ; WebGPU n'est pas une condition
  obligatoire ni une promesse acquise. Compte/sync reste différé et indépendant.

Les anciens noms de prompts V6 sont conservés comme références de périmètre pendant cette
replanification ; ils ne valent plus engagement de numéro de livraison.
