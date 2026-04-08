# Rapport d'Audit & Nettoyage (v5.26.6)

> Date : 8 avril 2026
> Objet : Suppression de la dette technique et réorganisation documentaire "IA-Ready".

---

## 1. Audit de Dette Technique (Chirurgie)

### 🧹 Éléments Supprimés (Obsolètes)
- **Code source** : Suppression de la fonction dépréciée `downloadRecordedGPX()` dans `TrackSheet.ts`. Remplacée par l'appel direct à `saveGPXToFile()`.
- **Scripts Racine** : `analyze_gpx.js` et `analyze_gpx_3d.js` (reliquats pré-migration TS).
- **Données de Test** : `test_track1.gpx` et `test_track2.gpx` (orphelins).
- **Logs** : `session-ses_2971.md`.
- **Fonctions No-op** : Retrait de toute mention de `preloadChOverviewTiles()` (obsolète pour raisons de politique OSM).

### 📂 Réorganisation structurelle
- **Scripts** : `audit_i18n.py` et `update_locales.py` déplacés de la racine vers `/scripts`.
- **Recherche** : `PROMPT_PERSISTENCE_ORIGIN_V2.md` déplacé vers `docs/research/`.

---

## 2. Audit de Documentation (IA-Ready)

### 🔄 Fusions & Unification
- **Monétisation** : Fusion de `docs/MONETIZATION.md` (stratégie) et `docs/AI_MONETIZATION.md` (logique technique) en un document unique et complet : **`docs/MONETIZATION.md`**.
- **Roadmap** : Intégration de la roadmap v6.0 directement dans **`docs/TODO.md`**. Archivage du fichier séparé.

### 📂 Archivage Intelligent (`docs/archives/`)
- Création d'une structure d'archives par type : `reports/`, `plans/`, `protocols/`.
- Déplacement de tous les rapports de performance, d'audit et de tests antérieurs à la v5.26.
- Création de **`docs/archives/COMPLETED_HISTORY.md`** pour centraliser l'historique des tâches accomplies.

### 📝 Mise à jour des Références Techniques
- **CLAUDE.md** : Ajout d'un **Index de Documentation** pour guider les futurs agents IA. Mise à jour des standards de calcul (Haversine, Hystérésis 2m).
- **AI_ARCHITECTURE.md** : Documentation de la nouvelle section "Calculs & Géométrie".
- **AI_PERFORMANCE.md** : Documentation des optimisations batterie (Deep Sleep, 20fps throttle) et de rendu (DPR Cap 2.0).

---

## 3. Validation
- ✅ **Tests unitaires (Vitest)** : 480 tests passés avec succès.
- ✅ **Intégrité structurelle** : Racine désencombrée, documentation centralisée.
