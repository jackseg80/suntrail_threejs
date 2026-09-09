# Prompts d'implémentation révisés

> Révision du 2026-09-09. Utiliser le même worktree et respecter l'ordre.

| Ordre | Version | Prompt | Valeur livrée |
|---|---|---|---|
| 1 | v5.82.0 | [Clôturer le terrain et préparer la publication](V5_82_FIELD_RELEASE.md) | Décider, corriger si nécessaire, puis publier |
| 2 | v5.83.0 | [Planifier et sauvegarder](V5_83_PREPARED_ROUTES.md) | Route locale durable et adéquation |
| 3 | v5.84.0 interne | [Moteur de suivi](V5_84_GUIDANCE_MVP.md) | Fixtures et foreground, sans publication publique |
| 4 | v5.85.0 | [Guidage natif robuste](V5_85_ANDROID_GUIDANCE.md) | Écran éteint, notification, récupération |
| 5 | v5.86.0 | [Prêt à partir et corridor](V5_86_READINESS_OFFLINE.md) | Readiness et données terrain |
| 6 | v5.87.0 | [Dépôt de traces pleine fidélité](V5_87_TRACK_REPOSITORY.md) | Persistance fiable sans verrou local Free |
| 7 | v5.88.0 | [Audit complet et stabilisation performance](V5_88_PERFORMANCE_STABILIZATION.md) | Base, dépendances, 3D et mode combiné A53 optimisés sur preuve mesurée |
| 8 | v5.89.0 | [Évaluation de l'architecture cartographique](../V5_89_MAP_ARCHITECTURE_EVALUATION.md) | Pipeline couleur d'abord, caches bornés et maintien de Three.js/WebGL validés |
| 9 | 5.90+, ex-v6.0 | [Power user local](V6_0_POWER_USER.md) | Périmètre conservé, numéro à redistribuer après bilan v5.89 |
| 10 | 5.90+, ex-v6.1 | [Lumière utile](V6_1_LIGHT_PLANNING.md) | Périmètre conservé, numéro à redistribuer après bilan v5.89 |
| 11 | Différé, ex-v6.2 | [Compte et synchronisation](V6_2_ACCOUNT_SYNC.md) | Continuité PC–Android seulement après décision active |

## Règles

1. Coller le fichier complet dans une nouvelle discussion.
2. Ne jamais lancer deux versions en parallèle.
3. v5.82 à v5.89 appartiennent à la baseline livrée. v5.88 puis v5.89 stabilisent cette baseline
   sur A53/S23 et clôturent l'évaluation de l'architecture cartographique sans rouvrir les contrats
   locaux de traces, routes, REC, Guidance ou Free/Pro. Le prochain jalon est le lot expert 5.90+.
   L'audit R8 complémentaire reste une maintenance non urgente de ce cycle et ne justifie pas seul
   une 5.89.1. Les noms de fichiers V6 sont conservés
   comme références de périmètre, pas comme numéros de livraison engagés. Le compte et la
   synchronisation restent reportés après les lots experts et lumière.
4. Un gate rouge interdit de déclarer la version terminée et de commencer la suivante.
5. Commit, tag, push et déploiement nécessitent un accord explicite dans la discussion active.

Références : [plan transversal](../PRODUCT_EVOLUTION_2026.md),
[audit et décisions](../ROADMAP_AUDIT_DECISIONS_2026-08-08.md).
