# Diagnostic du pack hors-ligne Suisse — 20 septembre 2026

## Décision

- **GO technique** pour conserver le pack v5 comme candidat de référence et,
  si nécessaire, le reconstruire localement avec le pipeline corrigé.
- **NO-GO publication** (CDN, release ou production) tant que l'archive complète
  de 1,9 Go n'a pas été validée par le vrai chemin téléchargement/import OPFS
  et qu'une stratégie de taille mobile n'a pas été décidée.
- **NO-GO embarquement de l'archive complète dans l'APK.** Ce mode n'est pas le
  chemin de production et reste inadapté à un fichier de cette taille.

Le pack test lossless est automatiquement valide et visuellement correct sur
le S23 en 2D et en 3D. La cause des pics du v4 est démontrée. La corruption de
l'ancienne copie OPFS est un incident distinct dont la cause exacte reste à
prouver.

## Protection des travaux

- Dépôt principal laissé intact car il contenait des changements d'une autre
  tâche.
- Travail réalisé dans le worktree isolé
  `C:\Users\jacks\.codex\worktrees\swiss-pack-render-v5\suntrail_threejs`.
- Aucun tag, release, upload, déploiement ou test Android instrumenté
  destructeur. Le commit et le push de la branche de diagnostic ont été
  explicitement autorisés après les validations.
- L'application de production `com.suntrail.threejs` n'a pas été remplacée.
  Seule `com.suntrail.threejs.diagnostic` a été installée et mise à jour.

## Archives retrouvées

| Version |               Taille | SHA-256                                                            | Conclusion                                                                                         |
| ------- | -------------------: | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| v2      |   750 116 150 octets | `AB3393DC0C2318BA108EA46608C9BDE9464E88B6FC0E65A4A83242134B1C1542` | Ancien pack couleur fonctionnel, PMTiles v3, z8–14                                                 |
| v3      |   697 135 687 octets | `C8C034758D24A24BDDEFFDF093A535BED3B9725483BC7E38EE2C448EE39AF3C2` | Header `maxZoom=14`, donc identifiants décalés élévation/overlay inaccessibles jusqu'au pseudo-z19 |
| v4      |   712 310 158 octets | `17FEC92CF63FA3E5924E126A46D2E06F45E58F86492CFA0E8BDA2351F413CFE1` | Structure lisible, mais élévation Terrain-RGB détruite par WebP avec pertes                        |
| v5      | 1 988 524 196 octets | `70295A18F9937FDB47ED16091E1EBA886B284532E1D5C63C21CC0D66BA6ABA39` | Élévation lossless, validation automatique réussie                                                 |

La taille v5 est cohérente avec le contenu actuel : 20 126 coordonnées à
trois couches (couleur, élévation, overlay), soit 60 378 ressources, contre une
seule couche couleur dans le v2. L'élévation sans perte augmente aussi le coût.
Cette cohérence n'implique pas que 1,9 Go soit une taille acceptable à publier.

### Répartition exacte de la taille v5

L'audit des entrées PMTiles attribue la totalité des 1 988 197 913 octets de
données de tuiles (0 octet non attribué) :

| Couche    |              Données | Part des données de tuiles |
| --------- | -------------------: | -------------------------: |
| Couleur   |   308 980 534 octets |                    15,54 % |
| Élévation | 1 627 491 666 octets |                    81,85 % |
| Overlay   |    51 725 713 octets |                     2,60 % |

Les répertoires et métadonnées PMTiles ne représentent que 326 283 octets.
À lui seul, le niveau z14 d'élévation pèse 988 358 012 octets. Retirer
l'overlay complet ne gagnerait que 51,7 Mo et ne résoudrait donc pas le
problème.

Estimations exactes avant reconstruction, obtenues en retirant les entrées
concernées du v5 :

| Variante                                 |       Taille estimée |
| ---------------------------------------- | -------------------: |
| Couleur + overlay z8–14, élévation z8–13 | 1 000 166 184 octets |
| Couleur + overlay z8–14, élévation z8–12 |   609 031 610 octets |
| Toutes les couches limitées à z13        |   735 471 043 octets |
| Couleur + overlay uniquement             |   361 032 530 octets |

Ces variantes ne sont pas encore directement utilisables : le chargeur demande
aujourd'hui l'élévation au zoom exact jusqu'à z14. Une absence à z14 déclenche
le repli réseau MapTiler et produit une tuile plate hors ligne ; il ne recadre
pas encore le quadrant correspondant de la tuile parente z13 ou z12.

## Cause racine des pics 3D

### Fait démontré

Le v4 transformait les tuiles `terrain-rgb-v2` en WebP qualité 40 avec pertes.
L'altitude est codée ainsi :

`-10000 + (R × 65536 + G × 256 + B) × 0,1`

Une erreur de seulement 1 sur le canal rouge produit donc une erreur de
6 553,6 m. Sur 102 tuiles v4 comparées à leurs sources :

| Mesure                        |  Source |  Archive v4 |
| ----------------------------- | ------: | ----------: |
| Pixels hors -500…6 000 m      |       0 |  22 270 971 |
| Gradients voisins > 500 m     |       0 |  20 615 389 |
| Gradient maximal              | 468,6 m | 961 912,5 m |
| Raccord maximal entre voisins | 257,2 m | 666 907,5 m |
| Écart source/archive maximal  |       — | 949 325,1 m |

Ces valeurs impossibles existent dans les pixels extraits du pack avant le
maillage Three.js. Le rendu 3D les rend visibles mais ne les crée pas. Le même
décodage donne des altitudes cohérentes sur les sources et sur le v5 lossless.

### Changements récents et rendu

Le commit `6802f2f6` corrige les offsets couleur/élévation par tuile et force un
rechargement du terrain lors du passage 2D → 3D. Ces corrections peuvent
expliquer un mauvais alignement ou un état visuel incohérent avant ce commit,
mais pas les millions de pixels altérés mesurés dans le v4.

Le commit `ac0e4ae3` détectait et supprimait une archive locale invalide après
une erreur de lecture. Il confirme la corruption de cette copie OPFS, pas sa
cause, et ne démontre aucun lien avec la compression avec pertes du v4.

## Structure PMTiles et offsets

- Offsets utilisés : élévation `100 000 000 000`, overlay
  `200 000 000 000`.
- Les plages couleur, élévation et overlay ne se chevauchent pas.
- Le header physique doit atteindre le pseudo-z19, tandis que les zooms
  logiques restent z8–14 pour le pack complet et z12–14 pour l'échantillon.
- Le writer distingue maintenant tuiles adressées, entrées et contenus après
  déduplication.
- La sortie est écrite en `.partial`, puis renommée seulement après succès.
- Les rasters du cache sont décodés et vérifiés avant réutilisation.

## Validations automatiques

### Petit pack représentatif

Zones : Matterhorn/Zermatt (montagne) et Zurich (zone urbaine/lacustre), z12–14.

| Propriété                                         | Résultat                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| Taille                                            | 33 885 788 octets                                                  |
| SHA-256                                           | `5255A713A3F8B714C59A61BD476DB6BB5C09027CC65D7FDD8A44E614C9B222CE` |
| Ressources                                        | 981 adressées, 935 entrées/contenus                                |
| Élévation contrôlée                               | 327/327 tuiles : z12 22, z13 69, z14 236                           |
| Erreurs / avertissements                          | 0 / 0                                                              |
| Illisibles / absentes                             | 0 / 0                                                              |
| Pixels impossibles / gradients anormaux / no-data | 0 / 0 / 0                                                          |
| Écart source/archive maximal                      | 0 m                                                                |
| Gradient maximal                                  | 87,1 m                                                             |
| Raccord maximal voisin                            | 28,5 m sur 569 paires                                              |
| Écart inter-zoom maximal                          | 26,9 m sur 303 paires                                              |

Rapport machine : `output/switzerland-sample-v1-validation.json`.

### Pack complet v5 construit par l'utilisateur

| Propriété                                         | Résultat                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Taille                                            | 1 988 524 196 octets (1 896,4 Mio)                                     |
| SHA-256                                           | `70295A18F9937FDB47ED16091E1EBA886B284532E1D5C63C21CC0D66BA6ABA39`     |
| Header                                            | PMTiles v3, z physique 8–19, 60 378 adressées, 59 310 entrées/contenus |
| Élévation échantillonnée                          | 1 006 tuiles réparties de z8 à z14                                     |
| Erreurs / avertissements                          | 0 / 0                                                                  |
| Illisibles / absentes                             | 0 / 0                                                                  |
| Pixels impossibles / gradients anormaux / no-data | 0 / 0 / 0                                                              |
| Écart source/archive maximal                      | 0 m                                                                    |
| Gradient maximal                                  | 468,6 m                                                                |
| Raccord maximal voisin                            | 257,2 m sur 1 961 paires                                               |
| Écart inter-zoom maximal                          | 70,9 m sur 997 paires                                                  |

## Deuxième anomalie démontrée : accès Range Android

L'essai d'un APK contenant le pack complet restait sur « Loading map », puis
devenait noir et lent. Le serveur d'assets Capacitor Android renvoyait un header
HTTP 206 correct, mais son corps contenait les octets depuis l'offset demandé
jusqu'à la fin du fichier. Exemples mesurés sur le pack test :

- demande 127 octets depuis 0 : corps de 33 885 788 octets ;
- demande 100 octets depuis 5 829 : corps de 33 879 959 octets ;
- avant correction, une tuile couleur de 23 200 octets devenait un `Blob` de
  31 224 741 octets.

Cette anomalie explique la pression mémoire et la lenteur du pack embarqué.
Elle est indépendante de la corruption Terrain-RGB du v4. Le nouveau
`EmbeddedAssetSource` lit seulement la plage utile et annule immédiatement le
reste du flux. Les tailles observées redeviennent exactes : 23 200 octets pour
la couleur, 106 456 pour l'élévation et 160 pour l'overlay sur la tuile témoin.

Ce correctif concerne exclusivement l'asset diagnostic embarqué. Le chemin
normal OPFS n'utilise pas ce serveur d'assets.

## Contrôle S23

- APK séparé `com.suntrail.threejs.diagnostic`, production intacte.
- Zurich : chargement propre en 2D, transition réelle par le bouton, puis vue
  3D stable et cohérente ; aucun pic, aucun écran noir, aucun trou de tuile.
- Matterhorn/Zermatt : relief oblique continu, sans aiguille artificielle ni
  rupture visible aux limites de tuiles.
- Après le lecteur de flux final : redémarrage, 2D puis 3D réussis ; aucune
  `FATAL EXCEPTION`, `OutOfMemoryError` ou erreur AndroidRuntime relevée.
- Les bandes blanches observées n'étaient pas des pics : selon la capture,
  elles correspondaient au fond de l'en-tête, au ciel/horizon 3D ou à la limite
  de la petite emprise de test. La capture finale 3D Zurich ne présente pas de
  bande blanche dans la carte.

### Mémoire résiduelle

La vue 3D finale reste coûteuse : environ 819 Mo PSS / 914 Mo RSS, dont environ
599 Mo classés mémoire graphique. Les tas Java et natif restent autour de 21
et 26 Mo. Cela ne ressemble plus à une archive PMTiles matérialisée en mémoire,
mais le budget GPU/Three.js demeure élevé et doit être surveillé avant toute
diffusion large.

## Fichiers préparés

- `scripts/build-country-pack.ts`
- `scripts/pack-tile-encoding.ts`
- `scripts/pack-elevation-validation.ts`
- `scripts/validate-country-pack.ts`
- `scripts/pmtiles-writer.ts`
- `scripts/prepare-diagnostic-pack.ts`
- `scripts/analyze-pack-size.ts`
- `src/test/packElevationValidation.test.ts`
- `src/test/pmtilesWriter.test.ts`
- `src/modules/embeddedAssetSource.ts`
- `src/modules/embeddedAssetSource.test.ts`
- `src/modules/packCatalog.ts`
- `src/modules/packManager.ts`
- `src/modules/packManager.integration.test.ts`
- `package.json`
- `public/diagnostic/suntrail-pack-switzerland-sample-v1.pmtiles` (artefact
  local ignoré par Git, injecté avec `npm run prepare:diagnostic-pack`)

Le téléchargement OPFS contrôle maintenant avant le statut `installed` :

- égalité entre `Content-Length` et les octets réellement reçus ;
- égalité entre les octets reçus et la taille réellement écrite dans OPFS ;
- lecture du header et des métadonnées PMTiles ;
- bornes de toutes les sections PMTiles dans la taille du fichier ;
- compatibilité de la plage de zoom annoncée avec le catalogue.

Un téléchargement incomplet ou un header pointant après la fin du fichier est
rejeté, marqué en erreur et supprimé. Tests ciblés finaux : 4 fichiers, 66
tests réussis. TypeScript : réussi.

Contrôles pré-commit : TypeScript, ESLint, formatage des fichiers modifiés et
build Vite réussis. La suite complète obtient 1 942/1 943 tests dans le
worktree ; l'unique échec est le test historique `edgeToEdge.test.ts`, sensible
aux fins de ligne CRLF de ce checkout Windows. Le même test passe 4/4 dans le
dépôt principal et ne touche aucun fichier de ce lot.

## Risques restant à fermer

1. Le pack complet v5 n'a pas encore été testé par téléchargement/import OPFS
   puis lecture 2D/3D sur le S23.
2. L'intégrité OPFS contrôle désormais longueur, écriture, header, métadonnées
   et bornes internes avant installation. Un hash publié dans le catalogue
   reste souhaitable pour détecter une corruption sans changement de taille ;
   la cause exacte de l'ancienne copie tronquée reste non démontrée.
3. La taille de 1,9 Go est trop élevée pour une publication mobile prudente.
   Une réduction devra rester strictement sans perte pour Terrain-RGB.
4. La mémoire graphique 3D reste élevée même avec le petit pack.
5. Aucun test visuel ne remplace une validation sur plusieurs appareils et
   plusieurs GPU.

## Recommandation finale

Le contenu du v5 est techniquement sain et le pipeline lossless supprime la
cause démontrée des pics. Il n'est pas nécessaire de reconstruire une nouvelle
archive complète uniquement pour corriger les données : le v5 existant est le
candidat de référence. La prochaine étape utile est un essai OPFS du fichier
complet, puis une décision de découpage/réduction de taille. Publication :
**NO-GO** jusqu'à ces deux validations.
