# Prompt autonome — SunTrail v5.87.0 Dépôt de traces pleine fidélité

> Statut : exécuté et clôturé pour publication GitHub le 2026-09-02. Les contrats, preuves et
> limites de la release sont consignés dans `docs/TRACK_STORAGE.md`, `CHANGELOG.md` et `ROADMAP.md`.

Tu travailles sur SunTrail dans `D:\Python\suntrail_threejs`. L'objectif de v5.87 est de rendre
les REC et imports durablement fiables après redémarrage grâce à un `TrackRepository` local
distinct de `RouteRepository`, sans compliquer Bibliothèque et sans retirer une fonction Free.

## Point de départ à protéger

Lis intégralement `AGENTS.md`, `CLAUDE.md`, le haut de `CHANGELOG.md`, la section active de
`ROADMAP.md`, `docs/MONETIZATION.md`, l'architecture du stockage et les tests existants. Inspecte
ensuite `git status` et le diff avant toute modification : le worktree peut contenir les correctifs
pré-v5.87 validés sur Galaxy S23 (STOP de notification REC, pastille REC vers Sortie, sommets dans
Explorer et fallback cartographique CH/DE). Ne les écrase pas et ne les mélange pas aveuglément.

Vérifie les versions source/Android et l'état Git réellement présents. Ne déduis pas l'état Play
Console d'un fichier local. Aucun commit, tag, push, release, upload, déploiement, bump de version,
stage ou stash sans autorisation explicite.

## Audit avant implémentation

Cartographie, avec fichiers et tests à l'appui :

- où vivent actuellement les REC complets (Room natif, snapshots du bridge, IndexedDB,
  `localStorage`) et à quel moment ils sont simplifiés ou dupliqués ;
- où vivent les imports GPX et les routes préparées, et quelles conversions sont explicites ;
- les flux start/stop/reprise après mort WebView, notification, Sortie et Bibliothèque ;
- les cinq entrées legacy, leurs champs réellement disponibles et les chemins de migration ;
- les limites actuelles Free/Pro, l'export, le multi-affichage, le quota navigateur/appareil et les
  contrats d'événements/IDs DOM à préserver.

Présente d'abord un bref design et une matrice de migration. Ne crée pas un second historique en
parallèle et ne transforme pas `PreparedRoute` en trace enregistrée.

## Contrat produit Free/Pro verrouillé

- Free conserve toutes les traces locales présentes sur l'appareil et peut les ouvrir, renommer,
  supprimer, refaire et suivre, avec une seule trace active sur la carte et les statistiques
  essentielles.
- Pro ajoute les opérations avancées réellement disponibles : plusieurs traces simultanées,
  export de fichier, analyses approfondies et organisation évoluée.
- La géométrie pleine fidélité est une garantie de données pour Free comme pour Pro. Aucun ancien
  REC/import ne devient bloqué, masqué, simplifié ou supprimé à cause d'un quota commercial.
- La seule limite de persistance locale est le stockage réel. En cas de pression, informer,
  permettre de choisir quoi supprimer et préserver l'enregistrement en cours ; aucun nettoyage
  silencieux.
- Un downgrade conserve tout. Les actions Pro se désactivent, mais chaque trace reste lisible et
  utilisable individuellement.

## Modèle et repository

Définis un contrat versionné minimal à partir des données réellement disponibles : identité,
origine (`recording`, import GPX ou migration legacy), nom Unicode, géométrie complète ordonnée,
horodatages lorsqu'ils existent, statistiques dérivées avec leur provenance, bounds, qualité de
géométrie et dates de création/modification. Ne fabrique jamais une altitude, une précision ou un
timestamp absent.

Le repository doit :

- recevoir sa dépendance de stockage pour rester testable avec une IndexedDB isolée ;
- fournir des écritures atomiques/idempotentes et éviter les doublons après STOP, reprise ou
  redémarrage ;
- conserver la géométrie complète à l'import et au REC, sans utiliser la version d'affichage
  simplifiée comme source canonique ;
- distinguer clairement trace enregistrée, route préparée et conversion « Refaire » ;
- exposer des erreurs typées pour quota, corruption, transaction interrompue et version inconnue ;
- ne jamais laisser l'UI écrire directement dans plusieurs stockages concurrents.

## Migration additive et compatibilité

- Migrer les entrées legacy une seule fois avec un marqueur/version et une stratégie reprenable.
- Dédupliquer uniquement avec une identité ou une empreinte documentée, jamais avec le seul nom.
- Marquer `full`, `approximate` ou équivalent selon les données réellement conservées. Une trace
  legacy simplifiée reste consultable, mais demande un réimport avant un guidage de confiance.
- Conserver la lecture par le client précédent pendant au moins une release si son format le
  permet ; ne supprimer l'ancien stockage qu'après gate et autorisation séparée.
- Tester migration interrompue, relance, base vide, données partielles/corrompues, accents/emoji,
  gros GPX, nombreux points identiques et timestamps manquants.

## Intégration des flux

Unifie tous les STOP REC autour d'une seule finalisation durable : flush natif, lecture complète,
nommage ou abandon explicite, écriture atomique, accusé de succès puis nettoyage de la session.
Un redémarrage ne doit jamais reproposer deux fois le même REC déjà traité. Annuler doit réellement
ne pas enregistrer, sans perdre silencieusement une session encore récupérable.

Bibliothèque reste un catalogue unique « Mes parcours » : vocabulaire simple, actions compactes
et cohérentes sur petit mobile. L'origine et la qualité sont secondaires mais explicites. Ouvrir
une trace ne la transforme pas implicitement en route préparée ; « Refaire » reste la conversion
explicite.

## Tests et gates bloquants

- Unitaires repository avec nouvelle factory par test : CRUD, ordre, concurrence, rollback,
  quota, corruption, Unicode et géométries volumineuses.
- Migration idempotente des cinq legacy, interruption/reprise et aucune perte de champ connu.
- E2E import GPX → Bibliothèque → reload/offline → ouvrir/suivre ; REC → chacun des STOP → nommer ou
  abandonner → kill/restart → aucune seconde demande ni doublon.
- Free : toutes les traces restent accessibles une par une. Pro : multi-affichage/export. Downgrade
  : données intactes et accessibles une par une.
- Android : S23/API 36 réel pour notification STOP, mort/reprise WebView et gros REC. Ne lance pas
  sur le téléphone un test instrumenté qui efface Room ou `TrackingPrefs`.
- Gates standard : TypeScript, Prettier, ESLint, suite Vitest, build web/Capacitor, contrôle des
  actifs, tests JVM/Gradle pertinents et `git diff --check`.

## Livrables

Code, tests, documentation d'architecture/migration, mise à jour honnête de la roadmap,
monétisation et changelog. Le bilan final distingue tests simulés, automatisés et physiques,
indique les fichiers modifiés et les limites restantes. Ne déclare pas v5.87 terminée tant que la
migration, le scénario REC réel et le downgrade sans perte ne sont pas prouvés.
