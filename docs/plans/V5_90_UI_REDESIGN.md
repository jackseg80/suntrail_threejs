# SunTrail 5.90 — refonte cohérente de l'interface

Date : 2026-09-10. Mise à jour : 2026-09-12. Base vérifiée : `main`, `91a82ff3`,
application 5.89.1 / Android 910.

**Statut : direction validée par le propriétaire le 2026-09-10. Première tranche du pilote
Préparer et premières tranches du comportement commun implémentées localement puis validées sur
Galaxy S23 en Free/Fluide : Réglages, Pro, Couches, Météo, SOS et Bibliothèque vide puis remplie
avec un GPX réel, Sortie et guidage actif. Les autres appareils, droits et contextes de terrain
restent requis pour la qualification finale. La migration visuelle groupée de Réglages, de l'offre
Pro, de Connexion, de Packs, de Couches, de l'inclinomètre et de Météo est aussi rejouée sur le S23
en Free puis Pro, Fluide, police Android 115 % et densité 420.**
Ce document remplace les propositions provisoires de cette conversation, notamment une éventuelle
suppression générale du masquage automatique. Il ne constitue pas une validation de release.

**Correction d'avancement du 2026-09-11 :** les validations précédentes prouvent les parcours et
comportements décrits, mais ne clôturent pas le lot 1. La barre supérieure, les outils carte, les
en-têtes, les dialogues et certaines surfaces héritées doivent encore être migrés et qualifiés comme
un seul langage visuel. Le code ne doit plus présenter la première passe fonctionnelle comme une
refonte graphique globale terminée.

### Avancement du pilote Préparer

- Configuration possède maintenant un titre, une fermeture explicite et un corps défilant sous
  un en-tête stable ; Points et Configuration retirent de l'interaction les outils carte placés
  derrière eux.
- Les barres restent visibles pendant Points, Configuration, Profil et déplacement d'un point ;
  le masquage après 10 secondes reste actif sur la carte au repos.
- Android Retour et Escape ferment dans le même ordre : déplacement, panneau, profil, puis mode
  Préparer. Ils ne quittent plus directement l'application depuis ce contexte.
- Le profil est ancré et n'accepte plus aucun déplacement ni glissement de fermeture. Chaque
  ouverture efface aussi une éventuelle ancienne position hors écran. Son SVG est redessiné lorsque
  la transition d'agrandissement atteint sa taille finale.
- L'analyse solaire ouverte depuis le profil masque celui-ci et remplace la croix par un retour ;
  la fermeture restaure le profil sans superposition.
- Les surfaces de Préparer sont presque opaques en Fluide/Maximum, opaques sans flou en Endurance,
  et les classes de preset sont nettoyées à chaque changement.
- Les feuilles communes utilisent un titre blanc et réservent l'accent doré au solaire et à Pro ;
  Recherche utilise le bleu pour son filtre actif. Connectivité → Packs est maintenant une vraie
  navigation parent/enfant : la flèche, Android Retour et Escape reviennent à Connectivité en
  restaurant son défilement et son focus, puis le retour suivant ferme la feuille.
- Réglages conserve trois accès courts et lisibles à 115 % : Essentiels, Carte et Avancé.
  Essentiels et Carte suivent le défilement manuel ; Avancé ouvre désormais une page dédiée qui
  retire les réglages techniques de la page principale. Sa flèche, Android Retour ou Escape
  restaurent Réglages à la position et au focus précédents. L'offre Pro s'ouvre aussi comme une sous-vue de Réglages :
  Plus reste sélectionné et la flèche, Android Retour ou Escape restaurent la position et le focus
  précédents au lieu de perdre le contexte.
- Réglages masque désormais Compte lorsqu'aucune action authentifiée n'est disponible et commence
  directement par le profil de performance. Sa carte Pro ne répète plus le catalogue commercial :
  elle conserve les trois options réellement réglables et une seule entrée vers l'offre. Dans cette
  offre, les formules, la restauration et les liens légaux précèdent le détail des fonctions.
- Connexion sépare clairement état réseau, mode hors ligne, cartes téléchargées et actions de cache.
  Packs devient une ligne de navigation et l'import PMTiles reste disponible dans un détail
  technique replié. Packs et Couches utilisent les mêmes cartes, boutons, états et focus clavier ;
  les avertissements ne doublent plus leur sens avec une icône décorative.
- Couches, Météo et SOS utilisent le même contrat de fermeture. Satellite ouvre Pro comme une
  sous-vue de Couches et la flèche restaure le panneau parent. SOS possède maintenant l'en-tête
  commun, garde deux actions principales distinctes, neutralise SMS pendant une nouvelle
  localisation et traduit ses états dans les quatre langues.
- Bibliothèque retire les explications et titres répétés, place Créer et Importer côte à côte et
  remet chaque ouverture en haut. Un GPX importé puis préparé apparaît comme un seul parcours :
  nom lisible, métriques, Suivre et Ouvrir au premier niveau ; bilan et actions secondaires sont
  regroupés sous « Préparation et options ». Le fichier GPX complet reste stocké et exportable
  depuis ces options en Pro. Un import ancien ou interrompu sans parcours préparé reste visible
  avec l'état « À préparer » et l'action « Créer l'itinéraire » jusqu'à sa conversion.
- Sortie reprend le même nom de parcours lisible que Bibliothèque et le bandeau Préparer, sans
  modifier le nom stocké. Avec une route consultée, Suivre est la seule action de la carte ; le
  changement de parcours passe par l'onglet Bibliothèque et Profil reste disponible pendant le
  guidage actif. REC reste une action indépendante et visuellement distincte sous la carte. Quitter
  Préparer ferme aussi son profil afin qu'il ne reste pas visible derrière une autre destination.
- Le guidage actif affiche le nom lisible et conserve trois hauteurs sans geste caché : le panneau
  normal propose Bandeau et Détails, le panneau détaillé Bandeau et Réduire, puis le bandeau minimal
  propose Agrandir. La languette « Glisser » et le glissement vertical ont été retirés. Le panneau
  propose trois commandes : Profil, Enregistrer et Arrêter le guidage. L'ancienne pause du guidage a
  été retirée du panneau et de la notification : elle suspendait seulement le guidage tandis que REC
  continuait, ce que le propriétaire a jugé ambigu. Lorsqu'un REC est actif, le panneau remplace la
  ligne d'actions par Pause/Reprendre REC et Terminer la sortie ; cette pause suspend réellement
  l'enregistrement et sa durée tandis que le guidage continue. L'arrêt possède une hiérarchie visuelle distincte ; le second arrêt,
  utile uniquement pendant un guidage combiné à REC, n'apparaît plus pendant un guidage seul. Le
  profil utilise les mêmes dimensions de commandes et un retour explicite vers le guidage. Le texte
  Android du panneau détaillé a été raccourci.
- Compilation TypeScript, formatage, lint, build Web/Capacitor, budget de paquet, audit i18n,
  1 813 tests et scénario Chromium Préparer passent. Les nouvelles clés sont présentes dans les
  quatre langues ; l'audit ne signale aucune clé statique manquante.
- L'APK `5.89.1-diagnostic` / 910 a été installé dans le paquet séparé
  `com.suntrail.threejs.diagnostic` sur le S23. En Free, Fluide, thème Auto, police Android 1.15
  et densité 420, Configuration et Points gardent les deux barres après 10 secondes, masquent le
  rail cartographique et se ferment correctement avec Retour Android. Sur un parcours temporaire
  de 0,24 km, le profil compact/agrandi, son redimensionnement final, la sous-vue Analyse et son
  retour vers le profil ont été contrôlés. L'application de production et ses données n'ont pas
  été remplacées.
- Le retour propriétaire suivant a confirmé l'agrandissement, le retour Analyse → Profil et les
  presets. Trois défauts ont ensuite été corrigés et rejoués sur le même S23 : profil immobile et
  récupérable après appuis longs dans les deux directions, titre/croix de Configuration visibles
  avec le clavier grâce au retrait temporaire des indicateurs supérieurs, et boutons
  Annuler/Rétablir alignés sur le style secondaire de l'application. Retour Android ferme le
  clavier puis le panneau et rend le contexte Préparer.
- Sur la révision finale installée, Connectivité, Packs et Recherche ont été contrôlés visuellement
  sur ce même S23. Packs affiche une flèche lorsqu'il vient de Connectivité ; Retour Android revient
  au parent puis ferme la feuille au second appui. Recherche affiche un titre blanc et le filtre
  actif en bleu. Aucun téléchargement de pack n'a été lancé.
- Sur la révision suivante, les catégories compactes de Réglages, le saut vers Carte, l'ouverture
  de Pro, la conservation de Plus et le retour exact vers la position précédente ont été contrôlés
  sur le S23 avec la flèche et Retour Android. Aucun achat n'a été lancé.
- Couches, Couches → Pro → Couches, Météo et SOS ont ensuite été contrôlés visuellement sur le S23.
  Le GPS SOS s'affiche, le bouton Fermer rend la carte et aucun SMS ni achat n'a été lancé. Deux
  téléchargements de packs ont été déclenchés par une erreur de coordonnées pendant l'automatisation :
  Suisse a été annulé, France Alpes a terminé puis a été supprimé. L'état final vérifié est de
  nouveau « Aucun pack installé ».
- Bibliothèque a ensuite été contrôlée en Free/Fluide avec le GPX réel « Barrage de Rossens… ».
  La mise à jour conserve ses données, affiche une seule carte au lieu des deux représentations
  techniques précédentes et garde le bilan replié au repos. Le volet développé a été inspecté sans
  déclencher Suivre, Ouvrir, export, suppression ni téléchargement de corridor.
- Le même GPX a été ouvert puis contrôlé dans Sortie. Les underscores ne sont plus affichés, les
  raccourcis Profil/Bibliothèque redondants ont été retirés et Suivre reste la seule action de la
  carte. REC reste séparé. Le profil de Préparer se ferme lors du changement de destination.
- Un guidage actif sur ce GPX a ensuite été contrôlé sans déplacement réel du téléphone : états
  compact et détaillé, Détails/Réduire, libellés des trois actions et Profil → Retour.
  Le service natif a aussi repris la session après réinstallation du paquet diagnostic. REC n'a pas
  été lancé et cette reprise observée ne remplace pas le protocole terrain complet.
- Après retour propriétaire, Pause a été retiré du guidage affiché et de sa notification. Le panneau
  compact réorganisé à trois actions a été recompilé, réinstallé et contrôlé sur le S23 sans arrêter
  la session native récupérée.
- Après clarification sur les trois réductions, la languette et le glissement vertical ont été
  remplacés par les commandes explicites Bandeau, Détails/Réduire et Agrandir. Les trois états ont été
  parcourus sur le S23 Free/Fluide avec la session native récupérée, sans lancer REC ni arrêter le
  guidage.
- Après le dernier retour propriétaire, Ouvrir a été renommé Agrandir dans le bandeau minimal et
  Retour au guidage a été raccourci en Retour dans le profil. Le libellé long reste utilisé par les
  lecteurs d'écran. L'APK diagnostic a été reconstruite, installée et les deux rendus ont été
  contrôlés sur le S23 sans lancer REC.
- La vraie Pause/Reprendre REC a ensuite été validée physiquement sur le S23 en Free/Fluide : durée
  active figée pendant la pause, plusieurs alternances pause/reprise, maintien après passage en
  arrière-plan, reprise sans saut signalé par le propriétaire et récapitulatif STOP cohérent
  (2:38 actives, 0,07 km, 12 points). La trace de diagnostic a été supprimée après le contrôle.
- La même commande Pause/Reprendre REC est désormais disponible dans Guidance lorsqu'une session
  combinée est active. Elle reste absente en guidage seul et ne modifie jamais l'état du guidage.
  Le comportement et les deux libellés sont couverts par le test du panneau ; le propriétaire a
  également confirmé son fonctionnement sur le S23 dans une session Guidance + REC. La série finale
  compte 1 817 tests réussis.
- Le cœur Pro a été rejoué sur le S23 en Fluide : panneau Pro Actif, fonctions cartographiques
  cochées, Satellite activé sans paywall et prévisions météo des trois jours déverrouillées. Ce rejeu
  a révélé les libellés horaires Sunrise/Sunset encore écrits en dur. Ils utilisent désormais les
  traductions des quatre langues ; l'APK corrigée affiche Coucher sur le S23. Les transitions
  Maximum → Fluide et Clair → Auto ont aussi été contrôlées : sélection et profil interne reviennent
  immédiatement au bon état, tandis que les panneaux restent lisibles avec la transparence Fluide.

## 1. Objectif et décision recommandée

Rendre les fonctions existantes plus simples à trouver, comprendre et utiliser, avec une interface
rapide, lisible et cohérente. Refaire proprement les composants UI hérités lorsque nécessaire,
par familles successives. Conserver les moteurs carte, GPS, REC, Guidance et stockage.

Les presets Fluide et Maximum conservent un verre discret sur les feuilles, avec une surface presque
opaque et un voile de fond suffisant pour empêcher les libellés de carte et le HUD de se mélanger aux
réglages. Endurance reste opaque et sans flou.

Recommandation : conserver les cinq destinations Explorer, Préparer, Sortie, Bibliothèque et Plus,
et remplacer les systèmes de panneaux concurrents par quatre modèles communs. La première étape
doit prouver la direction sur Préparer : Points, Configuration, Profil et Analyse solaire.

Les fonctions expertes restent accessibles par développement explicite. Ni le preset matériel,
ni le niveau Free/Pro ne doivent changer la logique de navigation. Les nouveaux outils experts,
le compte/sync et les nouvelles fonctions lumière ne sont pas ajoutés au périmètre de cette refonte.

## 2. Preuves, contexte et limites de l'audit

### S23 réellement inspecté

- Galaxy S23 SM-S911B, application installée 5.89.1 / 910, utilisateur en **Free**.
- Écran physique 1080 × 2340 ; densité physique 480, surcharge Android 420.
- `font_scale` Android lu à **1.15**. Cela ne prouve pas que chaque texte de la WebView est rendu
  exactement à 115 %. Ne pas reprendre 110 % comme mesure de cette session S23.
- Thème Auto, rendu sombre observé. Preset Fluide ; comparaison ponctuelle avec Équilibré,
  puis retour à Fluide au cours de l'audit.
- Brouillon manuel à deux points, environ 0,88 km. Configuration, clavier et défilement,
  Points, profil compact/agrandi, analyse solaire, Plus, Bibliothèque vide puis remplie avec un GPX,
  Sortie au repos, guidage actif statique et météo ont été observés. Le brouillon n'a pas été
  enregistré, effacé ou modifié par l'agent.
- Le propriétaire décrit le calcul et l'ouverture du profil comme rapides sur S23.
  C'est un témoignage d'usage, pas une mesure de latence ou de consommation.
- Les dernières captures ont été prises après pilotage direct du téléphone, immédiatement après
  interaction. Le téléphone a été laissé sur le guidage compact du GPX réel.

### Correction du protocole de capture

Les deux barres inférieures disparaissent après environ 10 secondes sans interaction. Les premières
captures après un message « prêt » montraient souvent l'état au repos. Leur absence ne démontre
donc ni une perte de commandes ni une impossibilité d'utiliser l'interface.

Pour la suite : réveiller les commandes, attendre leur courte transition, puis capturer dans la
même séquence. Comparer séparément état actif, état au repos après 10 secondes, clavier et geste
sur carte. Ne plus demander au propriétaire de préparer chaque capture manuellement.

### Ce qui n'est pas validé par cette session

A53, paysage, TalkBack, autres presets Pro, reprise native complète et
performance quantitative restent à tester pour la refonte. Le contrôle S23 du pilote utilise des
parcours diagnostics sur table, pas une sortie terrain. Aucun défaut moteur ne peut être déduit de
la seule inspection visuelle. Les validations historiques 5.89.1 restent une baseline, pas une
preuve de conformité de la future UI.

## 3. Inventaire des systèmes actuels

Les références ci-dessous décrivent le code 5.89.1 inspecté ; elles servent à délimiter la migration.

| Famille actuelle        | Entrées et actions                                                                                         | Ouverture, fermeture et niveaux                                                                                                 | Responsive et difficulté                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Feuilles `SheetManager` | Réglages, couches, recherche, Sortie/Bibliothèque, météo, sonde solaire, SOS, connectivité, packs, upgrade | Une feuille active, croix/overlay/Escape/glissement ; pas de pile de retour parent commune                                      | Feuille mobile, rail à partir de 900 px ; hauteur et défilement génériques peu adaptés à tous les contenus |
| Points                  | Bandeau Préparer ; centrer, déplacer, réordonner, supprimer, effacer, annuler/rétablir                     | Panneau propre avec fermeture, exclusif de Configuration                                                                        | Commandes carte visibles derrière le panneau translucide sur S23                                           |
| Configuration           | Bandeau Préparer ; nom, activité, boucle/inversion, données, détails, favori, sauvegarde                   | Panneau propre, bascule par déclencheur et fermeture extérieure/Escape ; pas de titre/croix explicites comparables aux feuilles | Défilement nécessaire avec clavier ; sauvegarde accessible après défilement, donc pas de blocage établi    |
| Profil                  | Bandeau Préparer ; courbe, analyse, agrandir, fermer                                                       | Compact/agrandi ; mécanisme de déplacement hérité                                                                               | Réserve un espace aux boutons carte sur S23 ; défaut de redimensionnement constaté                         |
| Timeline et coordonnées | Outils carte                                                                                               | Panneaux déplaçables : maintien, déplacement, double toucher de réinitialisation, glissement de fermeture                       | Gestes difficiles à découvrir ; positions libres à gérer sur rotation et grandes polices                   |
| Guidance                | Sortie/suivi ; progression, détails et arrêts                                                              | Trois niveaux commandés par Bandeau, Détails/Réduire et Agrandir ; retour depuis profil                                         | Contrat terrain à préserver ; pas de nouvel essai actif pendant cet audit                                  |
| Dialogues               | Confirmation, remplacement/récupération du brouillon, fin REC, nom/renommage                               | Plusieurs implémentations et règles de focus distinctes                                                                         | Priorités de boutons, clavier et retours à harmoniser sans abandon implicite                               |
| Barres et outils carte  | Statut, navigation, bandeau Préparer, GPS, couches, 2D/3D, inclinomètre                                    | Masquage au repos et pendant certains gestes ; commandes contextuelles                                                          | Distinguer masquage volontaire et conflit de panneaux ; conserver les trois états GPS                      |

Sources principales : `app.html`, `src/style.css`, `src/modules/appInit.ts`,
`src/modules/ui/core/SheetManager.ts`, `src/modules/ui/mobile.ts`, `src/modules/ui/autoHide.ts`,
`src/modules/ui/draggablePanel.ts`, `src/modules/profile.ts`, `src/modules/performance.ts`,
les feuilles dans `src/modules/ui/`, `GuidanceForegroundService.ts`, les traductions et flags actifs.

## 4. Constats et conséquences pour le plan

| Constat                                                                                                                                       | Niveau de preuve                                                                                                | Décision de conception / vérification                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Le profil agrandi laisse la courbe tassée dans la partie haute, même après stabilisation                                                      | Observé sur S23 ; code : redessin après double animation frame tandis que la hauteur CSS transite pendant 0,3 s | Redessiner selon la taille réelle stabilisée/observée du conteneur ; confirmer la cause par reproduction avant correction                |
| Points et Configuration laissent voir la carte et des commandes derrière le contenu ; Analyse solaire laisse apparaître le profil sous-jacent | Observé sur S23 en Fluide                                                                                       | Un panneau de travail lisible ; sous-vue solaire avec retour au profil, sans accumulation visuelle de panneaux                           |
| Plus devient beaucoup plus opaque en Équilibré qu'en Fluide                                                                                   | Comparaison visuelle S23 et règles de presets dans le code                                                      | Garder des effets gradués, avec opacité protectrice pour les textes et formulaires même sur matériel puissant                            |
| Les feuilles suspendent l'auto-hide, mais Points/Configuration/profil suivent un autre mécanisme                                              | Code et captures actives/au repos                                                                               | Centraliser les règles selon l'activité ; ne pas supprimer globalement l'auto-hide                                                       |
| Configuration manque d'un repère titre/fermeture commun ; sauvegarde présente aussi dans le bandeau                                           | Code et S23                                                                                                     | Titre, retour/fermeture cohérents ; une commande principale de sauvegarde dans le contexte actif, accès équivalent conservé hors panneau |
| Le clavier réduit l'espace mais la sauvegarde reste atteignable en défilant                                                                   | Observé sur S23                                                                                                 | Protéger titre/retour et accès aux actions ; tester la mise en page, ne pas déclarer l'écran inutilisable                                |
| Nom de brouillon technique, informations ORS/SAC et nombreuses métriques dans Configuration                                                   | Observé sur S23                                                                                                 | Nom lisible, résumé essentiel puis détails ; conserver les explications et états inconnus sans jargon au premier niveau                  |
| Bibliothèque vide répète plusieurs indications de création/import                                                                             | Observé uniquement à vide                                                                                       | Un état vide concis avec action principale claire ; audit distinct du catalogue rempli                                                   |
| Sortie au repos privilégie une grande carte de préparation tandis que REC est séparé                                                          | Observé sur S23 ; hiérarchie à tester avec des utilisateurs                                                     | Clarifier le choix suivre un parcours / enregistrer une sortie ; ne pas confondre Sortie et catalogue                                    |
| `Sunset` apparaît dans la météo française                                                                                                     | S23 et libellés codés dans WeatherSheet                                                                         | Utiliser les traductions lever/coucher dans les quatre langues                                                                           |
| Android Retour gère la feuille active sans coordonner tous les panneaux indépendants                                                          | Code                                                                                                            | Un ordre de retour commun : sous-vue, panneau, destination ; ne jamais sortir de Préparer et perdre le contexte par effet secondaire     |
| Certaines confirmations acceptent Entrée globalement sans respecter le bouton focalisé ; focus non unifié                                     | Code                                                                                                            | Dialogue commun accessible ; Entrée active le contrôle focalisé, focus contenu/restauré et annulation explicite                          |
| Les déplacements libres reposent sur des gestes cachés                                                                                        | Code ; difficulté utilisateur non mesurée                                                                       | Ancrer profil/timeline/coordonnées ; conserver le déplacement quand il est fonctionnel, notamment la cible inclinomètre                  |
| Les blurs et couleurs de plusieurs composants contournent les règles communes                                                                 | Code                                                                                                            | Inventorier puis supprimer les exceptions au fil de la migration des familles                                                            |
| Analyse solaire affiche « données de relief non chargées »                                                                                    | Observé en Free sur ce brouillon                                                                                | État indisponible explicite et sortie claire ; ne pas l'attribuer au forfait ni conclure à un défaut solaire sans diagnostic             |

La courbe et le D+/D- nul ne prouvent pas une incohérence de calcul : l'échelle graphique et les
seuils de calcul doivent être examinés avant toute conclusion. Cette refonte ne change pas ces moteurs.

## 5. Trois concepts comparés

| Concept                                                           | Navigation et modèles                                                                                    | Règles et visibilité                                                                                                                       | A53/S23, avantages, risques et coût                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A — cinq destinations, panneau de travail commun (recommandé)** | Navigation actuelle ; panneau ancré, bandeau terrain, carte contextuelle, dialogue de décision           | Un travail principal visible ; compact/détails, retour parent et fermeture explicites ; masquage carte contextuel ; expertise dans détails | Même logique sur les deux appareils, effets selon preset ; migration progressive de coût moyen, faible rupture des habitudes ; coordination des anciens événements à sécuriser |
| B — trois destinations et tiroir d'outils                         | Explorer, Sortie, Bibliothèque ; Préparer/Plus dans un tiroir ; mêmes modèles de contenus                | Moins d'onglets visibles, mais détour pour créer/modifier une route ; tiroir explicite, pas de gestes obligatoires                         | Économise de la largeur sur A53 ; bénéfice moindre sur S23 ; risque de cacher Préparer et d'augmenter les hésitations ; coût élevé de navigation/tests                         |
| C — écrans dédiés par tâche                                       | Destinations conservées, préparation et analyse sur écrans complets ; carte et petits outils contextuels | Retour explicite à la carte ; formulaires amples, détails dépliables ; moins de superpositions                                             | Lisibilité favorable aux grandes polices sur les deux appareils ; moins de contexte carte pendant l'analyse ; coût élevé de transitions et de préservation d'état              |

## 6. Contrat cible du concept A

### Quatre modèles réutilisables

1. **Panneau de travail ancré** : compact et détaillé, trois hauteurs seulement lorsque la tâche
   le justifie (Guidance conserve ses trois niveaux). En-tête identifiable, commandes de hauteur
   explicites, fermeture/retour visibles, contenu défilant. Une sous-vue conserve le contexte du
   parent.
2. **Bandeau terrain** : informations essentielles de session, progression et accès à l'activité.
   Les états de session ne doivent pas dépendre d'un panneau détaillé resté ouvert.
3. **Carte contextuelle courte** : information ou réglage local près de son déclencheur,
   sans déplacement arbitraire. Le déplacement de la cible inclinomètre reste fonctionnel.
4. **Dialogue de décision** : seulement si un choix bloque la suite, notamment remplacer,
   sauvegarder ou abandonner. Pas de validation implicite destructive ; focus et clavier communs.

### Ouverture, retour et masquage

- Un seul panneau de travail principal ; conserver les valeurs, la sélection et la position de
  défilement au retour d'une sous-vue. Fermer l'analyse solaire retrouve le profil.
- La carte peut rester visible et utilisable quand la tâche le permet. Les commandes derrière
  une surface inactive ne doivent ni brouiller sa lecture ni recevoir un toucher accidentel.
- Conserver les deux barres du bas pendant une interaction qui en dépend, une saisie ou une
  édition contextuelle. Garder le masquage après 10 secondes sur carte au repos comme baseline ;
  vérifier le réveil et l'absence de premier toucher déclenchant une action cachée.
- Ne pas rendre toutes les barres toujours visibles. Les états REC/Guidance et alertes utiles
  ont leur propre contrat de visibilité terrain à valider en session réelle.
- Une poignée pilote les hauteurs ; fournir une action accessible équivalente. Ne pas cumuler
  plusieurs gestes cachés pour agrandir/fermer/déplacer le même panneau.
- Mobile : panneau inférieur. Bureau : rail latéral à partir du seuil actuel de 900 px à
  réévaluer visuellement. Paysage étroit : choisir rail ou panneau inférieur selon l'espace
  utilisable réel ; aucun nouveau seuil n'est déclaré validé sans essai.

### Apparence, presets et fluidité

| Preset       | Traitement UI proposé                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Endurance    | Surfaces opaques, pas de flou décoratif ; transitions essentielles courtes                        |
| Équilibré    | Surfaces principalement opaques, effets légers bornés                                             |
| Fluide       | Transparence et flou limités aux surfaces où ils restent lisibles et passent les mesures          |
| Maximum      | Effets plus riches possibles, sans empilement de grands flous ni dégradation de la lecture        |
| Personnalisé | Politique explicitement dérivée des réglages ; nettoyer les classes héritées lors des changements |

La puissance du S23 autorise à tester des effets supplémentaires, pas à les imposer partout.
Transparence et flou ont des coûts différents. Les formulaires, listes et décisions gardent une
surface protectrice dans tous les presets. Tester les changements de preset dans les deux sens
et le passage automatique en économie d'énergie. Les effets ne dépendent pas de Free/Pro.

Définir des tokens communs : fonds neutres clair/sombre, contrastes, espacements, typographie,
rayons, ombres et transitions. Bleu pour action/selection, or pour solaire ou repère Pro
explicitement identifié, orange pour avertissement, rouge pour REC/danger, vert pour succès.
Une couleur seule ne distingue jamais un état ou un droit.

Ne pas changer des bibliothèques uniquement pour leur ancienneté. Retirer les anciens styles,
écouteurs et helpers après migration de tous leurs appelants. Éviter travail permanent des
panneaux cachés, animations de mise en page inutiles et redessins multiples par interaction.

## 7. Lots courts, testables et réversibles

Chaque lot reste limité à une famille UI et conserve les contrats métier. Un adaptateur temporaire
peut préserver les événements/identifiants existants ; sa suppression appartient au même suivi.
Pas de migration de données, de bascule générale ni de suppression préalable de toute l'interface.

| Lot                            | Livrable et composants concernés                                                                                                                            | Critère de sortie et risque principal                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — référence                  | Inventaire et captures actif/repos/clavier, scénarios Free/Pro ; corriger les sélecteurs obsolètes du test `planning-beginner` lors de la reprise des tests | Direction UX validée ; baseline reproductible ; aucune fausse absence de barre due au délai de capture                                                                             |
| 1 — langage visuel             | Tokens dans `style.css`, boutons/titres/poignées/états, politique UI des presets dans `performance.ts`                                                      | Lisibilité clair/sombre et grande police ; passage entre presets sans classe résiduelle ; comparaison S23/A53 sans régression mesurée                                              |
| 2 — comportement commun        | `SheetManager`, `mobile.ts`, `autoHide.ts`, dialogues ; pilote Recherche puis Connectivité → Packs                                                          | Retour parent, Android Retour, Escape, focus, clavier et restauration d'état ; ne pas déclencher de téléchargement implicitement                                                   |
| 3 — Préparer                   | `app.html`, `appInit.ts`, Points/Configuration, `profile.ts`, analyse solaire                                                                               | Parcours complet créer/modifier/consulter/sauvegarder ; graphe réellement agrandi ; une surface de travail lisible ; conserver l'accès aux fonctions points et l'état du brouillon |
| 4 — Sortie et terrain          | `TrackSheet`, UI `GuidanceForegroundService`, fin REC et dialogues de nom                                                                                   | Préserver les trois niveaux Guidance, REC indépendant/combiné, résumé avant décision et aucun abandon implicite ; validation native dédiée obligatoire                             |
| 5 — autres surfaces            | Bibliothèque vide/remplie, Settings/Plus, météo, couches, timeline, sonde, SOS et upgrade                                                                   | Pas d'impasse ; actions essentielles au premier niveau, détails accessibles ; quatre locales ; aucune promotion perturbant une session active                                      |
| 6 — nettoyage et qualification | Retrait des styles/helpers sans appelant, tests, documentation UX/style/fonctions                                                                           | Matrice ci-dessous complétée, dette temporaire retirée, aucune promesse de gain sans mesure ; publication séparément autorisée                                                     |

Un défaut transversal découvert pendant un lot ne justifie pas une réécriture moteur. Le retour
à la famille précédente doit rester possible par un changement de code borné, sans restaurer
des données ni changer les droits utilisateur. Ne pas livrer durablement deux systèmes concurrents.

## 8. Non-régressions obligatoires

- Ordre Préparer : Suivre, Enregistrer, Points, Profil, Configuration. Distinguer clairement
  sauvegarde de parcours et enregistrement REC ; conserver le comportement de fermeture du profil.
- Appui long 500 ms pour ajouter un point ; toucher court carte ; toutes les commandes de points,
  boucle/inversion et actualisation immédiate géométrie puis couleurs solaires.
- Brouillon protégé par Sauvegarder / Remplacer / Annuler ; aucune suppression implicite.
- GPS inactif, position ponctuelle et suivi continu visuellement et sémantiquement distincts.
- Guidance : trois niveaux accessibles sans geste vertical, par Bandeau, Détails/Réduire et Agrandir,
  sous la barre haute avec grande police ; défilement des détails et retour depuis le profil.
- Guidance + REC : Terminer la sortie arrête les deux ; arrêts indépendants dans les détails.
  Pause/Reprendre REC suspend réellement les points et la durée active. Fin REC : trace et
  métriques avant décision, durabilité du dernier lot natif conservée.
- Free : zoom au-delà du détail 14 par agrandissement, indicateur HD Pro persistant ; droits
  actuels préservés, y compris guidage essentiel, REC et solaire du jour. Aucun écrasement au downgrade.
- Android natif et fallback Web restent distincts ; aucun nouveau compte requis ; quatre langues.
- Readiness : cinq sections, pas de score global ; absence d'information reste inconnue.

## 9. Matrice de validation à exécuter pendant la migration

| Axe             | Scénarios et critères                                                                                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S23             | Réglage observé 1.15 et densité 420, portrait/paysage, clair/sombre, Free puis Pro ; répéter les captures actives et après 10 s                                                        |
| A53             | 1080 × 2400 et police 110 % comme configuration de départ à revérifier ; portrait/paysage ; Équilibré et Endurance prioritaires                                                        |
| Grandes polices | Compléter à 100 % et 130 % sur appareils ; aucun bouton de retour/fermeture ou action critique inaccessible ; clavier ouvert et défilement                                             |
| Web             | Largeurs 320/360/390/412, frontière 899/900 et bureau ; zoom texte jusqu'à 200 %, clavier, souris et tactile                                                                           |
| Presets         | Endurance, Équilibré, Fluide, Maximum, personnalisé ; transitions dans les deux sens, batterie basse, aucun effet hérité                                                               |
| Navigation      | Ouvrir/réduire/agrandir/fermer, sous-vue et retour, Android Retour/Escape, fond interactif ou inerte selon contexte, rotation                                                          |
| Données/droits  | Brouillon vierge/modifié, bibliothèque vide/remplie, import/REC/parcours préparé, Free/Pro/downgrade, données indisponibles et hors ligne                                              |
| Terrain         | REC seul, Guidance seul, combiné, écran éteint/reprise, Terminer et arrêts indépendants, conservation des archives et aperçu de fin                                                    |
| Accessibilité   | TalkBack, ordre de focus, focus restauré, Entrée sur bouton ciblé, gestes avec alternative explicite, contraste et états non fondés sur la couleur seule                               |
| Performance     | Même appareil/preset/route/état de cache avant/après ; ouverture/réduction/fermeture répétées, latence médiane/p95, saccades et travail au repos ; séparer coût UI et chargement carte |

Fixer les budgets de performance du lot à partir de la baseline mesurée avant modification.
Toute dégradation reproductible bloque le lot jusqu'à explication/correction ou arbitrage explicite.
Ne pas transformer le ressenti « rapide sur S23 » en promesse pour A53 ou en mesure d'autonomie.

Après la première passe du lot 6, TypeScript passe avec la détection des symboles inutilisés, le lint
et le formatage passent, et l'audit i18n ne trouve aucune clé statique manquante dans les quatre
langues. Les 157 fichiers de tests totalisent 1 818 tests réussis. Vingt-cinq noms de sélecteurs CSS
sans référence active ont été retirés ; le CSS produit passe de 107,42 à 104,61 Ko, ou de 19,24 à
18,77 Ko compressé. Pause/Reprendre REC est désormais centralisé dans `RecordingService` pour que
Sortie et Guidance ne puissent pas diverger. Ces contrôles ne couvrent pas l'ensemble de la matrice
appareils, accessibilité et presets.

La reprise du lot 1 crée ensuite une famille unique de commandes de 48 px pour la barre supérieure,
les outils carte et les fermetures. Les titres Profil redeviennent neutres, l'or restant réservé aux
fonctions solaires ou Pro, et le profil actif utilise le bleu de sélection. SOS garde son sens rouge
sans pictogramme de style différent et ne présente plus deux actions Fermer. Les fermetures Points,
Configuration, Profil et feuilles emploient la même icône. Timeline et coordonnées sont ancrées : le
maintien, le déplacement libre, le double toucher et le glissement de fermeture ont été retirés avec
leur helper sans appelant. Les dialogues de brouillon/récupération reprennent le composant commun ;
Entrée active le bouton focalisé, le focus reste contenu et revient à l'appelant. TypeScript, lint,
formatage, 157 fichiers et 1 805 tests passent ; le build Web et son budget passent. Cette tranche
est aussi synchronisée dans le projet Android et l'APK diagnostic debug est construite avec succès.
Une première inspection physique le 2026-09-12 confirme la barre supérieure à 420 dpi et police
115 %, Plus et Configuration. Elle révèle aussi un chevauchement entre l'en-tête Bibliothèque et
ses actions, des titres/pictogrammes hérités dans SOS et Profil, ainsi qu'un ancien bundle servi par
le Service Worker après une réinstallation native. Bibliothèque revient désormais en haut de son
propre défilement sans placer le contenu sous l'en-tête ; SOS, Profil, Solaire et les toasts utilisent
des libellés plus sobres. L'application native désinscrit les anciens Service Workers tandis que le
Web conserve son comportement PWA. Enfin, l'application silencieuse des presets au démarrage et lors
des changements automatiques de batterie supprime le message anglais interne ; un choix manuel
affiche le nom traduit du preset. L'APK corrigée est construite puis Bibliothèque et SOS sont rejoués
avec succès sur le S23. Un défaut tactile signalé ensuite sur
le bandeau supérieur replié est reproduit : Météo, déplacé hors écran, conservait sa zone tactile
sous la flèche. Le contenu replié devient inerte et non interactif, tandis que la flèche garde sa
propre couche et son état accessible. Le cycle replier/déplier est validé sur le S23 sans ouverture
de Météo. Le premier sous-lot Réglages retire aussi les styles ponctuels du bloc Compte, autorise le
retour à la ligne du message indisponible et remet les choix Profil/Thème en casse normale. Cette
tranche ne clôt pas le lot 1 ni la matrice. La passe groupée suivante masque le bloc Compte vide,
réduit la promotion Pro de Réglages aux trois options réglables, réordonne l'offre autour des
formules et de la restauration, puis harmonise Connexion, Packs et Couches. Les styles embarqués de
ces surfaces sont déplacés vers la grammaire commune ; PMTiles reste accessible dans un détail
technique replié et les choix de couche deviennent utilisables au clavier. Le sous-lot suivant
ancre le résumé de l'inclinomètre et le transforme en
bouton de 48 px, sans retirer le déplacement fonctionnel du viseur ; ce dernier accepte aussi les
flèches du clavier et Home pour se recentrer. Les pictogrammes décoratifs et les styles injectés du
résumé/détail sont remplacés par des états communs, adaptés aux presets. Météo retire son ancien DOM
masqué et ses styles injectés, traduit chargement, indisponibilité, formule et catégories de confort,
et transforme les jours Pro ainsi que les aides en vrais boutons. Les icônes qui décrivent la
condition météo restent présentes. Le rejeu groupé S23 Free puis Pro confirme ces parcours en
Fluide à 115 % et 420 dpi. Cette inspection conduit à rendre les feuilles presque opaques pour que
la carte et le HUD ne concurrencent plus leur contenu, masquer la clé MapTiler comme la clé ORS,
empêcher l'état tactile persistant de rendre le résumé de l'inclinomètre translucide, espacer le
libellé de confort et remplacer l'ancien gros bouton bleu de copie par l'action secondaire commune.
La carte Réglages indique maintenant que les fonctions sont disponibles lorsque Pro est actif,
au lieu de continuer à demander leur déblocage. Le dernier APK diagnostic contenant ces corrections
est installé et contrôlé sur le S23. TypeScript, lint, formatage, build Web/Capacitor, assemblage
Android et les 1 813 tests passent ; les quatre catalogues contiennent les mêmes 964 clés.

Après changement de code : `npm run check`, `npm test`, contrôles ciblés et E2E adaptés ; après
texte visible, quatre locales et audit i18n. Pour une release Android, appliquer ensuite le
protocole complet de `CLAUDE.md`, avec autorisations distinctes pour les effets externes.

### Point de reprise après la session du 2026-09-12

L'APK diagnostic installée et contrôlée est :

`android/app/build/outputs/apk/debug/app-debug.apk`

Le contrôle S23 du démarrage, de Bibliothèque, SOS, Profil, du bandeau repliable, de Réglages,
de l'offre Pro, de Connexion, de Packs, de Couches, de l'inclinomètre et de Météo est terminé sur
les parcours décrits ci-dessus. Le dernier APK confirme en Pro les clés API masquées, le texte Pro
actif, l'inclinomètre sans état tactile résiduel et le rapport météo harmonisé. La Timeline est
désormais rejouée séparément en 3D et en Pro sur le même appareil : bouton accessible, panneau ancré,
date complète, phase crépuscule lisible et mesures solaires présentes dès l'ouverture.

Avancé est maintenant une page interne de Réglages, sans contenu technique dans Essentiels ou
Carte. La flèche et Retour Android ont été rejoués sur le S23 à 115 %. Le tutoriel n'injecte plus
ses propres styles ni ses anciens pictogrammes texte ; ses trois écrans utilisent la grammaire
commune, décrivent la création A/B par maintien sur la carte et restent lisibles sur le même S23.
Le dernier bouton unique occupe toute la largeur disponible. Cette migration technique ne valide
pas encore la conception du tutoriel : le propriétaire le juge trop proche d'une présentation,
trop textuel et trop chargé en choix sur son dernier écran. Une refonte UX dédiée reste à mener.

Le choix de langue de Réglages utilise maintenant quatre boutons de taille commune en grille 2 × 2,
avec état sélectionné explicite, au lieu du sélecteur natif qui variait selon Android. L'analyse
solaire est également migrée : casse normale, cartes et alertes communes, aides tactiles agrandies,
choix de mode accessibles, pictogrammes SVG pour alerte et copie, et suppression des styles injectés
ainsi que des émojis système dans cette surface. La promotion Free et la copie Pro deviennent des
actions secondaires. Le rendu Pro complet, y compris le graphique, les données temps réel, la frise
et la copie, est contrôlé sur le S23 à 420 dpi et police 115 %. Les 531 suites totalisent 1 814 tests
réussis ; TypeScript, lint, formatage, les quatre catalogues de 968 clés, build Web, budget bundle,
synchronisation Capacitor, assemblage et installation de l'APK diagnostic passent.

La balade S23 suivante confirme le fonctionnement général et révèle deux collisions qui relèvent du
lot UI. Le résumé de pente restait sous le panneau Guidance et la pastille REC haute recouvrait le
bandeau minimal en session combinée. La correction réutilise le contrôle de pente dans une zone du
panneau Guidance et masque la pastille haute pendant le suivi ; le bandeau affiche alors un état REC
compact avec sa durée, tandis que les panneaux normal et détaillé conservent le résumé REC complet.
Les moteurs restent inchangés. Les 531 suites/1 815 tests, TypeScript, lint, formatage, build, budget
bundle, Capacitor et assemblage diagnostic passent. La qualification physique S23 Pro à 420 dpi et
115 % passe ensuite dans les trois hauteurs, au viseur libre puis en suivi continu, avec Guidance
seule et Guidance + REC. La pastille haute reste masquée, le bandeau affiche REC et sa durée,
Pause/Reprendre fonctionne et le contrôle de pente revient à la carte après la sortie.

La Timeline solaire est ensuite reconstruite autour de la tâche réelle. Le résumé rassemble heure,
phase solaire et date ; une seconde rangée porte Lecture/Pause, le curseur et la vitesse avec des
cibles tactiles communes. Les émojis système et styles HTML ponctuels disparaissent au profit des
icônes SVG et classes partagées. L'heure utilise la phase déjà calculée comme repère secondaire,
avec quatre teintes contrastées adaptées aux thèmes sombre et clair tandis que le texte de phase
reste visible. Endurance retire le flou et garde une surface opaque ; les presets plus puissants
conservent la transparence contrôlée. Sur S23 Pro à 420 dpi et police 115 %, la date s'affiche en
entier, le bouton 3D rend la Timeline accessible, la couleur crépuscule reste lisible et les valeurs
Azimut/Élévation sont présentes dès l'ouverture. Les 157 fichiers/1 817 tests, TypeScript, lint,
formatage, build Web/Capacitor, budget bundle, assemblage et installation diagnostic passent.

La carte historique de coordonnées est remplacée par un bandeau de sélection compact ancré au-dessus
de la navigation. Les coordonnées restent entières, l'altitude apparaît en 3D et les actions Soleil
et Fermer utilisent des boutons explicites avec icônes SVG. Le doublon SOS toujours masqué et son
ancien temporisateur sont supprimés. Lorsqu'une sélection est visible, l'inclinomètre remonte au-dessus
du bandeau tandis que la colonne de commandes à droite reste libre. Sur S23 Pro à 420 dpi et police
115 %, le contrôle visuel mesure environ 10 px entre les deux surfaces, sans chevauchement. Cette
capture utilise un état visuel piloté dans la WebView ; l'ouverture, la fermeture et les états
accessibles issus d'un vrai toucher sont couverts séparément par les tests. Les 157 fichiers/1 816
tests, TypeScript, lint, formatage, build Web/Capacitor, budget bundle, assemblage et installation
diagnostic passent.

L'analyse solaire est ensuite découplée du mode d'affichage. En 2D, le toucher est projeté sur le
plan cartographique puis récupère l'altitude du modèle si elle existe. Lever, coucher, midi solaire,
durée du jour, azimut, élévation et courbe astronomique restent disponibles sans relief. La frise
d'ombre, le premier rayon et la durée d'ensoleillement sont masqués lorsque les hauteurs manquent,
avec une information non bloquante qui explique pourquoi. La simulation d'ombres sur la carte reste
en 3D. Un toucher réel puis l'action Soleil sont rejoués sur S23 Pro à 420 dpi et police 115 % ;
531 suites/1 819 tests, TypeScript, lint, formatage, quatre langues, build Capacitor, budget bundle,
assemblage et installation diagnostic passent.

La passe suivante retire les derniers écarts ponctuels des commandes cartographiques : la roue
dentée texte de Préparer rejoint l'iconographie SVG commune, le bouton 2D/3D n'embarque plus de styles
HTML propres et les outils de diagnostic suivent l'état masqué natif. Les 531 suites/1 820 tests,
contrôles statiques, build Capacitor, budget bundle, assemblage et installation diagnostic passent.

La passe de clôture S23 harmonise aussi les états de chargement, reprise hors ligne, recherche,
import GPX, REC et unités de statistiques. Le sélecteur de zone hors ligne reprend les surfaces et
boutons communs, transforme l'accès Free en vraie action accessible et masque les commandes carte,
l'inclinomètre et les coordonnées qui entraient en concurrence avec lui. Le message Free est placé
au-dessus du panneau pour laisser Annuler et Télécharger accessibles. Le résultat final est rejoué
sur S23 Free à 115 % et 420 dpi en portrait et paysage, puis dans Réglages en thèmes clair et sombre
avant retour à Auto. Le parcours Pro a été observé sur la version immédiatement précédente et son
contrat reste couvert par les tests. La sélection hors ligne utilise maintenant une seule emprise
géographique : orange pendant le choix, verte pendant le transfert et bleue une fois disponible.
Elle est recalculée puis figée au toucher de Télécharger ; le guide d'écran concurrent reste
invisible et les mouvements de carte ne peuvent plus changer l'emprise en cours. L'APK diagnostic
finale est installée ; 157 fichiers et 1 825
tests, les contrôles statiques, le build Web, le budget bundle, Capacitor et l'assemblage Android
passent.

Le troisième retour terrain est classé séparément comme candidat 5.90.1. La valeur actuelle mesure
le gradient maximal du terrain autour d'un point projeté huit mètres devant la position GPS brute.
Sur un chemin étroit, quelques mètres d'erreur peuvent donc échantillonner un talus et produire une
valeur extrême sans rapport avec la pente du chemin. La future passe doit distinguer « pente terrain
au viseur » et « pente du parcours », rattacher la seconde à la trace quand elle existe, utiliser une
fenêtre longitudinale lissée et exprimer une confiance fondée sur la précision GPS et la disponibilité
du modèle d'altitude. Aucun changement de calcul n'entre dans la refonte visuelle en cours.

Le périmètre principal S23 du lot 1 est clos. La reprise commence par le tutoriel dans une passe UX
dédiée : moins de 30 secondes, texte réduit, exemples issus de la vraie interface, une décision
claire par écran et aides contextuelles lors du premier itinéraire, du premier REC et des fonctions Pro.
Réglages avancés est migré vers les classes communes, séparé de la page principale et validé sur
S23 ; sa structure fonctionnelle détaillée pourra être simplifiée dans un lot séparé si
l'inventaire révèle encore des commandes réservées au diagnostic. Le critère de sortie du lot 1
reste une seule grammaire de titres, boutons, états, espacements et surfaces sur l'ensemble de
l'interface active. Il est désormais rempli après la qualification A53, les polices 100/110/130 %,
tous les presets, la matrice Web et l'inspection sémantique Android. Le parcours TalkBack manuel a
été écarté comme gate après son essai trop perturbant ; les parcours principaux S23 couvrent aussi
portrait/paysage, 115 %, Free/Pro et clair/sombre.

### Point de reprise après la session du 2026-09-13

L'APK diagnostic installée contient la correction finale du sélecteur hors ligne. Sur une carte
orientée, un seul contour géographique orange représente la zone choisie. Au toucher de Télécharger,
l'emprise affichée est recalculée une dernière fois puis figée ; elle devient verte pendant le
transfert et bleue lorsqu'elle est disponible, sans changement de taille ou de position provoqué par
la caméra. Le guide rectangulaire d'écran reste présent uniquement pour le calcul et n'est plus
visible. Les tuiles techniques qui intersectent l'emprise peuvent dépasser légèrement ses bords.

Le contrôle S23 a utilisé une petite zone de diagnostic. Le transfert était assez court pour atteindre
l'état bleu avant la capture suivante ; aucun cache de zone de test ne reste déclaré à la fin. La
redirection WebView temporaire a été fermée et le téléphone peut être débranché. Les preuves locales
sont dans `outputs/v590-ui-audit/s23-final/`.

La validation finale de ce point comprend `npm run check`, les 56 tests du sélecteur et de son
overlay, puis 532 suites et 1 825 tests réussis avec un seul worker. Le build Web, le budget bundle,
la synchronisation Capacitor et l'assemblage Android avaient déjà réussi sur cette même révision
fonctionnelle. Aucun commit, tag, push, release ou upload Play n'a été effectué.

La reprise du 2026-09-14 doit rester groupée :

1. concevoir puis implémenter la passe UX du tutoriel en moins de 30 secondes ;
2. rejouer uniquement ce parcours modifié et un contrôle court du sélecteur hors ligne sur le S23 ;
3. geler l'interface puis exécuter la matrice restante sur A53, polices 100/130 %, tous les presets,
   Web et TalkBack ;
4. traiter la pente du chemin séparément dans le candidat 5.90.1 avec des cas terrain reproductibles ;
5. préparer les gates de clôture et demander séparément chaque action Git ou de publication.

### Refonte UX du tutoriel engagée le 2026-09-13

La direction a été validée avec le propriétaire après relecture du relais Astra et de l'historique
des trois conceptions précédentes. Le défaut principal n'était pas graphique : le tutoriel restait
un diaporama abstrait, séparé du produit réel. La nouvelle prise en main conserve donc la carte
visible et manipulable et limite le démarrage à deux étapes : gestes essentiels sur la carte, puis
lecture du niveau de détail ou essai direct du bouton 2D/3D. Si la 3D est encore désactivée au niveau
de vue d'ensemble, la seconde étape l'explique et met en évidence le niveau de détail au lieu de
demander une action impossible. L'écran Sécurité et le menu final à quatre choix sont supprimés.

Le tutoriel utilise la nouvelle clé locale `suntrail_onboarding_v3` : il sera proposé une fois à tous
les utilisateurs, y compris ceux qui avaient terminé la version 2. Les aides métier sont ensuite
contextuelles et indépendantes : Préparer explique l'appui long A/B sur la vraie carte, Sortie
explique REC près de son bouton, et le premier toucher d'une fonction verrouillée explique clairement
le statut Pro avec les choix Plus tard ou Voir SunTrail Pro. Après cette première explication, un
nouveau toucher verrouillé ouvre directement l'offre. L'interstitiel Pro chronométré au démarrage
n'est plus déclenché, afin de ne pas concurrencer la découverte ni les permissions.

Le contrôle local comprend `npm run check`, l'audit des quatre langues sans clé manquante, 100 tests
ciblés, puis 158 fichiers et 1 825 tests avec un seul worker, le build Web et deux scénarios E2E
Chromium de premier lancement. Le rendu a d'abord été relu sur la version compilée en portrait : carte
réelle visible, compteur 1/2, cible 2D/3D, variante faible zoom et aide Préparer.

Le rejeu physique du 2026-09-13 utilise ensuite le paquet diagnostic 5.89.1/910 installé par mise à
jour sur le S23 Free à 420 dpi et police 115 %, sans effacement de données. La carte répond pendant la
première étape. La seconde étape masquait d'abord une partie des commandes latérales : son panneau a
été déplacé en haut, puis reconstruit, réinstallé et contrôlé avec toute la colonne visible et le vrai
bouton 3D mis en évidence. Son toucher termine la visite et affiche effectivement le relief. Une aide
Préparer restait aussi affichée après un changement de destination ; le premier toucher extérieur la
valide désormais implicitement sans bloquer l'action. Le passage Préparer → Sortie affiche ainsi la
bonne aide REC près de sa commande. Enfin, le premier toucher de Satellite en Free montre
l'explication Pro avec Plus tard et Voir SunTrail Pro ; Plus tard rend la main sans réouverture
automatique de l'offre. Aucun REC, achat ou changement de droit Pro n'a été lancé.

Après ces deux corrections, 14 tests tutoriel/aides, `npm run check`, 158 fichiers et 1 826 tests avec
un seul worker, le build et la synchronisation Capacitor, l'assemblage Android ainsi que les deux
scénarios E2E Chromium passent. Le contrôle court du sélecteur hors ligne a ensuite été rejoué sur
le même S23 Free avec une carte orientée à environ 61°. L'unique contour orange reste cohérent après
un déplacement de carte, sans cadre d'écran visible ; la barre haute, les commandes latérales, les
coordonnées et l'inclinomètre sont masqués, tandis que le message Free reste au-dessus des actions
Annuler et Télécharger. La sélection a été annulée sans téléchargement et le compteur de zones est
resté à 0. La matrice A53/polices/presets/Web était encore à faire à ce point de la session ; elle
est clôturée dans la section de qualification ci-dessous.
Aucun commit, tag, push, release, upload Play ou déploiement n'a été effectué.

## 10. Références visuelles locales

Captures conservées dans le dossier local suivant, hors dépôt :

`C:\Users\jacks\.codex\visualizations\2026\09\10\01a08c1b-79dc-7fe0-8244-c51c76718353\`

- `s23-controlled-active.png` : deux barres actives.
- `s23-controlled-profile-open.png` : profil compact et commandes visibles.
- `s23-controlled-profile-expanded-settled.png` : graphique tassé après agrandissement stabilisé.
- `s23-controlled-waypoints.png` : panneau Points et superpositions.
- `s23-controlled-configuration-active.png` : Configuration avec barres actives.
- `s23-ui-audit-configuration-keyboard-bottom.png` : sauvegarde atteignable après défilement.
- `s23-ui-audit-plus.png` et `s23-ui-audit-plus-balanced.png` : comparaison des surfaces.
- `s23-controlled-solar-free.png` : analyse indisponible et profil visible derrière.
- `s23-controlled-restored-profile.png` : état final rendu au propriétaire.
- `s23-library-unified-free.png` : Bibliothèque remplie, une seule carte pour le GPX importé.
- `s23-library-options-free.png` : bilan et options du même parcours développés.
- `s23-outing-route-final-loaded.png` : Sortie avec nom lisible et actions hiérarchisées.
- `s23-outing-simplified-loaded.png` : Sortie finale avec une seule action de parcours.
- `s23-guidance-final-visible.png` : guidage compact avec commandes explicites.
- `s23-guidance-final-details-corrected.png` : détails complets sans arrêt dupliqué.
- `s23-guidance-final-profile.png` : profil ancré et retour explicite pendant le guidage.
- `s23-guidance-no-pause.png` : panneau compact final à trois actions, sans Pause.
- `s23-guidance-explicit-final.png` : panneau normal avec Bandeau et Détails explicites.
- `s23-guidance-explicit-band.png` : troisième réduction avant le renommage de l'action en Agrandir.
- `s23-guidance-explicit-details.png` : panneau détaillé avec Bandeau et Réduire.
- `s23-guidance-expand-final.png` : bandeau minimal final avec Agrandir.
- `s23-guidance-back-final.png` : profil final avec le bouton Retour raccourci.

La refonte Timeline est documentée séparément dans `outputs/v590-ui-audit/timeline-redesign/` :
`timeline-pro.png` conserve le défaut de date/mesures découvert sur appareil et `timeline-final.png`
montre le rendu corrigé avec heure crépuscule, date complète et mesures Pro immédiates.

La refonte de la sélection cartographique est conservée dans
`outputs/v590-ui-audit/coords-redesign/coords-pro-final.png`. Elle montre le bandeau compact, les
coordonnées complètes, la colonne droite dégagée et l'inclinomètre remonté sur S23 Pro. L'état visuel
a été préparé dans la WebView pour rendre les deux surfaces simultanément ; les tests automatisés
couvrent le cycle d'interaction réel.

`outputs/v590-ui-audit/solar-2d-open.png` montre l'analyse ouverte après un vrai toucher en 2D sur le
S23 : l'information de relief reste secondaire et les données astronomiques Pro sont présentes.

La clôture S23 est conservée dans `outputs/v590-ui-audit/s23-final/` :
`zone-free-final-no-overlap.png` montre la barre haute masquée et les actions dégagées en portrait,
`zone-free-landscape-no-overlap.png` montre le cadre et le panneau séparés en deux colonnes, et
`settings-light.png` / `settings-dark.png` les deux thèmes de Réglages avant retour à Auto.
`zone-single-outline-selecting.png` montre l'unique contour orange sur une carte orientée.
`zone-single-outline-downloading.png` a été capturée après la fin du petit transfert et montre donc
l'état bleu disponible. `vitest-final.json` conserve le bilan global de 532 suites et 1 825 tests.

Le rejeu du nouveau tutoriel est conservé dans `outputs/v590-tutorial-s23-20260913/` :
`step1.png`, `step2-corrected.png`, `completed-3d-retry.jpg`, `prepare-hint.png`,
`rec-hint-corrected.png`, `pro-hint.png` et `pro-later.png` documentent le parcours Free et les deux
corrections issues du contrôle physique.

Le contrôle de non-régression du sélecteur est conservé dans
`outputs/v590-offline-zone-s23-20260913/` : `07-user-rotated-map.png` établit l'orientation réelle,
`08-selector-rotated-free.png` le premier état du sélecteur et `09-selector-after-pan.png` le contour
unique après déplacement. Aucun téléchargement n'a été lancé.

### Qualification A53 et Web du 2026-09-13

La matrice A53 a été poursuivie avec le paquet `com.suntrail.threejs.diagnostic` en Free, sans toucher
au paquet de production. Le tutoriel et Réglages sont contrôlés à 100, 110 et 130 % ; les quatre
profils Endurance, Équilibré, Fluide et Maximum sont lisibles, les changements rapides ne laissent
plus plusieurs notifications de profil empilées et les onglets de Réglages ne débordent plus à
130 %. Le paysage conserve les actions du panneau accessibles. Il révélait toutefois un défaut
distinct du tutoriel : la carte occupait le centre avec de grandes bandes blanches latérales lorsque
l'orientation paysage était forcée.

La reproduction montre que le canvas et la caméra prenaient bien les dimensions 800 × 360, mais que
la rotation ne déclenchait pas la recherche des tuiles nouvellement visibles. Le premier glissement
de carte lançait cette recherche et les bandes disparaissaient après chargement. Le gestionnaire de
redimensionnement appelle maintenant la mise à jour normale des tuiles après le nouveau calcul du
frustum. Il ne modifie ni le throttle, ni la file de chargement, ni le passage au repos du moteur.
Sur l'APK diagnostic corrigée, une rotation portrait → paysage après stabilisation remplit la carte
sans aucun toucher. Les captures avant, après geste et après correction sont conservées sous les
noms `22-landscape-repro-before.png`, `24-landscape-after-touch-wait.png` et
`25-landscape-fixed-no-touch.png`.

À la demande du propriétaire, toute modification d'un réglage piloté par les profils enlève la
sélection du profil nommé et affiche explicitement le statut « Personnalisé ». Le comportement est
vérifié sur l'A53 Free en modifiant Lacs & Rivières, puis en revenant à Équilibré ; le profil et le
réglage sont correctement restaurés. Les réglages sans rapport avec les performances ne changent
pas le profil. Le statut est traduit dans les quatre langues et exposé comme région d'état polie.

L'inspection de l'arbre d'accessibilité de la WebView confirme que les neuf fiches fermées sont
maintenant inertes et absentes du parcours quand Réglages est ouvert. La fiche active est annoncée
comme dialogue « Réglages », et les anciens boutons flèches sans nom deviennent « Options de Forêts
et Végétation » et « Options météo ». Le texte « Personnalisé » figure bien dans l'arbre lorsqu'il
est visible. Un essai TalkBack réel a ensuite été lancé puis immédiatement arrêté à la demande du
propriétaire, car le mode rendait le téléphone trop difficile à utiliser. TalkBack a été désactivé
et ce parcours manuel n'est pas retenu comme gate bloquant pour ce lot ; les contrôles sémantiques
automatisés restent la preuve d'accessibilité disponible.

La matrice Web rejouée sur la révision finale couvre 320, 360, 390, 412, 899, 900 et 1280 px, plus
un zoom à 200 %. Sur les deux étapes, la carte, la fiche, Passer, Suivant/Terminer, la cible 2D/3D et
le niveau de détail restent dans la fenêtre, sans défilement horizontal. Les preuves et mesures sont
conservées dans `outputs/v590-web-matrix-20260913/`; les captures A53 sont dans
`outputs/v590-a53-matrix-20260913/`.

La validation automatisée finale passe avec `npm run check`, l'audit des quatre catalogues sans clé
manquante, `git diff --check` et 158 fichiers / 1 830 tests avec un seul worker. Le build Web, la
synchronisation Capacitor, l'assemblage Android et l'installation de l'APK diagnostic passent
également. Le dépassement du budget bundle venait des quatre catalogues regroupés avec le moteur de
traduction : `I18nService` mesurait 377,8 Kio pour une limite de 300 Kio. Les catalogues sont désormais
quatre chunks indépendants de 37,7 à 42,5 Kio et le moteur revient à 223,6 Kio ; le précache reste à
2,41 Mio et le gate repasse au vert sans relever les limites ni retirer de traduction. L'APK finale
charge bien les quatre ressources et affiche le français. L'A53 est rendu à 110 %, rotation
automatique, profil Équilibré et Lacs & Rivières activé. Aucun commit, tag, push, release, upload Play
ou déploiement n'a été effectué.

### Clôture fonctionnelle 5.90

Les critères produit, visuels, techniques et de qualification définis pour la refonte 5.90 sont
remplis localement. Le chantier de pente du chemin reste volontairement classé en candidat 5.90.1
et ne bloque pas cette clôture. Aucune opération de livraison n'est incluse dans cette décision :
commit, tag, push, release GitHub et upload Play nécessitent toujours des autorisations séparées.

Ces fichiers sont des preuves locales de cette session, pas des ressources embarquées ni une
publication. Le dossier `outputs/` reste hors publication et n'entre pas dans les ressources
embarquées.
