# SunTrail — Roadmap produit révisée (version source v5.85.1 — optimisation en validation)

> Révision : 2026-08-13, après clôture de v5.85.0 confirmée par le propriétaire du projet et
> implémentation locale du chantier ciblé performance/autonomie v5.85.1.
> Cette section fait foi. Le plan du 2026-08-03 est conservé plus bas uniquement comme
> archive ; ses versions, statuts et séquences ne doivent plus être utilisés.

## Cap produit

**SunTrail — La randonnée au bon moment.**

Le produit doit permettre, sans compte obligatoire : **préparer → sauvegarder → évaluer →
suivre → enregistrer**. Android est le produit terrain principal ; le web est un atelier de
préparation facultatif. Le différenciateur reste le croisement relief 3D, soleil réel,
heure de passage et conditions.

## État réel au 2026-08-13

- La dernière release corrective publique reste **v5.83.3** / **901**. **v5.84.0** / Android
  **902** est clôturée comme pré-release GitHub interne, sans téléversement Play Console.
- Prepared Routes, la bibliothèque IndexedDB, la compatibilité GPX/REC, la difficulté expliquée,
  les corrections mobiles et la validation Galaxy S23 sont clôturées.
- Le moteur foreground, ses fixtures, le plan de guidage local, l'UI et l'indépendance REC sont
  implémentés. Les gates automatisés et la validation Galaxy S23 sont acceptés pour ce périmètre
  foreground.
- La clôture de v5.85.0 a été confirmée par le propriétaire du projet le 2026-08-13 ; son matcher
  Java, Room v2, session native, bridge et notification forment la baseline de performance.
- v5.85.1 est implémentée localement : rendu idle, REC long, cache/préchargement LOD, travail UI,
  démarrage et guidage natif ont été optimisés sans nouvelle fonction produit. Check, 1 607 tests,
  build, bundle 2,27 MiB, i18n et synchronisation Capacitor sont verts ; E2E/Gradle et les mesures
  A53/S23 restent à consigner avant publication.
- Après comparaison Komoot/Garmin, v5.84 inclut la prochaine indication et sa distance au sein
  du moteur foreground, sans étendre la promesse aux fonctions natives/background de v5.85.

## Séquence de livraison révisée

| Version | Résultat autonome | Portée principale |
|---|---|---|
| **v5.82.0** | Comprendre et utiliser la préparation sans geste caché | Finalisé dans le worktree, sans PreparedRoute |
| **v5.83.0** | Planifier, évaluer et retrouver une route après redémarrage | PreparedRoute local, bibliothèque, difficulté/effort, soleil utile |
| **v5.84.0 interne clôturée** | Valider le moteur de suivi sans promesse publique incomplète | GuidanceEngine TS, progression/ETA/écart, prochaine indication, foreground |
| **v5.85.0 clôturée** | Guider réellement sur Android, écran éteint et après interruption | Matcher natif, route Room, notification, récupération, tests appareils |
| **v5.85.1** | Randonner plus longtemps avec une carte fluide | Autonomie, rendu au repos, REC long, cache VRAM/tuiles et guidage efficient |
| **v5.86.0** | Savoir si la sortie est prête et emporter son corridor | Readiness en couches, corridor Free remplaçable, offline fiable |
| **v6.0.0** | Préparer sur PC et retrouver volontairement sur Android | Compte optionnel, OAuth PKCE, Supabase/RLS, sync et conflits |
| **v6.1.0** | Accélérer les usages experts sans compliquer le débutant | Variantes, comparaison de routes, couches/presets, exports et finition |

La synchronisation ne bloque plus le guidage. v5.84 est un jalon technique interne/fermé ; elle
n'est pas promue publiquement comme un guidage complet. Le durcissement natif devient v5.85,
suivi d'une stabilisation corrective v5.85.1, avant readiness et cloud, car Android terrain et
l'autonomie sont la priorité produit.

## v5.82.0 — Fondations UX finalisées

La reprise demandée par le prompt [v5.82](docs/plans/prompts/V5_82_UX_FOUNDATIONS.md) est
terminée sans introduire de modèle `PreparedRoute`.

Validé le 2026-08-08 :

- les six smoke E2E et le scénario débutant isolé ;
- l'interface mobile, tablette et desktop, l'accessibilité et les textes longs ;
- Bibliothèque comme historique de traces récentes, sans persistance des itinéraires manuels ;
- build, bundle, i18n, synchronisation Capacitor, tests/lint et APK Android debug ;
- changelog, package et Android alignés seulement après les gates.

**Gate automatisé et terrain :** verts ; validation S23 acceptée sans P0/P1. Le tag `v5.82.0`
et la release GitHub publique ont été vérifiés le 2026-08-09. La release est clôturée et v5.83
peut commencer.

## v5.83.0 — Planifier, évaluer et sauvegarder localement

> **Release clôturée et publiée le 2026-08-09.** Tag `v5.83.0`, commit `89e76be`, AAB signé
> attaché à la release GitHub. Cet état vérifié constituait le point de départ de v5.84.

### Domaine

Créer un `PreparedRouteV1` minimal et stable : identité locale, nom/source/profil, waypoints,
géométrie complète, statistiques, bounds, heure de départ, allure, favori, notes/tags et dates
locales. Ne pas y placer `syncState`, révision distante ou tombstone ; la sync utilisera plus
tard un `SyncEnvelope` séparé.

### Valeur débutant

- sauvegarde explicite et bibliothèque locale sans compte ;
- réouverture hors ligne après redémarrage ;
- heure de départ, ETA et marge avant la nuit visibles dans le flux de préparation ;
- effort physique simple et méthode transparente ;
- difficulté technique ORS `traildifficulty`/SAC avec couverture de données ; si absente ou
  fallback OSRM, afficher « inconnue », jamais une estimation T1–T6 basée sur la seule pente ;
- résumé sémantique et édition des waypoints au clavier comme alternative au canvas 3D.

### Stockage et migration

- `RouteRepository` injectant son `IDBFactory` ;
- unitaires avec `fake-indexeddb`, E2E avec la vraie IndexedDB Chromium ;
- bibliothèque locale illimitée selon le stockage appareil ; Free conserve un seul tracé
  importé actif à l'écran, Pro le multi-affichage ;
- historique GPX legacy préservé ; conversion explicite en route « approximative » si seule la
  géométrie simplifiée subsiste, et reimport demandé avant guidage de confiance.

### Contrat de sélection des traces

- une seule route alimente l’atelier **Préparer** et son bandeau ; son nom et sa source
  (brouillon manuel, GPX en préparation ou route sauvegardée) restent visibles ;
- sélectionner une trace dans **Sortie/Bibliothèque** ne fait que la consulter : visibilité,
  profil et cadrage. Le passage d’un GPX dans l’atelier demande l’action explicite
  « Préparer cette trace » ;
- un brouillon modifié n’est jamais remplacé silencieusement : sauvegarder, remplacer ou
  annuler sont proposés avant l’ouverture d’une autre route ;
- le REC reste un troisième flux indépendant. Pendant l’enregistrement, les statistiques de
  Sortie restent celles du REC même si une trace de référence est consultée ;
- la liste indique le nombre de traces affichées et permet de masquer les autres ou toutes les
  traces chargées. Les routes IndexedDB non ouvertes ne sont pas rendues sur la carte ;
- un GPX conserve tous ses points dans `geometry` sans transformer chaque point en waypoint. Une
  boucle détectée expose départ, deux passages intermédiaires et arrivée au départ, et son profil
  est restauré à l'ouverture depuis la Bibliothèque ;
- la limite technique de calques chargés reste 10 et l’historique legacy reste limité à cinq
  entrées. Free conserve un seul GPX importé actif ; aucun de ces contrôles ne masque le REC.

### Infrastructure

Introduire un registre de release flags distinct des entitlements : défauts build-time,
override distant optionnel versionné, cache last-known-good et override développeur. Les flags
ne contrôlent jamais la sécurité ni les droits Pro.

**Gate :** créer A/B, sauvegarder, fermer, redémarrer offline et rouvrir la route avec ses
statistiques, sa marge de jour et un état de difficulté explicite. ORS complet/partiel et
OSRM/absence de donnée sont testés ; « inconnue » est un résultat valide, jamais un écran vide.

## v5.84.0 — Moteur de suivi, jalon interne clôturé

> **Clôturé le 2026-08-11 comme pré-release GitHub interne.** Le moteur, les cues, l'UI et les
> E2E ciblés sont validés ; la validation Galaxy S23 a été acceptée pour le périmètre foreground.
> v5.85.0 est clôturée. v5.85.1 reste en validation séparée ; le démarrage de v5.86 a été
> autorisé sans attendre ses validations Android/E2E et terrain encore ouvertes.

Livrer le cœur de navigation avant le cloud :

- `GuidanceEngine` TypeScript pur avec fixtures déterministes ;
- segment proche, progression, distance restante, ETA, écart et look-ahead ;
- prochaine indication et distance : manœuvre routée ORS/OSRM, waypoint/POI nommé, ou changement
  de direction géométrique explicitement approximatif ;
- états acquiring/on-route/off-route/recovered/arrived/paused ;
- alertes visuelles et haptiques au premier plan ;
- route et matcher utilisables hors réseau tant que l'application reste ouverte ;
- UI terrain à une main et fort contraste ;
- REC existant optionnel et indépendant ; aucun double abonnement GPS ;
- web limité au premier plan, avec la même formulation honnête.

Cette version ne promet ni alertes écran éteint, ni survie après kill, ni notification de
guidage, ni voix, ni recalcul automatique. Elle reste sur un track interne/fermé, sous release
flag, avec la formulation « suivi écran actif — bêta ». Ces garanties appartiennent à v5.85
ou à une portée ultérieure explicitement validée.

GPX reste le format d'échange principal : un `trk` fournit la géométrie mais aucune manœuvre
standard. Les `wpt`/`rtept` nommés peuvent alimenter les points à venir lorsqu'ils sont associés
à la trace. Les étapes ORS/OSRM sont conservées dans un plan de guidage local séparé de
`PreparedRouteV1`. L'import FIT/TCX, la voix et les extensions propriétaires sont différés.

**Gate interne :** parcours de terrain simulé et test appareil Android application ouverte,
mode avion, avec bruit GPS et lacets proches ; prochaine indication correcte, aucune manœuvre
inventée sur GPX sans données fiables et aucune alerte répétée, sans régression REC. Aucun
déploiement public.

## v5.85.0 — Guidage Android robuste

> Clôture confirmée par le propriétaire du projet le 2026-08-13. Cette version constitue la
> baseline fonctionnelle et énergétique de v5.85.1.

Étendre les briques Java/Room existantes :

- stocker la route active et la session dans Room avec migrations testées ;
- porter le matcher validé en v5.84 côté natif avec fixtures de parité ;
- `guidance`, `recording` ou `both`, anciennes API REC conservées ;
- snapshot de progression, notification et haptique hors trace en arrière-plan ;
- écran éteint, WebView tuée, swipe-away, mode avion et reprise ;
- arrêt séparé du guidage et du REC ;
- JUnit Android réels, tests Room recommandés sur appareil et instrumentation service/UI.

Les seuils d'alerte restent centralisés et affinés avec replays GPS. Le budget n'est plus
« CPU +10 % » arbitraire : mesurer d'abord REC-only, puis médiane de trois runs d'une heure sur
A53 et S23. Cible initiale : au plus **+1 point de batterie par heure** sur A53 par rapport au
REC seul ; tout dépassement est expliqué et bloque la généralisation.

**Gate :** matrice API 24/33/36 et appareils réels, sans publication sur émulateur seul. Protocole
et gates rouges : [V5_85_A53_S23_FIELD_VALIDATION.md](docs/plans/V5_85_A53_S23_FIELD_VALIDATION.md).

## v5.85.1 — Performance & autonomie terrain

> Chantier ouvert le 2026-08-13 après clôture confirmée de v5.85.0. Il n'ajoute aucune promesse
> fonctionnelle ; REC, routes préparées, guidage natif et reprise conservent leurs contrats.

Réduire le travail permanent et le coût croissant des longues sorties, en privilégiant des gains
mesurables et réversibles :

- rendre la boussole seulement lorsque la caméra ou son animation change ; préserver le deep sleep
  de la carte quand l'application est immobile ;
- remplacer les reconstructions complètes de trace REC par une stratégie incrémentale ou fortement
  bornée, avec persistance débouncée et flush garanti à l'arrêt, à la pause et au passage en
  arrière-plan ;
- éviter le recalcul intégral des statistiques REC lorsque la feuille Sortie est fermée ;
- corriger le remplacement des textures du cache, les clés et le cycle de vie du préchargement LOD,
  ainsi que le comportement de zoom sortant ;
- supprimer les travaux UI permanents sans effet utilisateur : polling Free de l'inclinomètre,
  intervalle de stockage, timer de focus de recherche et imports/hydratations non critiques ;
- réduire les écritures Room, snapshots, broadcasts et recherches de segments du guidage natif,
  sans perdre une transition d'état, une alerte ou une reprise ;
- éliminer les doublons de démarrage et différer les dépendances non critiques, notamment celles
  liées au GPX, aux packs et aux feuilles secondaires.

**Gates :**

1. mêmes résultats de guidage sur les fixtures Java/TypeScript, et mêmes transitions
   recording/guidance/both, y compris arrêt séparé et reprise après WebView tuée ;
2. aucun crash, fuite WebGL ou texture résiduelle après 30 minutes de panoramique/zoom et plusieurs
   changements de LOD ;
3. mesures A53 et S23 comparant idle, navigation carte, REC seul et guidage + REC, sur trois runs
   homogènes ; le gain est rapporté face à une baseline v5.85.0, sans budget inventé avant mesure ;
4. `npm run check`, `npm test`, build et budget de bundle verts ; tests Android réels complétés sur
   les API supportées ;
5. aucune régression de fluidité, de récupération REC, d'offline ou d'accessibilité constatée dans
   le protocole terrain.

**État worktree :** implémentation terminée ; validation automatisée finale et preuves physiques
A53/S23 encore ouvertes. Aucun commit, tag, push ou déploiement n'est implicite.

## v5.86.0 — Prêt à partir & corridor hors ligne

**Clôture GitHub au 2026-08-13 :** readiness local et lots corridor 2/3/4 validés :
contrat déterministe, route/lumière immédiates, plan Free 1 km LOD 5→14, couverture mesurée sans
réseau depuis caches/packs locaux et moteur de téléchargement typé avec progression, résultat
partiel et annulation conservatrice. Le manifeste persistant et le remplacement atomique Free
préservent corridors partagés et zones manuelles. La Bibliothèque expose téléchargement,
progression, annulation, choix Pro et confirmations cellulaire/quota. Le propriétaire a validé un
corridor Norvège après fermeture complète et relance hors connexion, avec bibliothèque et suivi
jusqu'au LOD 14. La release GitHub est autorisée ; l'upload Play reste séparé, sans maximum Play
vérifié. Détails :
[docs/READINESS_OFFLINE.md](docs/READINESS_OFFLINE.md).

Le `RouteReadinessReport` fonctionne en couches :

1. noyau local immédiat : route, effort, difficulté connue/inconnue, heure/ETA, lumière et
   couverture offline ;
2. enrichissements réseau optionnels : météo, neige/vent et fraîcheur ;
3. état appareil Android : GPS, permissions, notifications, batterie.

Une source absente reste « inconnue » ; le rapport ne bloque jamais sur la météo. Le calcul du
corridor dépend uniquement de la géométrie, pas du rapport ni de la sync.

Offline décidé :

- Free conserve sa zone manuelle actuelle **et** un corridor actif de 1 km remplaçable après
  confirmation ;
- Pro conserve plusieurs corridors et choisit 0,5/1/2 km ;
- estimation de taille, réseau mobile, progression, reprise, intégrité et couverture partielle ;
- Service Worker pour le shell PWA, CacheStorage pour zones/corridor et OPFS pour packs :
  responsabilités documentées, quotas et suppression coordonnés.

Ajouter quand les sources le permettent : parking/transports au départ, points d'eau/refuges
près du tracé et checklist d'équipement liée aux risques, avec couverture et fraîcheur visibles.

**Gate :** rapport utile offline sans météo, corridor remplaçable Free et redémarrage en mode
avion avec couverture mesurée honnêtement.

## v6.0.0 — Compte optionnel & synchronisation PC–Android

Préparer l'infrastructure avant d'exposer les contrôles :

- dossier `supabase/`, migrations reproductibles, RLS owner-only et tests à deux utilisateurs ;
- Google OAuth Authorization Code + PKCE, deep link Android, magic link fallback ;
- runbook Google/Supabase/Play signing sans secrets ;
- `RouteSyncService` au-dessus du repository local et `SyncEnvelope` séparé du domaine ;
- consentement au premier upload, sync incrémentale, tombstones et conflit sans écrasement ;
- aucune sync de trace REC, position live, cartes/packs, clés API ou réglages développeur.

Règles commerciales : cinq routes cloud choisies en écriture pour Free, illimité Pro. Au
downgrade, aucune suppression : surplus en lecture/téléchargement, changements locaux conservés.

RevenueCat : Android utilise `Purchases.logIn` et vérifie la fusion/restore selon le dashboard ;
le web reçoit un flux explicite de liaison/restauration. Achat anonyme → login → autre appareil →
logout → relogin fait partie des E2E bloquants.

**Gate :** route PC visible sous dix secondes sur Android en environnement contrôlé, puis
disponible offline, avec conflit et downgrade sans perte.

## v6.1.0 — Power user & finition professionnelle

- drag précis, variantes/branches de waypoints, duplication et undo/redo ;
- comparaison côte à côte ou superposée de deux routes, plus comparaison dates/heures ;
- couches de pente/courbes de niveau lorsque la source le permet, légendes et opacité ;
- presets cartographiques, formats de coordonnées et mesure ;
- dossiers/tags/notes/favoris synchronisés par v6.0 ;
- export GPX fidèle et rapport de préparation imprimable ;
- revue complète erreurs, offline, skeletons, accessibilité, A53/S23 et confidentialité.

Le parcours débutant ne gagne aucune étape obligatoire.

## Décisions transverses verrouillées

- Sécurité, suivi essentiel, alertes hors trace, REC et bibliothèque locale sont gratuits.
- Les entitlements Free/Pro et les release flags sont deux systèmes séparés.
- Aucune télémétrie de coordonnées ou géométrie. Les événements produit éventuels sont opt-in,
  agrégés et documentés RGPD ; les critères UX restent testables sans analytics de production.
- Le canvas 3D n'est pas déclaré accessible : recherche, liste de waypoints et résumé textuel
  constituent l'alternative sémantique.
- Toute migration est additive et le client précédent reste supporté au moins une release.
- Aucun avertissement vital ni action terrain n'ouvre une paywall.

## Hotfix et déploiement

- Toute régression P0/P1 suspend le développement de la version suivante.
- Hotfix `x.y.z` depuis le dernier tag de production, sans embarquer le worktree futur ; report
  ensuite par commit ciblé, jamais par reset destructif.
- Le `versionCode` est attribué juste avant upload après contrôle du maximum Play Console ; un
  code seulement présent dans un worktree reste provisoire et peut être rebumpé après hotfix.
- Déploiement interne → fermé → 10 % → 50 % → 100 % avec fenêtre d'observation.
- Feature flag coupé avant rollback binaire lorsque possible.
- Commit/tag/push uniquement après accord explicite et protocole `docs/RELEASE.md`.

Les décisions et vérifications détaillées sont dans
[ROADMAP_AUDIT_DECISIONS_2026-08-08.md](docs/plans/ROADMAP_AUDIT_DECISIONS_2026-08-08.md).

---

# Archive du plan du 2026-08-03 — ne pas utiliser comme consigne

> **Document obsolète :** il contient notamment un statut v5.82 et un ordre de versions
> invalidés par l'audit du 2026-08-08. Seule la roadmap située au début de ce fichier fait foi.

> Mise à jour : 2026-08-03
> Produit principal : Android. Le web est l'atelier de préparation sur grand écran,
> sans jamais être un prérequis à l'utilisation mobile.

## Cap produit

**Promesse : « SunTrail — La randonnée au bon moment. »**

SunTrail permet de préparer une randonnée avec le relief 3D, le soleil réel et les
conditions prévues, puis de rester sur la bonne trace hors ligne sur Android.

Le niveau de qualité visé est celui d'une application outdoor professionnelle :

- la simplicité et la fiabilité cartographique de SuisseMobile ;
- la préparation, les conditions et les alertes terrain d'AllTrails ;
- une différenciation propre à SunTrail : terrain 3D, ombres solaires projetées et
  chronologie du randonneur.

Il ne s'agit pas de copier leurs interfaces ni de construire immédiatement un catalogue
communautaire. La priorité est un parcours personnel complet : **préparer → vérifier →
transférer → suivre → enregistrer**.

Références produit officielles :
[SuisseMobile Plus](https://schweizmobil.ch/fr/suisse-mobile-plus),
[planification SuisseMobile](https://schweizmobil.ch/en/plan-a-new-tour-app) et
[offres AllTrails](https://www.alltrails.com/plans).

## Principes non négociables

1. L'application reste utilisable sans compte et sans PC.
2. Les fonctions essentielles de sécurité restent gratuites.
3. Les données locales continuent de fonctionner sans réseau.
4. Toute migration de données est additive, versionnée et réversible.
5. Android reçoit les garanties terrain ; le web ne promet pas le guidage en arrière-plan.
6. Les 1 491 tests de la base v5.82.0 ne sont jamais supprimés pour faire passer une release.
7. Chaque version est protégée par des feature flags et peut être désactivée sans rollback
   destructif.
8. Les informations de précision, météo et sécurité indiquent leur source, leur fraîcheur
   et leurs limites ; aucune promesse « au centimètre près ».

## Séquence de livraison obsolète

| Version | Nom | Résultat utilisateur | Dépend de |
|---|---|---|---|
| **v5.82.0** | Fondations UX & confiance | Planifier sans geste caché, comprendre l'interface | v5.81.4 |
| **v5.83.0** | Atelier & bibliothèque locale | Créer, modifier et sauvegarder une vraie randonnée sans compte | v5.82.0 |
| **v5.84.0** | Compte optionnel & synchronisation | Préparer sur PC et retrouver la route sur Android | v5.83.0 |
| **v5.85.0** | Prêt à partir & corridor hors ligne | Vérifier les risques et emporter les données nécessaires | v5.84.0 |
| **v6.0.0** | Guidage Android hors ligne | Suivre la trace, recevoir une alerte hors parcours et enregistrer | v5.85.0 |
| **v6.1.0** | Outils experts & finition pro | Accélérer les usages avancés sans alourdir le parcours débutant | v6.0.0 |

Les plans détaillés et prompts de reprise sont indexés dans
[docs/plans/prompts/README.md](docs/plans/prompts/README.md).

## v5.82.0 — Ancienne cible (statut « livré » invalidé)

**Objectif :** rendre les actions principales explicites et accessibles avant d'ajouter
de nouvelles capacités.

- mode `Planifier` explicite ; appui simple pour ajouter un point dans ce mode ;
- appui long conservé uniquement comme raccourci expert documenté ;
- navigation mobile recentrée sur Explorer, Préparer, Sortie et Bibliothèque ;
- atelier desktop adapté aux écrans larges, sans fonction exclusive au PC ;
- recherche contextualisée : type, région/pays, altitude et distance ;
- onboarding court puis aides contextuelles ;
- réglages séparés en Essentiels, Randonnée avancée et Laboratoire développeur ;
- libellés non techniques par défaut ;
- accessibilité clavier/lecteur d'écran, cibles tactiles et contraste extérieur ;
- corrections des promesses de précision et des textes de sécurité ;
- adaptateurs temporaires pour préserver les IDs DOM et événements existants.

**Gate de sortie :** un nouveau testeur peut créer un itinéraire en moins de deux minutes
sans connaître l'appui long ; aucune régression sur recherche, GPX, REC, solaire, offline
ou RevenueCat.

**Ancienne affirmation, invalidée par l'audit du 2026-08-08 :** parcours débutant couvert par smoke Playwright, navigation et
réglages adaptatifs, classement contextualisé et contrats DOM existants conservés. Aucun
modèle `PreparedRoute`, compte/synchronisation ou guidage v5.83+ n'a été introduit.

## v5.83.0 — Atelier de préparation & bibliothèque locale

**Objectif :** construire une source de vérité durable pour les itinéraires préparés.

- modèle versionné `PreparedRoute` avec géométrie complète, waypoints, profil, statistiques,
  départ prévu, allure, notes, tags et métadonnées ;
- stockage local IndexedDB via un repository testable ;
- bibliothèque locale illimitée, distincte de l'historique GPX simplifié actuel ;
- création/import, édition, réordonnancement, inversion, annuler/rétablir et sauvegarde ;
- résumé débutant et détails experts repliables ;
- états vides, hors ligne, erreur de routing et récupération ;
- migration non destructive : l'historique existant reste visible et lisible.

**Gate de sortie :** une route sauvegardée redémarre hors ligne avec sa géométrie complète,
ses statistiques et ses métadonnées ; les anciennes traces ne sont jamais perdues.

## v5.84.0 — Compte optionnel & synchronisation PC–Android

**Objectif :** transférer les préparations entre appareils sans rendre le compte obligatoire.

- Google comme connexion principale sur Android ; lien magique e-mail en secours ;
- callbacks OAuth Android, restauration de session, déconnexion et suppression testés ;
- migrations Supabase committées et RLS propriétaire testée ;
- synchronisation offline-first des `PreparedRoute`, favoris, notes et tags ;
- consentement au premier envoi des routes locales ;
- conflits conservés sous forme de copie explicite, sans écrasement silencieux ;
- cinq routes synchronisées en Free, illimitées en Pro ; bibliothèque locale illimitée ;
- traces enregistrées, position live, cartes, clés API et réglages développeur exclus du cloud.

**Gate de sortie :** une route créée sur PC apparaît sur Android en moins de dix secondes
en ligne et reste utilisable après passage en mode avion.

## v5.85.0 — Vérification avant départ & corridor hors ligne

**Objectif :** donner une réponse claire à « suis-je prêt à partir ? ».

- rapport `RouteReadinessReport` avec métriques, météo datée, arrivée estimée, marge avant
  la nuit, pentes, couverture offline, batterie, précision GPS et permissions ;
- sévérités information/attention/critique, avec source et fraîcheur ;
- avertissements essentiels gratuits ; analyse solaire/conditions détaillée en Pro ;
- écran `Prêt à partir ?` et CTA unique `Démarrer la sortie` ;
- téléchargement d'un corridor de 1 km autour de la route ; options 500 m et 2 km ;
- progression, reprise, intégrité et avertissement si les cartes manquent ;
- le suivi de géométrie reste possible sans fond de carte téléchargé.

**Gate de sortie :** une route synchronisée est vérifiée et téléchargée avant départ, puis
reste lisible hors ligne avec des avertissements compréhensibles.

## v6.0.0 — Guidage Android hors ligne

**Objectif :** suivre une route de façon fiable sur le terrain, écran éteint et sans réseau.

- extension du service GPS natif existant, sans réécriture du REC stable ;
- sessions `guidance`, `recording` ou `both` ; anciennes API REC conservées ;
- route active copiée dans le stockage natif/Room ;
- map matching natif : progression, distance restante, écart, ETA et orientation ;
- statuts acquiring/on-route/off-route/arrived/paused ;
- seuil hors trace initial `max(40 m, 1,5 × précision GPS)` pendant 20 s ;
- retour sur trace sous 60 % du seuil pendant 10 s ; cooldown d'alerte 2 min ;
- alertes visuelles, haptiques et notification Android ; pas de voix turn-by-turn en v1 ;
- UI terrain à fort contraste et gros contrôles utilisables à une main ;
- arrêt indépendant du guidage et de l'enregistrement ; récupération après crash ;
- fallback de guidage web au premier plan seulement, sans promesse background.

**Gate de sortie :** session fonctionnelle en mode avion, écran éteint et après retrait de
l'interface des tâches récentes, sans faux hors-trace durable en cas de GPS imprécis.

## v6.1.0 — Outils experts & finition professionnelle

**Objectif :** augmenter la vitesse et la profondeur de préparation sans encombrer le flux
principal.

- déplacement précis des waypoints en 3D, mesure, annuler/rétablir et duplication ;
- opacité, légendes, seuils et profils de couches ;
- dossiers, tags, notes et favoris synchronisés ;
- comparaison de dates et d'heures de départ ;
- formats de coordonnées et densité d'information configurables ;
- export GPX et rapport de préparation ;
- revue finale des micro-interactions, erreurs, skeletons, accessibilité et performances.

**Hors périmètre jusqu'à stabilisation de v6.0 :** communauté de parcours, guidage vocal,
partage live, Wear OS, alternatives IA, intégrations Strava/Komoot/Suunto et WebGPU de
production.

## Qualité et publication communes

Pour chaque version :

1. pre-check de la version précédente ;
2. tests unitaires et E2E ajoutés avant la suppression du feature flag ;
3. `npm run check`, `npm test`, `npm run build`, `npm run check:bundle` ;
4. `npm run audit:i18n` et smoke Playwright ;
5. `npm run cap:sync`, lint/test Gradle et instrumentation Android si concerné ;
6. validation API 24, 33 et 36, Galaxy A53 et S23 pour les flux terrain ;
7. mise à jour de `CHANGELOG.md`, `TODO.md`, `CLAUDE.md`, `GEMINI.md` et des documents
   d'architecture/UX/monétisation concernés ;
8. incrément cohérent `package.json`, `versionName` et `versionCode` ;
9. déploiement interne → fermé → 10 % → 50 % → 100 %, avec contrôle crash/ANR ;
10. commit, tag et push uniquement dans le cadre du protocole de release et après accord
    explicite dans la discussion active.

## Indicateurs de réussite du programme

- route simple créée et sauvegardée en moins de deux minutes ;
- démarrage d'une sortie locale sans compte ;
- synchronisation PC–Android sous dix secondes en conditions normales ;
- disponibilité de la route, du guidage et des alertes sans réseau ;
- sécurité gratuite et absence d'upsell bloquant pendant une sortie ;
- pas de baisse du nombre de tests ni des budgets de performance ;
- surcoût CPU/batterie du guidage inférieur à 10 % par rapport au REC existant ;
- Android présenté comme produit principal et web comme atelier de préparation facultatif.

---

# Archive historique de la roadmap antérieure

> Les éléments ci-dessous sont conservés pour traçabilité. En cas de conflit de priorité,
> la roadmap produit ci-dessus fait foi.

## v5.56.2 (2026-05-31) — ✅ Complété

### Historique GPX & Dette Technique

- ✅ **Historique GPX persistant** — 5 derniers imports/REC en localStorage, mini-carte canvas
- ✅ **Fusion panneaux GPX** — Liste unifiée (historique + layers actifs + routes manuelles)
- ✅ **Reverse geocoding automatique** — Nom de lieu (MapTiler/Nominatim) + fallback pays 55 pays
- ✅ **Bouton profil toggle** — État actif, ouvrir/fermer le panneau d'élévation
- ✅ **Types GPX centralisés** — `gpxTypes.ts`, `GeoPoint`, `GPXRawData`, `getElevation()`
- ✅ **Dette technique** — `disposeTrackMesh`, `getPerformanceEpsilonMultiplier`, `createGlassModal`, cache localStorage, build-before-dispose REC mesh

## v5.56.1+ (Sources HD par pays)

### Cartes gouvernementales HD gratuites

Ajout de sources de tuiles WMTS gratuites (Open Government Data) pour les pays de randonnée.
Architecture data-driven : une entrée dans `COUNTRY_SOURCES` suffit, la détection par polygones
Natural Earth est automatique.

**Implémenté :**
- ✅ Suisse (SwissTopo) — `wmts.geo.admin.ch`
- ✅ France (IGN Geoplateforme) — `data.geopf.fr`
- ✅ Autriche (basemap.at) — `mapsneu.wien.gv.at`
- ✅ Allemagne (BKG TopPlusOpen) — `sgx.geodatenzentrum.de`
- ✅ Espagne (IGN España) — `www.ign.es`
- ✅ Norvège (Kartverket) — `cache.kartverket.no/v1/service` (nouveau CDN, accessible mondialement)

### Pays testés mais endpoints inaccessibles (à vérifier localement)

Testé le 2026-05-26 depuis l'étranger. Tous nécessitent une vérification locale
(depuis un navigateur situé dans le pays ou un VPN).

| Pays | Source | Code | Cause probable |
|------|--------|------|----------------|
| 🇨🇿 République Tchèque | ČÚZK ZM | 404 | Endpoint ArcGIS changé |
| 🇵🇱 Pologne | Geoportal 2 | 404 | API migrée |
| 🇸🇰 Slovaquie | ZBGIS | 404 | Endpoint changé |
| 🇫🇮 Finlande | MML maastokartta | 401 | Auth requise |
| 🇸🇪 Suède | Lantmäteriet | 503 | Service down |

**Comment activer :** Tester l'URL depuis l'app/navigateur local → si OK, décommenter
l'entrée dans `COUNTRY_SOURCES` et le helper dans `tileSources.ts`.

### Pays nécessitant des prérequis

| Pays | Source | Prérequis |
|------|--------|-----------|
| 🇸🇮 Slovénie | GURS | URL WMTS à trouver (recherche docs GURS) |
| 🇮🇹 Italie | Geoportale Nazionale | Pas de WMTS national de qualité rando |
| 🇮🇹 Piémont | BDTRE (Région Piemonte) | EPSG:32632 uniquement (pas Web Mercator) — reprojection nécessaire |
| 🇮🇹 Südtirol | MapProxy BZ | 60+ couches EPSG:3857 mais couverture régionale seulement |
| 🇬🇧 Royaume-Uni | Ordnance Survey | Clé API gratuite à configurer |
| 🇯🇵 Japon | GSI Maps | Étendre `countries.ts` à l'Asie (ingest Asia) |
| 🇳🇿 Nouvelle-Zélande | LINZ Topo50 | Clé API gratuite à configurer |
| 🇺🇸🇨🇦 USA/Canada | USGS/NRCan | Faible priorité rando Europe |

### URLs trouvées (prêtes dans `tileSources.ts`)

```
CZ: https://ags.cuzk.gov.cz/arcgis/rest/services/ZM/MapServer/WMTS/tile/1.0.0/ZM/default/GoogleMapsCompatible/{z}/{y}/{x}.png
PL: https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
SK: https://zbgisws.skgeodesy.sk/zbgisservices/wmts/service.svc/get?SERVICE=WMTS&REQUEST=GetCapabilities&VERSION=1.0.0
FI: https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png
SE: https://api.lantmateriet.se/open/topowebb-ccby/v1/wmts/tile/1.0.0/topowebb/default/web_mercator/{z}/{y}/{x}.png
JP: https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png
```

### Pour reprendre

1. Vérifier les URLs WMTS depuis un navigateur/navire dans le pays cible
2. Décommenter le helper URL dans `tileSources.ts` (ex: `cuzkTopo()`, `gsiJpTopo()`)
3. Décommenter l'entrée dans `COUNTRY_SOURCES`
4. Ajouter les tests dans `tileLoader.test.ts` + `terrain.source.test.ts`
5. Lancer `npm test` — 859+ tests doivent passer

**Futur — Vectoriel partiel (labels superposés) :** Tentative le 2026-05-28 d'implémenter
des labels vectoriels via tuiles PBF (Swisstopo `base.vt`, IGN `planign`, MapTiler v3)
superposés en sprites Three.js Canvas. Abandonné — problèmes non résolus :

- **Doublons** : labels vecto + labels raster se superposent, opacité conditionnelle au
  zoom insuffisante pour éviter la redondance visuelle.
- **Parallax** : sprites 3D se déplacent différemment du terrain lors du pan (décalage
  de perspective entre le sprite et le mesh de la tuile).
- **Densité** : tuiles vectorielles contiennent trop d'entités (centaines de communes),
  nécessite un filtrage agressif par admin_level qui devient spécifique à chaque source.
- **Sources** : endpoints PBF hétérogènes (schémas de couches incompatibles entre pays),
  absence de tuiles vectorielles pour l'Allemagne (BKG raster-only), Suisse LightBaseMap
  inaccessible (geoblock probable).

**Pistes alternatives à explorer :**
- Rendu HTML/CSS overlay (CSS3DRenderer) au lieu de sprites 3D — éliminerait le parallax
  mais coût perf élevé.
- Remplacer les sources raster avec labels par des sources raster sans labels + overlay
  vecto (nécessite des endpoints "no labels" que peu de fournisseurs proposent).
- Améliorer la lisibilité des labels raster existants (upscaling @2x, sharpening shader).

---

---

### v5.70.0 - v5.73.0 — ✅ Packs Pays & Optimisations

- ✅ **Packs Pays** : Suisse v3 (664 Mo), France Alpes v2 (515 Mo), Autriche v2 multi-source (985 Mo)
- ✅ **Data-driven inPackZone** : `hasInstalledPackForCountry()` remplace `(inCH||inFR)` codé en dur
- ✅ **Badge LOD cliquable** : détection automatique du pack couvrant la position
- ✅ **Cache partitionné** : `OFFLINE_CACHE_NAME` séparé + index O(1) + warmup au démarrage
- ✅ **Pools matériaux/géométries adaptatifs** : eco:6→ultra:24 (matériaux), 32→128 (géométries)
- ✅ **Normal map RG compact** : VRAM -50% pour les normales (stockage 2 canaux, reconstruction GPU)
- ✅ **Timeout 30s** sur `tile.load()` : évite blocage indéfini
- ✅ **Race condition cache** : `initCacheLayer()` appelé avant `loadTerrain()`
- ✅ **Tests P0** : `initCacheLayer`, `resetTileLoaderState`, `hasInstalledPackForCountry`, `getMinPackZoom`, `inPackZone` (+20 tests)

---

### Paiements Web — Restauration par Email

**Problème critique :** Un utilisateur qui paie via Stripe sur web perd l'accès s'il change de navigateur ou vide le cache (App User ID aléatoire en localStorage).

**Solution :** Email-based restauration sans login obligatoire.

**Logique :**
1. Après paiement Stripe → proposer d'entrer son email (optionnel mais recommandé)
2. Stocker email dans `localStorage` + utiliser comme App User ID RevenueCat
3. À chaque démarrage web → vérifier email en localStorage ; si présent, l'utiliser
4. Ajouter bouton "Restaurer achats par email" dans UpgradeSheet pour retrouver les achats

**Fichiers :**
- `src/modules/iapService.ts` : post-paiement demander email, initialisation App User ID depuis email localStorage
- `src/modules/ui/components/UpgradeSheet.ts` : bouton "Restaurer par email"
- `src/modules/packManager.ts` : même logique pour les packs

**Avantages :**
- ✅ Non-invasif (pas de login obligatoire)
- ✅ Protège immédiatement les utilisateurs qui entrent email
- ✅ Permet restauration si cache vidé
- ✅ Fondation pour OAuth optionnel plus tard

**Effort :** 2-3h

---

## v5.79.0 — Upgrade Three.js 0.160 → 0.184 ✅ (2026-06-20)

> Plan détaillé : [docs/plans/UPGRADE_THREEJS_184.md](docs/plans/UPGRADE_THREEJS_184.md)

### Objectif

Upgrade de Three.js de la version 0.160.1 à 0.184.0 (24 versions d'écart) en conservant `WebGLRenderer`. Prérequis indispensable pour la migration WebGPU ultérieure (v6.5/v7.0).

### Phases

| Phase | Description | Durée |
|---|---|---|
| A | Audit des changelogs r160→r184 (12 domaines critiques) | 0.5 j |
| B | Upgrade par 5 paliers (r165→r170→r175→r180→r184) avec gate Android à chaque palier | 2.0 j |
| C | Vérification visuelle des 23 systèmes de rendu | 1.5 j |
| D | Tests 7 plateformes (desktop + mobile + WebView Capacitor) | 2.5 j |
| E | Release (version, changelog, docs, tag) | 0.5 j |
| **Total** | | **7.0 j** |

### MR séparées (post-upgrade ✅)

| MR | Package | Actuel → Cible |
|---|---|---|
| MR-A | `suncalc` | 1.9.0 → 2.0.0 ✅ |
| MR-B | `typescript` | 5.9.3 → 6.0.3 ✅ |
| MR-C | `@mapbox/vector-tile` + `pbf` | 2.0.4 → 3.0.0 / 4.0.1 → 5.1.0 ✅ |
| MR-D | `@revenuecat/purchases-capacitor` | 12.3.0 → 13.2.0 ✅ |

### Points de vigilance

- `logarithmicDepthBuffer` sur Mali G71/G72 (S9/S10) — bug connu `gl_FragDepth` ignoré → z-fighting
- `onBeforeCompile` GLSL injection — noms de chunks internes (`#include <begin_vertex>`, etc.) peuvent avoir changé
- `ShaderMaterial` météo — dépend de `logdepthbuf_*` chunks
- `compass.ts` mini-renderer indépendant — contexte WebGL séparé à vérifier

---

## v6.0+ (Moyen terme)

### Authentification Utilisateur Optionnelle

**Objectif :** Accès cross-device transparent aux achats (navigateur → navigateur, app → web, etc.).

**Approches :**
1. **Login Email Léger** : email + lien de confirmation (sans password)
2. **OAuth** : Google/Apple Sign-in (transparent, UX meilleure)
3. **WebAuthn** : biométrie/clé sécurité (futur)

**Bénéfices :**
- Utilisateur login → retrouve Pro/packs sur tous les appareils
- Sync avec Android via même email RevenueCat
- Préparation pour sync cloud (sauvegardes traces, préférences, etc.)
- Analytics utilisateur (améliore monétisation)

---

## v6.0+ (Moyen-long terme)

### Autres Features Payantes

- **Intégration Strava/Komoot** : auto-import traces (Pro)
- **Cloud Sync** : sauvegardes traces/marque-pages (Pro)
- **API Publique** : accès données via webhook (Professionnel/B2B)
- **Marque-pages Collaboratifs** : partage itinéraires entre randonneurs (Pro)

---

## v6.5 — WebGPU Expérimental (opt-in debug)

> Prérequis : v5.79.0 (Three.js 0.184). Plan détaillé : [docs/plans/UPGRADE_THREEJS_184.md](docs/plans/UPGRADE_THREEJS_184.md)

### Objectif

Activer `WebGPURenderer` en mode expérimental pour les utilisateurs qui le souhaitent, avec fallback automatique `WebGLRenderer` si `navigator.gpu` est absent.

### Implémentation

- `state.USE_WEBGPU: boolean` (default `false`, persisté localStorage)
- Détection `!!navigator.gpu` dans `performance.ts`
- `initScene()` conditionnel : `WebGPURenderer` si dispo ET activé, sinon `WebGLRenderer`
- Type `state.renderer: THREE.WebGLRenderer | THREE.WebGPURenderer | null`
- Toggle `webgpu-toggle` dans `SettingsSheet.ts` → Paramètres Avancés (sous `debug-toggle`)
- Si `navigator.gpu` absent → toggle grisé avec tooltip "WebGPU non supporté sur cet appareil"

### Limitations connues

- Shaders terrain (`onBeforeCompile`) restent en GLSL — rendu WebGL uniquement pour l'instant
- Météo (`ShaderMaterial`) reste en GLSL — pas de rendu WebGPU
- Ces shaders seront migrés en TSL en v7.0

---

## v7.0 — WebGPU Production (WebGPU-first)

### Objectif

WebGPU devient le renderer par défaut avec migration complète des shaders et fallback WebGL automatique.

### Implémentation

- Migration TSL des shaders terrain (remplace `onBeforeCompile` GLSL injection)
- Migration TSL du shader météo (remplace `ShaderMaterial` GLSL)
- Polyfill `logarithmicDepthBuffer` pour WebGPU (si disponible dans Three.js r185+)
- `WebGPURenderer` par défaut, `WebGLRenderer` fallback automatique
- Tests exhaustifs Android : Mali (G68, G71, G72, G77), Adreno 6xx/7xx, WebView Capacitor
- Compass mini-renderer : migration CSS/Canvas2D ou unification contexte

### Prérequis

- Three.js r185+ (maturation WebGPU backend)
- Support Android WebGPU élargi (Chrome 121+)
- Retour utilisateur de la phase expérimentale v6.5

---

## Photography & Light Planning

> Analyse des fonctionnalités utiles aux photographes utilisant SunTrail.

Le moteur solaire 3D existant (ombres portées, azimut, heure dorée, phase lunaire) est un socle idéal pour des outils de planification photo. Voici les pistes identifiées, classées par effort/impact.

### Shot Planner (Effort moyen — Impact fort)

**Objectif :** Permettre au photographe de planifier précisément où et quand se tenir pour une photo, en utilisant les données terrain/soleil déjà disponibles.

- **Golden Hour Explorer** — Afficher sur la carte les zones qui seront en plein soleil / ombre dorée à un instant T (déjà partiellement possible via l'overlay 3D solaire). Amélioration : filtrer par "uniquement les zones où le soleil rase le relief" (golden hour).
- **Sunrise/Sunset Compass** — Overlay directionnel sur la carte montrant le point exact où le soleil se lève/couche par rapport au relief (intégré à la boussole Pro existante). Utile pour composer avec un pic ou un lac en silhouette.
- **Altitude du soleil au premier plan** — Indiquer si le soleil sera visible depuis un point donné (pas masqué par une crête) à une date/heure donnée. Le raycasting `isAtShadow()` le fait déjà, mais il faudrait une UI dédiée "le soleil sera-t-il visible à cet endroit à cette heure ?".
- **Carte des ombres projetées** — Snapshot de l'overlay 3D à un instant T exportable en image (pour préparer un shooting à l'avance).

### Seasonal Planner (Effort important — Impact fort)

**Objectif :** Aider à choisir la meilleure saison/période pour photographier un lieu.

- **Calendrier lumineux** — Pour un point donné, visualiser sur l'année : heure du lever/coucher, azimut à chaque saison, durée du jour, position du soleil par rapport aux crêtes environnantes.
- **Aide au choix saison** — Simulation rapide des ombres à différentes dates (solstice d'été → ombres courtes, soleil haut ; solstice d'hiver → ombres longues, soleil rasant). Les photographes de montagne cherchent souvent l'été pour les alpages en lumière ou l'hiver pour les effets de contraste.
- **Éphémérides photo** — Tableau de bord avec : lever/coucher, heure dorée/début-fin, azimut au lever/coucher, phase lunaire, hauteur max du soleil. (Données déjà calculées dans `SolarAnalysisResult`, manque juste l'UI dédiée.)

### Condition Tracker (Effort moyen — Impact moyen)

**Objectif :** Anticiper les conditions atmosphériques qui font la différence entre une photo banale et une photo exceptionnelle.

- **Visibilité météo** — Coupler les prévisions météo (déjà intégrées via Open-Meteo) avec l'analyse de terrain : probabilité de ciel dégagé à l'heure dorée, visibilité des pics lointains.
- **Indice de turbidité** — Données sur la clarté de l'air (aérosols) pour estimer la qualité de la lumière. API Open-Meteo AQI / CAMS.
- **Snow Line Tracker** — Altitude de la limite pluie/neige → savoir si les sommets seront enneigés (contexte photo hiver/printemps).
- **Leaf Season Indicator** — Modèle empirique basé sur l'altitude et la latitude pour prédire les couleurs d'automne (rough, mais utile).

### Astro Photography (Effort important — Impact niche)

**Objectif :** Planification photo nocturne (voie lactée, stars trails).

- **Milky Way Visibility** — Calendrier de visibilité de la Voie Lactée : lever/coucher, position par rapport au relief, phase lunaire (pas de lune = ciel noir). API SunCalc ne couvre pas ça — nécessite une lib externe ou calculs astronomiques.
- **Dark Sky Map** — Superposition des zones de pollution lumineuse (couche tuile Light Pollution Map, VIIRS DNB). Identifier les meilleurs spots autour d'un refuge.
- **Blue Hour Planner** — Heure exacte du coucher civil/nautique/astronomique pour la photo crépusculaire.

### Technical Debt / Prérequis

- L'API solaire (`runSolarProbe`) calcule déjà : azimut, élévation, heure dorée, phase lunaire, lever/coucher. Certaines données sont Pro-only dans l'UI mais disponibles en interne.
- L'overlay 3D (`buildSolarOverlay`) colore déjà le tracé par ombre/soleil — pourrait être étendu en overlay plein écran pour la planification photo.
- Les données météo (`weather.ts`, Open-Meteo) sont déjà intégrées et peuvent être croisées avec les données solaires.
- Le raycasting `isAtShadow()` est la brique de base pour déterminer si un point est dans la lumière ou l'ombre à un instant donné.

### Priorités suggérées

| Priorité | Feature | Effort | Impact |
|----------|---------|--------|--------|
| P0 | Vue "Azimut lever/coucher" dans les stats point | Faible (données existantes) | Fort |
| P1 | Export snapshot ombres (carte ou overlay) | Moyen | Fort |
| P2 | Calendrier lumineux saisonnier | Important | Très fort |
| P3 | Dark Sky Map / pollution lumineuse | Moyen | Niche |
| P4 | Milky Way tracker | Important | Niche |

---

## Notes

- **RevenueCat :** Documenté [docs/MONETIZATION.md](docs/MONETIZATION.md)
- **Production Stripe :** À faire lors passage en prod (clés live, domaine production, etc.)
- **Tests :** 750 tests passent (iapService mocké dans `src/test/setup.ts`)
