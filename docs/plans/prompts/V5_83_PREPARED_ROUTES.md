# Prompt autonome — SunTrail v5.83.0 Planifier, évaluer et sauvegarder

Travaille après une v5.82.0 publiée et entièrement verte. Réalise v5.83.0 sans compte ni cloud :
une randonnée préparée doit être sauvegardée localement, réouverte offline et aider le débutant
à savoir si elle lui correspond.

## Lecture et pré-check

Lis `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`, `docs/plans/PRODUCT_EVOLUTION_2026.md`,
`docs/plans/ROADMAP_AUDIT_DECISIONS_2026-08-08.md`, architecture, navigation, monétisation,
GPX/history/routing/storage et leurs tests. Exécute `git status`, `npm run check`, `npm test`.
Si v5.82 ou ses gates manquent, arrête et décris l'écart ; ne crée pas un second flux.

## Domaine obligatoire

Créer `PreparedRouteV1` exactement comme défini dans le plan : données métier locales,
`guidanceQuality`, sans `syncState`, révision distante ni tombstone. Conserver heure de départ et
allure car elles alimentent ETA et soleil.

- Validation/migration pures et `schemaVersion`.
- Géométrie originale complète conservée.
- `RouteRepository` seul accès au stockage ; UI sans appel IndexedDB direct.
- Injection d'une interface/`IDBFactory`.
- Transactions atomiques et erreur de quota/corruption récupérable.

## Tests IndexedDB décidés

- Ajouter `fake-indexeddb` en devDependency et une factory neuve par test.
- Unitaires : CRUD, transaction, concurrence, upgrade, corruption, quota/erreur et fermeture.
- E2E Chromium avec vraie IndexedDB : save, reload, offline, upgrade et suppression.
- Ne pas dépendre d'un support IndexedDB implicite de happy-dom.

## Atelier et bibliothèque

- Créer/importer, nommer, sauvegarder, rouvrir, dupliquer, favori et supprimer.
- Waypoints : ajouter, déplacer, réordonner, inverser, supprimer, undo/redo.
- États vide, calcul, erreur routing, offline et brouillon non sauvegardé.
- Bibliothèque locale illimitée selon stockage appareil.
- Free : un tracé importé actif affiché ; Pro : multi-affichage. Sauvegarder n'est pas payant.
- Conserver IDs/adaptateurs v5.82 et faire évoluer le même onglet Bibliothèque.

### Clarification fonctionnelle issue de la validation terrain

- Distinguer une route en préparation, une trace consultée et le REC indépendant.
- Une sélection de trace change carte/profil/pente, jamais le brouillon ni son bandeau.
- Fournir une action explicite pour préparer un GPX et protéger tout brouillon modifié avant
  remplacement par Sauvegarder / Remplacer / Annuler.
- Afficher le nombre de traces réellement visibles et des actions rapides pour masquer les
  autres ou toutes les traces chargées, sans masquer ni altérer le REC.
- Ne charger sur la carte aucune des routes IndexedDB qui n’a pas été explicitement ouverte.
- Conserver tous les points d'un GPX dans `geometry`, mais garder des waypoints éditables compacts :
  A/B pour une trace ouverte ; A, deux passages intermédiaires et B au départ pour une boucle.
  À la réouverture d'une route préparée, restaurer explicitement son profil complet.

## Adéquation débutant et différenciation SunTrail

- Heure de départ, ETA et marge avant coucher du soleil dans le résumé principal.
- Demander à ORS `traildifficulty`, `steepness`, `surface`, `waytype` pour foot-hiking.
- Afficher difficulté technique et couverture des données ; OSRM/manquant = inconnue.
- Ne jamais inventer T1–T6 à partir de la seule pente.
- Afficher séparément un effort physique transparent basé sur distance, D+ et durée.
- Résumé simple puis détails repliables.
- Fournir une alternative accessible au canvas : recherche A/B, liste de waypoints clavier et
  résumé textuel route/profil.

## Legacy

- Ne pas modifier/supprimer l'historique localStorage et ses cinq entrées.
- Conversion explicite d'une entrée simplifiée en `legacy-conversion` avec qualité
  `approximate` ; demander le GPX original ou un recalcul pour `full`.
- Aucune route approximative ne devient silencieusement guide-ready.

## Release flags

Créer un registre de flags de release séparé des entitlements, avec défauts sûrs build-time,
override distant versionné/TTL/last-known-good et override développeur. Flag `preparedRoutes`.
Ne pas utiliser ce système pour les droits Pro ou la sécurité.

## Hors périmètre

Guidage, corridor, account/Supabase, sync, partage, dossiers cloud et changement de prix.

## Acceptation et gates

- A/B → calcul → difficulté/effort/soleil → sauvegarde → fermeture → reload offline → route intacte.
- Brouillon interrompu ne corrompt pas la dernière sauvegarde.
- Legacy reste visible ; conversion marquée approximative.
- Matrice difficulté couverte : ORS complet, ORS partiel et OSRM/donnée absente. « Inconnue »
  est un résultat valide et expliqué ; effort, ETA et soleil restent disponibles.
- E2E débutant <2 min mesuré dans le test, sans analytics de coordonnées.
- Tous les gates check/test/build/bundle/i18n/smoke et tests ciblés passent.

Mettre à jour changelog, TODO, CLAUDE, GEMINI, architecture, UX et monétisation. Versionner
seulement après gates. Aucun commit/tag/push sans autorisation. Le bilan final détaille schéma,
migrations, tests fake/réels, flags, compatibilité et limites.
