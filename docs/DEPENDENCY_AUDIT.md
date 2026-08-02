# Audit des dépendances

Audit exécuté le 2026-08-01 avec `npm audit`.

Deux vulnérabilités de sévérité élevée restent sans correctif compatible : elles concernent `sharp` et son consommateur `@capacitor/assets` avant `sharp` 0.35.0. `sharp` est une dépendance de développement utilisée uniquement pendant la génération des assets Android ; il n'est ni chargé par la PWA ni embarqué dans l'application distribuée. La mise à niveau majeure est volontairement hors du périmètre de cette remise à niveau et devra être validée séparément.
