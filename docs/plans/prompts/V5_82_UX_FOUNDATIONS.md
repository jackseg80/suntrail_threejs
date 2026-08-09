# Archive — ancien prompt de reprise SunTrail v5.82.0

> **Ne plus utiliser.** La reprise est terminée dans le worktree. La validation terrain en
> cours est décrite dans [V5_82_S23_FIELD_VALIDATION.md](../V5_82_S23_FIELD_VALIDATION.md),
> puis la prochaine implémentation sera v5.83 après publication de v5.82.

Tu travailles dans un worktree SunTrail contenant une **v5.82.0 quasi terminée mais
interrompue**. Ne recommence pas le prompt initial. Ne reset, revert, checkout ni écrase aucun
changement existant.

## Lecture obligatoire

Lis intégralement `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`,
`docs/plans/V5_82_RESUME_STATUS.md`, `docs/plans/PRODUCT_EVOLUTION_2026.md`, les documents UX,
architecture et style, puis inspecte `git status`, `git diff` et les tests modifiés.

La production reste v5.81.4. `package.json` et Android restent volontairement à 5.81.4/896
tant que les gates ne passent pas. Préserve toutes les modifications utilisateur non liées.

## Mission

Terminer, corriger et valider le travail présent pour livrer uniquement les fondations UX
v5.82 : mode Planifier explicite, navigation, recherche, onboarding, réglages, accessibilité et
textes de confiance. Ne commence aucune fonctionnalité v5.83+.

## État déjà observé

- `npm run check` passe ;
- 128 fichiers et 1 489 tests Vitest passent ;
- le smoke Chromium du 2026-08-08 échoue 6/6 dans `page.goto()` avant les assertions ;
- les docs déclaraient prématurément la version livrée et ont été corrigées en RC ;
- un smoke `planning-beginner.test.ts` existe mais n'a pas encore atteint son flux lors du
  dernier run ;
- Bibliothèque réutilise encore le TrackSheet/historique récent.

## Travail obligatoire

### 1. Diagnostiquer le gate E2E

- Reproduire un test seul puis la suite smoke.
- Capturer stdout/stderr Vite, `pageerror`, console navigateur, requêtes échouées et navigations.
- Déterminer si le blocage vient du serveur, d'un reload, du Service Worker, d'une ressource ou
  de l'initialisation app ; corriger la cause, pas augmenter aveuglément les timeouts.
- Faire passer les six smoke dans la suite et le scénario débutant isolé.
- Ne modifier une assertion métier que si le nouveau contrat v5.82 la rend réellement obsolète.

### 2. Auditer l'implémentation présente

- Vérifier : tap hors Planifier = sélection, tap dans Planifier = waypoint, appui long expert,
  inversion, effacement, Escape et sortie du mode.
- Vérifier les quatre destinations mobile et leurs adaptateurs historiques.
- Bibliothèque doit annoncer honnêtement « traces récentes/importées/enregistrées » ; ne pas
  promettre la sauvegarde durable des routes manuelles avant v5.83.
- Vérifier recherche contextualisée, erreurs, résultats homonymes et localisation inconnue.
- Vérifier les catégories Settings et l'absence des contrôles Google encore non fiables.
- Contrôler éléments sémantiques, focus, Escape, lecteur d'écran, 48 px et reduced motion.

### 3. Revue visuelle

- Mobile 360 et 390 px, tablette 768 px, desktop ≥ 900 et 1280 px.
- États normal, vide, chargement, erreur, offline et texte long allemand/italien.
- Aucun contrôle masqué, chevauchement ou scroll bloqué.
- Le desktop apporte un agencement large mais aucune fonction exclusive.

## Hors périmètre strict

- PreparedRoute, IndexedDB route ou sauvegarde durable ;
- guidance, readiness, corridor, Supabase ou sync ;
- activation Google/OAuth ;
- changement Free/Pro ;
- refonte Three.js, REC, packs ou RevenueCat.

## Gates

Exécuter et rapporter :

```powershell
npm run check
npm test
npm run build
npm run check:bundle
npm run audit:i18n
npm run test:e2e:smoke
```

Puis les tests E2E ciblés et, si templates Capacitor touchés, `npm run cap:sync` et contrôles
Android pertinents. Ne supprime ou n'assouplis aucun test pour obtenir du vert.

## Documentation et release

- Maintenir l'entrée v5.82 sous `Unreleased` pendant le travail.
- Mettre à jour TODO, CLAUDE, GEMINI, architecture/UX/style avec les faits réellement validés.
- Après tous les gates seulement : passer package à 5.82.0, incrémenter Android versionCode de
  896 à 897 et versionName à 5.82.0, dater le changelog selon `docs/RELEASE.md`.
- Ne commit/tag/push/publie rien sans autorisation explicite.

## Bilan final

Donne cause du blocage E2E, corrections réalisées, revue visuelle, tests exacts, fichiers
principaux, compatibilité, dette restante, numéros de version et opérations Git non exécutées.
Si un gate est rouge, conclus « v5.82 non publiable ».
