# État de reprise historique — v5.82.0 RC interrompue

> Audit effectué le 2026-08-08. Ce document décrit l'état historique du worktree avant la
> publication de v5.82.0.
>
> **Résolu le 2026-08-08 :** les blocages automatisés ci-dessous ont été corrigés, tous les
> gates demandés passent et le worktree est aligné sur v5.82.0 / Android 897. La validation
> terrain Galaxy S23 a été acceptée le 2026-08-09 sans P0/P1 signalé ; le tag et la release
> GitHub v5.82.0 sont désormais publiés. Voir `CHANGELOG.md` pour l'état courant et
> `V5_82_S23_FIELD_VALIDATION.md` pour la trace terrain.

## Référence au début de la reprise — archivée

- Production/tag : v5.81.4.
- `package.json` : 5.81.4.
- Android : `versionName 5.81.4`, `versionCode 896`.
- `main` pointe après le tag vers un commit de stabilisation E2E ; les changements v5.82
  sont non committés.

## Implémenté dans le worktree

- mode Planifier explicite et tap simple contextuel ;
- appui long expert conservé ;
- inversion/effacement et gestion Escape ;
- navigation Explorer/Préparer/Sortie/Bibliothèque avec adaptateurs historiques ;
- recherche contextualisée et résultats enrichis ;
- onboarding ramené à trois écrans ;
- catégories de réglages et extraction compte/RGPD ;
- corrections sémantiques, focus, cibles tactiles et libellés ;
- traductions FR/EN/DE/IT ;
- tests unitaires et un nouveau smoke de planification.

## Contrôles exécutés pendant l'audit initial — archivés

| Contrôle | Résultat |
|---|---|
| `npm run check` | réussi |
| `npm test` | 128 fichiers, 1 489 tests réussis |
| `npm run build` | réussi ; PWA générée |
| `npm run check:bundle` | réussi ; précache PWA 2,11 Mio |
| `npm run audit:i18n` | réussi ; aucune clé statique manquante dans FR/EN/DE/IT |
| `npm run test:e2e:smoke` | échec : 6/6 expirent dans `page.goto()` |

Le smoke n'a pas atteint les assertions fonctionnelles. Il faut diagnostiquer le serveur
Vite, `domcontentloaded`, une éventuelle navigation/reload et la durée d'initialisation avant
de modifier les tests métier.

## Ancien reste à faire — résolu dans le worktree

1. Ne supprimer, reset ni réimplémenter les changements présents.
2. Reproduire le blocage Playwright avec logs navigateur, `pageerror`, requêtes et stdout Vite.
3. Faire passer les six smoke, puis le nouveau scénario débutant de manière isolée et en suite.
4. Vérifier mobile 360/390 px et desktop ≥ 900 px, clavier et reduced motion.
5. Vérifier que Bibliothèque décrit les traces récentes et n'annonce pas encore une sauvegarde
   durable des itinéraires manuels.
6. Exécuter les contrôles Capacitor/Android pertinents ; build, bundle et i18n sont déjà verts.
7. Corriger toute documentation déclarant la RC « livrée ».
8. Seulement ensuite : version package/Android, changelog daté et procédure de release.

## Hors périmètre de la reprise

- ne pas ajouter `PreparedRoute` ou IndexedDB route ;
- ne pas activer Google OAuth ;
- ne pas commencer le guidage, readiness ou sync ;
- ne pas modifier les gates Free/Pro ;
- ne pas commit/tag/push sans accord explicite.
