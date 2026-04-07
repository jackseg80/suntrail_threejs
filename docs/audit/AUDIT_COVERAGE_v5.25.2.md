# Rapport d'Audit de Couverture de Code - SunTrail 3D (v5.25.2)

**Date :** 7 avril 2026  
**Outil :** Vitest + C8 (v8 provider)  
**Score Global :** **52.85% (Lignes)** / 38.17% (Branches)

---

## 🟢 1. Zones de Haute Confiance (Couverture > 80%)

Ces modules sont solidement testés et présentent un risque de régression faible.

| Module | Lignes | Branches | Commentaire |
| :--- | :--- | :--- | :--- |
| **Logic/State** | 98% | 91% | `ReactiveState.ts` est quasiment parfait. |
| **Caches** | 100% | 85-100% | Tous les caches (Geometry, Tile, SpatialIndex) sont couverts à 100%. |
| **I18n** | 84% | 65% | `I18nService.ts` est bien protégé. |
| **Peaks** | 96% | 72% | `peaks.ts` (récemment intégré) est très bien couvert. |
| **Vegetation** | 92% | 63% | Le moteur de placement de la végétation est sain. |

---

## 🟡 2. Zones de Vigilance (Couverture 40% - 80%)

Modules critiques avec une couverture partielle, souvent due à la complexité des interactions asynchrones ou géométriques.

*   **`terrain.ts` (51%) :** Le coeur du moteur 3D. La logique de gestion des tuiles est testée, mais pas le rendu WebGL.
*   **`location.ts` (81% lines / 53% branches) :** La logique de calcul de position est couverte, mais pas les cas limites de perte de signal GPS.
*   **`weather.ts` (57%) :** La gestion des erreurs API (récemment ajoutée) manque encore de tests de bord (edge cases).
*   **`performance.ts` (72%) :** Les presets sont testés, mais pas la détection automatique du matériel (GPU/CPU).

---

## 🔴 3. Zones à Risque (Couverture < 20%)

Ces zones sont les "angles morts" de l'application, principalement car elles dépendent de matériel natif ou de données externes massives.

### 3.1 Services Natifs (Capacitor)
*   **`iapService.ts` (4%) & `iap.ts` (8%) :** Les achats In-App ne sont pas testés en unitaire (dépendance RevenueCat).
*   **`nativeGPSService.ts` (7%) :** L'enregistrement GPS natif (Android) est testé uniquement par intégration manuelle.
*   **`workerManager.ts` (15%) :** La gestion des threads de fond manque de tests de stress.

### 3.2 Modules de Données (Overpass/Parsing)
*   **`buildings.ts` (5%) & `hydrology.ts` (6%) :** Le parsing des bâtiments et des rivières est complexe et manque de tests unitaires sur les données brutes.
*   **`poi.ts` (13%) :** Les points d'intérêt manquent de validation sur les tags OSM.

---

## 🚀 4. Recommandations de Maintenance

1.  **Mocker Capacitor :** Créer un package de mocks pour `@capacitor/geolocation` et `RevenueCat` pour monter la couverture des services natifs à >50%.
2.  **Tests de Parsing :** Ajouter des fichiers JSON de fixtures pour `buildings.ts` afin de tester le générateur de mesh sans API réelle.
3.  **Stress-test Workers :** Augmenter la couverture de `workerManager.ts` pour prévenir les fuites de mémoire dans le pipeline de chargement des tuiles.

---
*Fin du rapport de couverture v5.25.2*
