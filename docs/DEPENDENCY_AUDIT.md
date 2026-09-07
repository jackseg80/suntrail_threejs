# Audit des dépendances

> Instantané historique, pas preuve actuelle. Relancer l'audit réseau avant toute décision de mise
> à jour et consigner la date, le lockfile et les résultats exacts.

Audit exécuté le 2026-08-03 avec `npm audit --audit-level=high` : aucune vulnérabilité signalée à
cette date.

`sharp` est maintenu en `^0.35.3`. L'override npm `"sharp": "$sharp"` applique aussi cette version corrigée à `@capacitor/assets@3.0.5`, qui déclare encore `sharp@0.32.6`. Ce paquet est un outil de développement dédié à la génération des assets Android ; il n'est ni chargé par la PWA ni embarqué dans l'application distribuée.
