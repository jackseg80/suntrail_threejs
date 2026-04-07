# Audit Dette Technique - SunTrail 3D (v5.25.2)

**Date :** 7 avril 2026  
**Version logicielle :** v5.25.2  
**Statut global :** 🟢 SAIN  

---

## 🔍 1. Synthèse de l'état actuel

L'application est techniquement très saine. La suite de tests (448 tests unitaires) est entièrement verte et le build production est optimisé (~950 kB JS total). Le passage à Vite v8 via l'audit de sécurité s'est fait sans régression fonctionnelle notable.

| Catégorie | Statut | Commentaire |
| :--- | :--- | :--- |
| **Tests Unitaires** | 🟢 100% | 448 tests au vert (Vitest). |
| **Couverture Code** | 🟡 53% | Risque sur les services natifs & bâtiments. |
| **TypeScript (TSC)** | 🟢 0 erreur | Intégrité du typage vérifiée (`tsc --noEmit`). |
| **Build Prod** | 🟢 Succès | Vite v8.0.6, PWA active, zero warning. |
| **Sécurité (npm)** | 🟡 11 High | Réduit de 14 à 11 (Bloquants : Capacitor tools). |
| **Dette TODO/FIXME** | 🟢 Faible | 1 TODO orphelin majeur (peaks) résolu. |

---

## 🏔️ 2. Améliorations majeures apportées (v5.25.2)

### 2.1 Intégration des Sommets Locaux
L'une des dettes les plus anciennes (v5.16.7) a été résolue. La fonction `fetchLocalPeaks()` est maintenant déclenchée au démarrage de l'app.
*   **Impact :** Expérience de recherche enrichie immédiatement dès l'ouverture du `SearchSheet`.
*   **Fichiers :** `src/modules/ui.ts` (startApp), `src/modules/peaks.ts`.

### 2.2 Sécurité & Infrastructure
Mise à jour majeure du tooling de build via `npm audit fix --force`.
*   **Vite 5.x → 8.x** : Gain de performance et correction de failles esbuild.
*   **vite-plugin-pwa 0.12.x → 0.19.8** : Correction de vulnérabilités critiques de sérialisation.

---

## 🛠️ 3. Dette Résiduelle & Recommandations

### 3.1 Sécurité (11 vulnérabilités High)
Bien que le nombre ait été réduit, 11 vulnérabilités de sévérité haute persistent dans les outils de build de Capacitor (`@xmldom`, `tar`, `minimatch`).
*   **Statut :** Non-critique pour le runtime (concerne les outils de dev/CI).
*   **Action :** Surveiller les mises à jour de `@capacitor/cli` et `@capacitor/assets`.

### 3.2 Tests des Presets Performance
Une divergence a été détectée et corrigée dans `src/modules/state.test.ts` sur le preset `eco`. Il faudra veiller à ce que les presets définis dans `state.ts` restent toujours synchronisés avec les attentes des tests lors des futures optimisations mobiles.

---

## 📊 4. Métriques de Qualité

*   **Taille Bundle JS (Gzip) :** ~230 kB (Index + Three.js).
*   **Tests Vitest :** 39 fichiers, 448 tests.
*   **Dépendances Dépréciées :** `preloadChOverviewTiles()` (conservée en no-op pour conformité OSM).

---
*Fin de l'audit v5.25.2*
