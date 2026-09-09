# v5.89 — Progression du diagnostic des tuiles, 9 septembre 2026

Statut : travail local non commité. Un Galaxy A53 Android 16 a été contrôlé avec l'application
5.88.0 de production, puis avec une application diagnostic séparée passée en Pro par le
propriétaire. Le profil Fluide/S23 reste à contrôler ; aucune donnée de l'appareil n'a été effacée.

## Contrôle A53 avec le pack Suisse déclaré installé

Le panneau de l'application indique « Suisse HD, Détails 8–14, 664 MB, Installé » et le preset
Équilibré. Cette étiquette est une preuve d'état applicatif, pas encore une preuve que le fichier
OPFS correspondant existe : la version de production n'est pas débogable et son stockage privé
ne peut pas être inspecté directement.

À Grindelwald, LOD 14, un panoramique horizontal en ligne a montré une grande zone blanche à
environ 250 ms, puis une couverture complète entre les captures 250 et 750 ms. En mode hors ligne
forcé, un déplacement vertical a produit une grande zone bleu clair encore identique après plus de
trois secondes. Le bleu correspond exactement au canevas de secours `#c8dde3` créé lorsque la
couleur manque. Après retour en ligne, ce secours est resté affiché. Le propriétaire a ensuite
zoomé et déplacé la carte ; l'image est revenue au LOD 15. Ce geste change les clés et relance des
demandes, il ne prouve donc pas que la tuile LOD 14 initiale s'est réparée.

Preuves conservées :

- [panoramique LOD 14, vidéo](../../outputs/device-tests/a53-2026-09-09/suntrail-a53-pack-balanced-lod14-horizontal.mp4) ;
- [trou à 250 ms](../../outputs/device-tests/a53-2026-09-09/lod14-horizontal-t250ms.png) et [couverture à 750 ms](../../outputs/device-tests/a53-2026-09-09/lod14-horizontal-t750ms.png) ;
- [mode hors ligne, vidéo](../../outputs/device-tests/a53-2026-09-09/suntrail-a53-pack-balanced-lod14-cache-only-vertical-valid.mp4) et [secours encore présent à 3 s](../../outputs/device-tests/a53-2026-09-09/lod14-cache-only-vertical-valid-t3000ms.png) ;
- [carte revenue après le zoom/déplacement du propriétaire](../../outputs/device-tests/a53-2026-09-09/after-user-zoom-pan.png).

Deux défauts indépendants ont été établis dans le chemin pack :

1. l'état `installed` pouvait survivre à l'absence du fichier OPFS, puis `mountPack` basculait
   silencieusement vers le CDN. La synchronisation vérifie désormais chaque fichier et rétrograde
   l'état si le fichier manque ;
2. le pack Suisse v3 contient bien les 169 couleurs sondées autour de Grindelwald au LOD 14, mais
   aucune ressource relief/overlay sondée n'est lisible. Le writer encodait les grands identifiants
   100/200 milliards avec un décalage JavaScript limité à 32 bits, et l'en-tête annonçait un zoom
   maximal 14 alors que ces identifiants se convertissent en pseudo-zoom 19. Les deux points sont
   corrigés pour le prochain pack ; le builder refuse maintenant de terminer silencieusement avec
   des téléchargements manquants. Le pack v3 publié doit être reconstruit pour bénéficier de ces
   corrections.

Enfin, une couleur de secours n'est plus enregistrée comme une vraie tuile en mémoire. Au retour
du réseau, seules les tuiles visibles utilisant ce secours sont supprimées puis redemandées. Cela
vise précisément le comportement observé par le propriétaire, sans augmenter RANGE, le nombre de
chargements simultanés ni le plafond mémoire du preset Équilibré.

## Contrôle A53 avec l'application diagnostic Pro

L'APK diagnostic utilise le paquet séparé `com.suntrail.threejs.diagnostic`, version
`5.88.0-diagnostic` / code 908. Il a été installé par mise à jour après autorisation explicite,
sans désinstaller l'application ni effacer ses données. Le propriétaire a ensuite activé Pro.
L'essai a été exécuté en 2D, preset Équilibré, source Suisse et LOD 14.

Un panoramique vers une zone nouvelle reproduit nettement le défaut : 12 tuiles visibles sont
créées et soumises. Leur délai création → première soumission est de 1 582,1 ms à la médiane,
1 953,1 ms au p90 exploratoire et 2 479 ms au maximum. Huit couleurs viennent du cache de
navigation, quatre du CDN du pack et les 12 reliefs du réseau. La capture Android montre une
grande zone blanche au premier relevé, puis une couverture complète au relevé suivant.

Le retour vers une zone dont les textures sont encore en mémoire ne crée aucune nouvelle trace
et la carte est complète dès la première capture. Ce contraste est décisif pour l'attribution :
le WebView/WebGL sait afficher immédiatement la scène quand les textures sont déjà prêtes. Le
retard observé vient de la disponibilité, du décodage et de l'ordonnancement des ressources avant
le rendu, pas d'un plafond démontré de Three.js ou WebGL.

Le correctif de reprise a ensuite été validé sans geste utilisateur :

1. l'application a été forcée hors ligne, puis la caméra déplacée vers une zone partiellement
   absente ; trois tuiles couleur ont été trouvées dans le cache de navigation et neuf tuiles ont
   utilisé le fond bleu clair de secours ;
2. le mode en ligne a été rétabli sans zoom ni déplacement ; exactement neuf nouvelles demandes
   visibles ont été lancées automatiquement ;
3. ces neuf demandes ont lu la couleur depuis `country-pack-cdn` et le relief depuis le réseau,
   puis ont toutes atteint la première soumission. Les délais individuels vont de 893,8 à
   3 323,1 ms, avec une médiane de 1 948 ms.

Les noms `t100ms`, `t500ms`, etc. des captures indiquent le seuil visé avant la commande de
capture. La capture Android ajoute elle-même un délai important ; les temps internes ci-dessus
sont donc la référence quantitative. Visuellement, le fond bleu persistant disparaît bien sans
interaction après le retour en ligne.

Preuves conservées :

- [diagnostic du panoramique nord](../../outputs/v5.89-a53-diagnostic-2026-09-09/controlled-north-diagnostics.json),
  [zone blanche initiale](../../outputs/v5.89-a53-diagnostic-2026-09-09/controlled-north-t250ms.png)
  et [couverture suivante](../../outputs/v5.89-a53-diagnostic-2026-09-09/controlled-north-t750ms.png) ;
- [état hors ligne](../../outputs/v5.89-a53-diagnostic-2026-09-09/offline-recovery-before.json)
  et [fond de secours](../../outputs/v5.89-a53-diagnostic-2026-09-09/offline-recovery-before-t3000ms.png) ;
- [diagnostic après reprise](../../outputs/v5.89-a53-diagnostic-2026-09-09/offline-recovery-after.json)
  et [carte rétablie](../../outputs/v5.89-a53-diagnostic-2026-09-09/offline-recovery-after-t2000ms.png) ;
- [APK diagnostic](../../outputs/v5.89-a53-diagnostic-2026-09-09/suntrail-v5.88.0-v5.89-diagnostic-baseline.apk),
  SHA-256 `12E7D4363F2C7722B805FC45B509D5F838A9E239EAFDC95A32FD5867F19F4B58`.

Cette application diagnostic ne possède pas de pack pays OPFS confirmé. Aucune provenance
`country-pack-opfs` n'a été observée ; les lectures `country-pack-cdn` restent distantes. Le gate
du vrai pack local exige donc encore un pack Suisse reconstruit avec le writer corrigé.

### Mémoire pendant les allers-retours chauds

Les relevés Android `dumpsys meminfo` autour de deux séries de cinq allers-retours donnent :

| Point                                      |  PSS total |   Graphics |
| ------------------------------------------ | ---------: | ---------: |
| Avant les séries, après le test de reprise | 546 823 Ko | 371 499 Ko |
| Après 5 cycles, immédiat                   | 730 457 Ko | 545 079 Ko |
| Après 5 cycles et 30 s immobile            | 590 425 Ko | 404 295 Ko |
| Après 10 cycles cumulés, immédiat          | 738 743 Ko | 554 739 Ko |
| Après 10 cycles cumulés et 30 s immobile   | 671 788 Ko | 484 923 Ko |

Les pics des deux séries sont proches et une partie importante est rendue après 30 secondes ; ces
points ne prouvent donc pas une fuite continue. Le palier après repos augmente néanmoins et doit
rester un gate avant toute couronne supplémentaire.

Le contrôle suivant explique une partie de cette rétention. Après dix passages, un aller-retour
supplémentaire n'a créé aucune nouvelle tuile visible : le trajet était entièrement chaud. Durant
les sept secondes d'attente, le préchargement au repos a toutefois terminé 103 tuiles invisibles
et uniques au LOD adjacent, couleur et relief lus dans le cache de navigation. Le plafond final du
cache est borné, mais ces vagues de décodage et de textures font monter temporairement la mémoire.
Avant d'activer une couronne au LOD courant, il faut exposer les compteurs cache actif/inactif et
limiter le travail de fond en fonction des octets en vol, de la stabilité de la caméra et du coût
des LOD adjacents.

Relevés bruts :

- [avant les séries](../../outputs/v5.89-a53-diagnostic-2026-09-09/meminfo-after-offline-recovery.txt) ;
- [après 5 cycles](../../outputs/v5.89-a53-diagnostic-2026-09-09/meminfo-after-five-warm-cycles.txt)
  et [après repos](../../outputs/v5.89-a53-diagnostic-2026-09-09/meminfo-after-five-warm-cycles-idle30s.txt) ;
- [après 10 cycles](../../outputs/v5.89-a53-diagnostic-2026-09-09/meminfo-after-ten-warm-cycles.txt)
  et [après repos](../../outputs/v5.89-a53-diagnostic-2026-09-09/meminfo-after-ten-warm-cycles-idle30s.txt).

### Budget de préchargement préparé après le relevé

Le préchargement mobile possède maintenant un plafond distinct du cache complet : 8 entrées en
Endurance, 20 en Équilibré, 24 en Fluide et 32 en Maximum. Le preset Équilibré ne peut donc plus
enchaîner les vagues jusqu'aux 74 candidats LOD adjacents observés, ni accumuler l'union de 103
candidats pendant l'aller-retour mesuré. Sans l'expérience de couronne, le petit budget est
partagé entre LOD supérieur et inférieur. Avec la couronne explicitement activée, il est consacré
au LOD courant, directement utile au panoramique. Le travail de fond attend aussi deux secondes
sans interaction utilisateur.

Le snapshot diagnostic expose désormais les entrées actives/inactives, le nombre de textures, les
octets `pixelData` et une estimation des octets des images décodées appartenant au cache. Cette
estimation ne remplace pas `dumpsys meminfo` : elle ne mesure ni toutes les allocations WebView,
ni exactement la mémoire du pilote graphique.

Un second APK a été construit puis installé après autorisation, sans désinstallation ni effacement
des données : paquet `com.suntrail.threejs.diagnostic`, nom visible « SunTrail Diagnostic »,
version `5.88.0-diagnostic` / code 908. Artefact :
[APK budget préchargement](../../outputs/v5.89-a53-diagnostic-2026-09-09/suntrail-v5.88.0-v5.89-diagnostic-prefetch-budget.apk),
SHA-256 `0912F197BF5568457989F11E7215EDE0B04EA9B85C43A57EAD7360D6C1FBE04C`.

## Résultats du jour

### Expérience « couleur seulement » en 2D

L'expérience provisoire `fetchAs2D = zoom <= 10 || state.IS_2D_MODE` a supprimé le relief du
chemin 2D au LOD 14. Sur un panoramique exploratoire, 36 chargements ont commencé et 32 tuiles
ont atteint leur première soumission au rendu. Le délai création → première soumission était de
96,6 ms au minimum, 287,1 ms à la médiane, 435,6 ms au p90 exploratoire et 463,8 ms au maximum.
L'attente avant démarrage avait une médiane de 212,9 ms et un p90 de 377,4 ms. Les 36 ressources
étaient des couleurs `country-pack-cdn` ; aucun relief n'a été demandé.

Le gain est directionnel mais ne constitue pas un A/B propre : origine navigateur et état de
cache différaient du relevé initial du 8 septembre. Surtout, le retour 2D → 3D a échoué dans ce
run : la vue est devenue noire puis est retombée au LOD 5. Le worker avait bien recommencé à
demander le relief, mais le cache de tuile ne sépare pas actuellement le mode 2D à haute
résolution du mode 3D. Une entrée couleur seule peut donc remplacer l'entrée attendue par le
chemin 3D et déclencher une reconstruction instable.

L'expérience a été retirée du comportement normal. Avec le chargement 5.88 d'origine, le retour
2D → 3D a été refait à Grindelwald : relief visible, LOD 14 conservé, caméra stable. Toute future
expérience de couleur seule devra utiliser des entrées de cache séparées ou une promotion
explicite vers une tuile 3D complète.

### Mesure corrigée : créée n'est pas mise en file

L'instrumentation marquait auparavant `queued` dans le constructeur de `Tile`. Or le moteur
construisait la tuile avant de tester sa visibilité. Une grande partie des anciennes « tuiles
mises en file » étaient seulement des candidates rejetées immédiatement.

La trace distingue maintenant :

- `created` : objet `Tile` construit ;
- `queued` : objet réellement ajouté à `loadQueue` ;
- `load-started` : slot de chargement obtenu.

Sur un démarrage LOD 14 Équilibré, avant le filtre de construction :

| Mode              | Créées | Mises en file | Chargées | Première soumission |
| ----------------- | -----: | ------------: | -------: | ------------------: |
| 2D                |    352 |            99 |       99 |                  99 |
| 3D, après bascule |    949 |            36 |       36 |                  11 |

Le nombre élevé venait de passages répétés dans une grille de candidates, pas d'une file de
949 chargements. Il révélait néanmoins beaucoup d'allocations temporaires : boîtes 3D, vecteurs,
état de tuile et traces étaient créés avant le rejet de visibilité.

### Filtre de visibilité avant construction

Le test de frustum est désormais calculé à partir des coordonnées de la candidate avec une boîte
réutilisée. Un objet `Tile` n'est construit que si la candidate est visible ou appartient au
carré central forcé. La boîte reprend exactement les dimensions utilisées par `Tile.isVisible()`.

Même origine, même zone et même profil navigateur après modification :

| Mode              | Créées | Mises en file | Chargées | Première soumission |
| ----------------- | -----: | ------------: | -------: | ------------------: |
| 2D                |     99 |            99 |       99 |                  98 |
| 3D, après bascule |     36 |            36 |       36 |                  11 |

La construction inutile mesurée tombe donc de 253 objets en 2D et 913 objets pendant la bascule
3D sur ces runs. Le contrôle visuel 3D reste correct à Grindelwald au LOD 14. Ce changement réduit
le travail CPU et la pression du ramasse-miettes, mais ne suffit pas à supprimer la zone blanche
quand la caméra découvre des tuiles absentes.

### Panoramique reproductible et préchargement au repos

Le mode diagnostic possède maintenant quatre commandes invisibles qui déplacent exactement la
caméra de trois largeurs de tuile. Elles permettent de comparer la même translation sans dépendre
d'un geste manuel ou de la latence de l'outil de contrôle.

Un déplacement horizontal de référence, en 2D Équilibré au LOD 14, reproduit une grande bande
blanche. Il crée et charge 27 tuiles visibles. Première soumission au rendu : médiane 1 648,5 ms,
p90 exploratoire 2 912,4 ms, maximum 3 358,2 ms. Les ressources de ce run incluent 21 lectures
couleur `country-pack-cdn`, 27 lectures relief `network` et six lectures de cache de navigation.

Le préchargement existant présentait aussi une famine d'ordonnancement : son appel se trouvait
dans le bloc `needsUpdate`, qui n'est plus exécuté une fois la carte stable. L'appel a été déplacé
hors de ce bloc. Il s'exécute maintenant comme travail au repos toutes les deux secondes, tout en
respectant `getPrefetchBudget()` et les plafonds actuels de chaque preset.

Une première expérience au LOD courant préchargeait les coins encore absents de la grille active,
mais aucune des 27 tuiles du panoramique ne les réutilisait. Cette variante a été écartée. La
variante actuelle, activée seulement par `?tileSameLodPrefetch=1`, prépare une couronne d'une tuile
juste hors du RANGE courant. Sur le navigateur desktop, 48 tuiles composent cette couronne.

Après remplissage complet de la couronne, le même déplacement affiche presque toute la carte dès
la première capture. Les 27 tuiles visibles atteignent leur première soumission avec une médiane
de 121,4 ms, un p90 exploratoire de 308,5 ms et un maximum de 763,6 ms ; neuf tuiles réutilisent
directement les textures mémoire. Un contrôle effectué ensuite sans couronne, avec le même cache
HTTP devenu chaud, donne 248,7 ms à la médiane, 358,7 ms au p90 et 1 802 ms au maximum, sans hit
texture. Cette comparaison confirme l'intérêt de la réserve mémoire, mais reste séquentielle et
ne remplace pas trois répétitions ni le contrôle du pic mémoire.

La couronne reste un drapeau d'expérience. Elle peut occuper jusqu'au budget restant (21 entrées
si 99 tuiles visibles consomment déjà un cache mobile Équilibré de 120) et elle charge encore le
relief au LOD 14. Elle ne doit pas être activée par défaut avant le relevé A53/S23, le temps de
préparation réel et le test pack OPFS.

### Expérience A53 « couleur d'abord » avec cache 2D/3D séparé

L'expérience a été réintroduite derrière `?tileColorFirst2D=1` avec un contrat plus sûr : le
mode de données et la clé de cache sont capturés lors de la création de chaque tuile. Une tuile
couleur seule au LOD 14 utilise donc une entrée `2D` distincte et le retour en 3D supprime les
tuiles actives incomplètes avant de demander les données terrain. Le comportement normal reste
inchangé tant que le paramètre n'est pas présent.

Sur le navigateur local compilé, un A/B réseau froid a surtout montré que la lecture distante de
la couleur peut rester dominante : médiane 1 879 ms avec le chemin complet contre 2 017 ms avec
la couleur seule sur ce run. L'expérience réduit néanmoins fortement les données décodées du
cache, de 240 648 192 à 45 098 688 octets, et supprime `pixelData` en 2D.

Le même A/B sur le Galaxy A53, LOD 14, preset Équilibré, donne un résultat beaucoup plus marqué :

| Chemin                        | Médiane première soumission | p90 exploratoire | PSS après mouvement |   Graphics |
| ----------------------------- | --------------------------: | ---------------: | ------------------: | ---------: |
| 2D actuelle, couleur + relief |                  3 337,0 ms |       4 727,4 ms |          548 679 Ko | 355 671 Ko |
| 2D couleur seule              |                    366,1 ms |       2 072,3 ms |          404 957 Ko | 212 107 Ko |

Les 27 tuiles du chemin actuel ont lu la couleur depuis `country-pack-cdn` et le relief depuis le
réseau. Les 27 tuiles couleur seule n'ont demandé aucun relief. La médiane est divisée par environ
9,1 et la capture visuelle est complète dès le premier relevé de l'expérience. Un second passage
entièrement chaud ne crée aucune nouvelle trace dans les deux modes. Après ce retour chaud, le
PSS mesuré est de 546 369 Ko pour le chemin complet et 290 135 Ko pour la couleur seule.

Ce premier contrôle ne constituait pas encore le gate pack OPFS. Le propriétaire a ensuite
téléchargé le pack dans l'application diagnostic. Le fichier
`packs/switzerland.pmtiles` est présent dans son OPFS avec une taille de 697 135 687 octets et
l'état local annonce la version 3 installée. Un premier lancement automatisé est parti pendant la
fin de synchronisation et a encore lu le CDN ; le lancement suivant a prouvé la provenance
`country-pack-opfs` pour les 27 couleurs des deux scénarios.

Avec ce vrai pack local, le même A/B donne :

| Chemin                             | Médiane première soumission | p90 exploratoire | PSS après mouvement |   Graphics |
| ---------------------------------- | --------------------------: | ---------------: | ------------------: | ---------: |
| 2D actuelle, couleur OPFS + relief |                  1 074,4 ms |       1 619,8 ms |          574 482 Ko | 365 843 Ko |
| 2D couleur OPFS seule              |                    253,6 ms |         482,4 ms |          343 362 Ko | 132 303 Ko |

Le pack accélère donc le chemin actuel par rapport au contrôle CDN, mais le relief réseau garde
la carte en attente. Retirer ce relief du chemin 2D divise encore la médiane par environ 4,2. Les
deux retours chauds ne créent aucune trace ; leur PSS est respectivement de 552 194 et 314 853 Ko.

Le retour 2D → 3D est maintenant fonctionnel : la vue reste au LOD 14, le relief apparaît et
aucun écran noir durable n'est observé. Il reste cependant un gate mémoire. Le PSS monte à
771 032 Ko cinq secondes après la transition, puis redescend à 641 248 Ko après repos, contre
environ 546 Mo sur le chemin complet chaud. Lors du contrôle OPFS, le même retour atteint
747 599 Ko et 543 435 Ko de Graphics. Les caches séparés évitent la corruption logique mais font
coexister temporairement des ressources couleur 2D et terrain 3D.

Une promotion plus sobre est maintenant implémentée et contrôlée sur A53 : la tuile 3D reprend la texture
couleur déjà décodée par la 2D et ne redemande que les ressources terrain. Le cache compte les
propriétaires d'une texture partagée afin de ne la libérer qu'après la disparition des deux
entrées. L'image 3D reste correcte au LOD 14, sans tuile noire observée.

Trois paires ont été exécutées dans des processus neufs, en conservant le pack OPFS et en vidant
seulement CacheStorage. La médiane du chemin actuel en 3D est de 895 103 Ko de PSS et 663 531 Ko
de Graphics au premier relevé, puis 814 008 et 601 199 Ko après repos. La transition couleur
d'abord donne 619 440 et 415 667 Ko au premier relevé 3D, puis 689 840 et 481 219 Ko après repos.
La 2D légère se stabilise à une médiane de 314 577 Ko de PSS et 100 555 Ko de Graphics.

Le troisième passage de transition a brièvement atteint 857 901 Ko après 35 secondes, puis est
redescendu à 645 854 Ko et 438 807 Ko de Graphics après repos prolongé. Cette variabilité montre
une libération différée par le WebView ou le pilote ; elle ne montre pas une croissance continue.
La promotion ne crée donc pas la surcharge médiane initialement suspectée. Après l'acceptation
visuelle du propriétaire sur A53, la couleur d'abord est devenue le comportement 2D par défaut
dans le code local. Les caches 2D/3D séparés et la promotion restent actifs. Le contrôle ciblé des
modules carte, altitude, profil, inclinomètre, analyse solaire et connectivité passe 167 tests.
Un dernier APK diagnostic sans paramètre d'URL est construit pour l'essai réel A53 ; le contrôle
S23 reste un gate de non-régression avant publication, pas un blocage de cette validation.

Preuves :

- [comparaison A53 complète](../../outputs/v5.89-a53-diagnostic-2026-09-09/a53-pack-color-first-comparison.json) ;
- [chemin actuel à 250 ms](../../outputs/v5.89-a53-diagnostic-2026-09-09/a53-pack-baseline-east-t250ms.png)
  et [couleur seule à 250 ms](../../outputs/v5.89-a53-diagnostic-2026-09-09/a53-pack-color-first-east-t250ms.png) ;
- [retour 3D à 5 s](../../outputs/v5.89-a53-diagnostic-2026-09-09/a53-pack-color-first-return-3d-t5000ms.png) ;
- [comparaison navigateur](../../outputs/v5.89-a53-diagnostic-2026-09-09/browser-color-first-comparison.json) ;
- [APK diagnostic couleur seule](../../outputs/v5.89-a53-diagnostic-2026-09-09/suntrail-v5.88.0-v5.89-diagnostic-color-first.apk),
  SHA-256 `116B9F45901D8DDE82EBE12EA32F1823BBA024522042865C77F4331A36769767`.
- [APK diagnostic avec promotion couleur](../../outputs/v5.89-a53-diagnostic-2026-09-09/suntrail-v5.88.0-v5.89-diagnostic-color-promotion.apk),
  SHA-256 `4F99231BB6D49F2E8D33120F80316BB6F8470B0BB92ED6761DB3B5A1ADFB1B8D`, installé après autorisation ;
- [APK diagnostic couleur d'abord par défaut](../../outputs/v5.89-a53-diagnostic-2026-09-09/suntrail-v5.88.0-v5.89-diagnostic-color-first-default.apk),
  SHA-256 `E4E2DA7BC1C02B723392B7711193816A784C858B4B171021D8FCE5B63B293EEF`, construit, pas encore installé ;
- [synthèse des trois paires mémoire](../../outputs/v5.89-a53-diagnostic-2026-09-09/a53-fresh-memory-summary.json).

## Attribution actuelle

Le signalement ne ressemble pas à une limite de WebGL : une fois les textures prêtes, la
construction du mesh et la soumission au rendu sont courtes dans les traces disponibles. Les
causes dominantes observées sont en amont :

1. relief encore demandé en 2D haute résolution ;
2. concurrence limitée à six tuiles pendant une transition avec le preset Équilibré ;
3. absence de préchargement au même LOD dans la direction du déplacement ; une couronne bornée
   améliore fortement un contrôle chaud mais reste expérimentale ;
4. absence de fond parent conservé pour couvrir la nouvelle bordure pendant un panoramique ;
5. lectures réseau du relief dans le cas sans pack local.

Le préchargement actuel porte sur les LOD adjacents, pas sur une couronne hors écran au LOD
courant. Cela explique qu'une vue au repos puisse être complète puis révéler du blanc dès le
premier déplacement. Les moteurs cartographiques spécialisés masquent généralement cette attente
avec une réserve hors écran et/ou une tuile parent temporaire.

## Validation effectuée

- Tests ciblés après la promotion couleur : 93 tests passés.
- Suite complète après la promotion couleur : 157 fichiers et 1 783 tests passés. Les deux
  avertissements Happy DOM connus
  sur `/src/main.ts` restent présents et la commande termine avec le code 0.
- TypeScript : passé.
- Prettier et ESLint sur `src` : passés.
- Builds web et Capacitor, synchronisation Android et assemblage debug : passés.
- Budget PWA : 2,36 MiB, passé.
- Contrôle navigateur : 2D et retour 3D au LOD 14, relief et caméra corrects avec le comportement
  d'origine et avec le filtre de candidates.
- Panoramique automatique : défaut reproduit, préchargement au repos réparé et comparaison
  exploratoire de la couronne au LOD courant effectuée.
- A53 diagnostic Pro : zone nouvelle lente mais retour à textures chaudes immédiat ; reprise
  automatique de neuf fonds de secours validée sans zoom ni déplacement.
- Mémoire A53 : pics proches après 5 et 10 cycles, mais palier au repos encore croissant ; 103
  préchargements invisibles au LOD adjacent observés pendant un aller-retour déjà chaud.
- Correctif local suivant : budget de fond Équilibré limité à 20 entrées, délai stable de deux
  secondes et compteurs de cache intégrés au diagnostic. APK distinct installé après autorisation.
- Expérience couleur seule avec cache 2D/3D séparé : build web et build
  Capacitor passés, APK Android assemblé et installé après autorisation. Sur A53, médiane
  3 337,0 → 366,1 ms et forte baisse mémoire en 2D ; retour 3D fonctionnel mais pic mémoire encore
  trop élevé pour une activation générale.
- Pack Suisse installé dans le paquet diagnostic : fichier OPFS de 697 135 687 octets et
  provenance `country-pack-opfs` prouvée pour les couleurs. Sur le même mouvement, le chemin
  complet passe à 1 074,4 ms et la couleur seule à 253,6 ms de médiane.
- Promotion couleur 2D → 3D : 93 tests ciblés et 1 783 tests complets passés ; contrôles statiques,
  build web/Capacitor, budget PWA et assemblage Android passés. APK installé après autorisation,
  image 3D correcte et trois paires mémoire exécutées en processus neufs.
- Activation 2D par défaut dans le code local : 167 tests ciblés des modules carte et altitude,
  1 783 tests complets, contrôles statiques, build Capacitor, budget PWA et assemblage Android
  passés. L'APK final de diagnostic a été installé après autorisations séparées sur A53, S23,
  Tab S8 et Galaxy S7.
- Après les correctifs pack/reprise : TypeScript, Prettier, ESLint, build production et budget PWA
  2,36 MiB passés. Les tests couvrent maintenant les varints supérieurs à 32 bits, l'état OPFS
  absent, le secours non mis en cache et sa nouvelle demande au retour en ligne.

### Clôture de la candidate 5.89.0

- Le propriétaire rapporte des essais réels positifs sur A53 et S23. Sur Galaxy S7/Android 8, la
  carte et la 3D fonctionnent lors d'un contrôle court alors que l'ancienne version plantait ; ce
  contrôle S7 n'est pas présenté comme un essai en balade. La Tab S8 valide l'installation et le
  démarrage du paquet diagnostic.
- Métadonnées alignées sur npm `5.89.0`, Android `versionName 5.89.0` et `versionCode 909`.
  Le code 909 reste provisoire avant contrôle du maximum global dans la Play Console.
- Rejeu final : `npm run check`, 157 fichiers/1 783 tests, build Web, budget PWA 2,36 MiB, audit
  i18n, build Capacitor et synchronisation Android passés. Gradle termine 854 tâches avec tests,
  lint, APK debug et AAB release signé localement.
- Le smoke Playwright courant a d'abord rencontré `spawn EPERM`, puis le lanceur est resté bloqué
  avant la première assertion malgré un serveur Vite prêt. Il est exclu des preuves de cette passe ;
  aucune assertion produit n'a échoué.
- Artefacts locaux :
  [APK diagnostic](../../outputs/v5.89-release-candidate-2026-09-09/suntrail-v5.89.0-diagnostic.apk)
  et [AAB release signé](../../outputs/v5.89-release-candidate-2026-09-09/suntrail-v5.89.0-release.aab).

Le lanceur `npm` de la machine cherche actuellement un module global absent. Les mêmes commandes
ont été exécutées directement avec les outils locaux de `node_modules`; ce problème de machine
n'est pas attribué à SunTrail.

## Suite

1. Contrôler en 2D les fonctions qui peuvent consommer l'altitude, notamment l'inclinomètre, le
   profil, les analyses solaires et les informations de position, avant d'activer la couleur
   d'abord par défaut.
2. Rejouer la comparaison sur le S23 et sur Brave/Intel HD ; mesurer séparément la latence des
   tuiles et la mémoire, sans mélanger les environnements.
3. Répéter trois fois le contrôle chaud avec et sans couronne, puis mesurer son temps de préparation
   et la mémoire retenue sur un viewport mobile.
4. Reconstruire d'abord le pack Suisse avec le writer corrigé, puis exécuter le gate décisif :
   provenance `country-pack-opfs`, aucune lecture distante correspondante, puis retour mémoire.
5. Mesurer sur A53 la mémoire avec/sans couronne et répéter les panoramiques ; rejouer ensuite sur
   S23 et Brave/Intel HD avant la décision d'architecture définitive.
