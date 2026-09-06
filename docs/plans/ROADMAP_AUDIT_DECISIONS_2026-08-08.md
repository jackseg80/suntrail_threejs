# Décisions après audit critique de la roadmap — 2026-08-08

> **Instantané historique.** Les chiffres de la section « État vérifié » décrivent le premier
> audit. Depuis, v5.82.0 est finalisée dans le worktree avec 1 491 tests et six smoke Chromium
> verts ; validation terrain Galaxy S23 acceptée le 2026-08-09 sans P0/P1 signalé. v5.82.0
> est désormais clôturée et publiée. Les décisions produit restent applicables, avec l'ordre courant
> défini dans `ROADMAP.md`.

## Verdict

L'audit externe identifie correctement les principaux risques de séquencement, de
monétisation et d'infrastructure. Il surestime toutefois deux points : v5.82 possède déjà
une valeur UX autonome et Android dispose déjà d'un service GPS séparé avec Room. La roadmap
est révisée sans jeter le travail v5.82 en cours.

## État vérifié lors du premier audit — archivé

- Production et numéros applicatifs : **v5.81.4**, `versionCode 896`.
- Worktree : v5.82 partiellement implémentée, 49 fichiers modifiés et plusieurs fichiers
  non suivis au moment de l'audit.
- Qualité locale : `npm run check` passe ; 128 fichiers et 1 489 tests Vitest passent.
- Gate rouge : 6/6 smoke Chromium expirent dans `page.goto()` avant le flux testé.
- IndexedDB est utilisé par certaines briques cache, mais aucun `RouteRepository` n'existe.
- Aucun dossier `supabase/` ni migration SQL n'existe dans le dépôt.
- Android contient `RecordingService`, `RecordingPlugin`, Room (`AppDatabase`, `GPSPoint`, DAO)
  et un processus `:tracking` ; les tests Android réels restent les exemples générés.
- Les contrôles Google/compte restent volontairement masqués en production.
- Le module `featureFlags.ts` centralise les entitlements Free/Pro, pas des flags de release.

## Réponses aux critiques

| Point | Décision | Motif |
|---|---|---|
| Fusion v5.82/v5.83 | Non rétroactivement | v5.82 est quasi implémentée. Elle devient une RC à finir ; v5.83 doit livrer la sauvegarde locale comme prochaine valeur forte. |
| Dépendance en cascade | Accepté | Chaque version reçoit désormais un résultat autonome et un fallback ; la sync ne bloque plus le guidage. |
| Guidage trop tard | Accepté | Moteur de suivi validé en interne en v5.84 ; guidage natif robuste avancé en v5.85. |
| `PreparedRoute` orienté cloud | Accepté en partie | `revision`/`syncState` sortent du domaine. L'heure et l'allure restent métier car elles alimentent ETA et soleil. |
| Bibliothèque prématurée | Accepté | v5.82 doit parler honnêtement de traces récentes ; v5.83 étend le même point d'entrée sans remplacement brutal. |
| Android from-scratch | Rejet factuel, risque accepté | Service et Room existent, mais matcher, session de route, notifications de guidage et tests natifs restent importants ; le scope est scindé. |
| Gate GPX contradictoire | Accepté | Bibliothèque locale illimitée ; Free limité à un tracé actif affiché, Pro multi-affichage. |
| Corridor offline indécis | Accepté | Free : un corridor actif de 1 km remplaçable, distinct de la zone manuelle. Pro : plusieurs corridors et largeurs. |
| RevenueCat au login | Accepté | `logIn` Android existe, mais fusion/restore doivent être vérifiés. Le web nécessite un vrai flux de liaison. |
| Cinq routes et downgrade | Accepté | Aucune suppression ; cinq slots d'écriture choisis, surplus cloud en lecture/téléchargement. |
| Tests IndexedDB | Accepté | `fake-indexeddb` pour unitaires + vrais tests Playwright Chromium pour transactions/migrations. |
| Readiness circulaire | Accepté | Rapport en couches : noyau local immédiat, enrichissements météo/solaire optionnels, offline calculé indépendamment. |
| Budget CPU 10 % | Accepté | Remplacé par un benchmark REC-only avant implémentation et un budget batterie absolu mesuré sur trois runs. |

## Décisions produit verrouillées

### Modèle local puis sync

`PreparedRouteV1` contient uniquement le domaine : identité locale, nom/source/profil,
waypoints, géométrie complète, statistiques, bounds, heure de départ, allure, favori,
notes/tags et dates locales. Le futur lot de synchronisation, reporté après v6.1, ajoute un
`SyncEnvelope` séparé avec état, révision distante, curseur et tombstone.

### Difficulté et adéquation

- Demander `traildifficulty`, `steepness`, `surface` et `waytype` à ORS lorsqu'une clé est
  disponible.
- Afficher la difficulté technique issue des données SAC/OSM avec sa couverture.
- Si la donnée manque ou si OSRM est utilisé, afficher « difficulté technique inconnue » ;
  ne pas déduire T1–T6 de la seule pente.
- Afficher séparément l'effort physique à partir de distance, D+ et durée, avec méthode
  transparente.

ORS expose officiellement `traildifficulty` pour `foot-hiking`, mais la donnée dépend des
tags OSM : [documentation ORS Extra Info](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/).

### RevenueCat

Sur Android, passer de l'identité anonyme au Supabase UID avec `Purchases.logIn`, vérifier
le `CustomerInfo` avant/après et tester achat anonyme, login, restore, logout et changement
de compte. Le dashboard doit utiliser un comportement compatible avec un compte optionnel.
RevenueCat documente que la fusion dépend de l'existence et des alias de l'identité cible :
[Identifying Customers](https://www.revenuecat.com/docs/customers/identifying-customers) et
[Restore Behavior](https://www.revenuecat.com/docs/projects/restore-behavior).

Le web ne doit pas utiliser l'e-mail comme App User ID et ne doit pas considérer une nouvelle
configuration SDK comme une preuve de fusion. Un runbook de restauration est obligatoire.

### IndexedDB

- Injection d'un `IDBFactory` dans le repository.
- Unitaires avec `fake-indexeddb`, factory neuve par test.
- E2E Chromium avec vraie IndexedDB pour upgrade, fermeture forcée, quota/erreur simulée et
  persistance après reload.
- Le projet `fake-indexeddb` est conçu pour tester l'API en Node et fournit
  `fake-indexeddb/auto` : [README officiel](https://github.com/dumbmatter/fakeIndexedDB).

### OAuth

Utiliser un flux Authorization Code + PKCE avec callback custom scheme enregistré dans
Android et dans la liste Supabase. Documenter redirect URL, Google provider, SHA-1/SHA-256
Play signing et tests internal/closed track. Supabase recommande PKCE et documente les deep
links natifs : [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow) et
[Native Mobile Deep Linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

### Guidage Android

Le service GPS/Room existant évite un redémarrage from-scratch, mais ne prouve pas encore un
guidage fiable. La v5.85 doit déclarer le type de foreground service et les permissions adaptés,
respecter les restrictions de démarrage en arrière-plan selon l'API, puis tester Room et le
service sur Android réel. Références officielles :
[déclaration des foreground services](https://developer.android.com/develop/background-work/services/fgs/declare),
[restrictions de démarrage](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)
et [tests Room](https://developer.android.com/training/data-storage/room/testing-db).

### Analytics et confidentialité

Les critères UX sont validés d'abord par E2E chronométré et tests utilisateurs. Une
télémétrie produit éventuelle doit être opt-in, agrégée, sans coordonnées ni géométrie,
documentée RGPD et désactivable. Aucun SDK publicitaire n'est ajouté.

### Accessibilité de la carte

Le canvas WebGL ne sera pas présenté comme entièrement accessible. v5.83 doit fournir un
parcours sémantique équivalent : recherche de départ/arrivée, liste de waypoints éditable au
clavier et résumé textuel route/profil. Les gestes 3D restent une amélioration visuelle.

## Politique de hotfix

- Une régression P0/P1 suspend la version suivante.
- Correctif sur la dernière version publiée en `x.y.z`, sans embarquer les fonctions du
  worktree suivant.
- Si le worktree contient déjà la version suivante, créer une branche de hotfix depuis le
  tag de production ; reporter ensuite le correctif sans reset destructif.
- Les migrations restent compatibles avec le client précédent et les flags de release sont
  coupés avant tout rollback binaire lorsque possible.
