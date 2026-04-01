# 🔍 RAPPORT D'AUDIT DE DETTE TECHNIQUE
## SunTrail 3D — Version 5.16.7

**Date de l'audit** : 31 mars 2026  
**Fichiers analysés** : 92 fichiers TypeScript dans `src/`  
**Tests analysés** : 13+ fichiers de test  
**Documentation consultée** : CHANGELOG.md, TODO.md, AGENTS.md, commits récents  
**Méthode** : Analyse multi-agents parallèles (4 agents) + analyse manuelle

---

## 📊 RÉSUMÉ EXÉCUTIF

| Catégorie | Sévérité | Éléments identifiés | Action recommandée |
|-----------|----------|---------------------|-------------------|
| **i18n incomplète** | 🔴 Haute | ~20+ chaînes en dur | Internationaliser avant production multi-marchés |
| **Dépendances** | 🟡 Moyenne | 1 inutilisée, 2 redondantes, 1 mauvaise catégorie | Nettoyage package.json |
| **Tests dupliqués** | 🟡 Moyenne | 1 suite GPX dupliquée (~50 lignes) | Supprimer terrain.test.ts GPX block |
| **Mocks** | 🟡 Moyenne | 2 mocks inutiles, patterns répétitifs | Simplifier/consolider |
| **Code mort** | 🟡 Moyenne | 1 fichier orphelin, 2-3 fonctions non utilisées | Supprimer après confirmation |
| **Fonctions dépréciées** | 🟢 Faible | 2 fonctions marquées @deprecated | Documentation OK |

**Verdict global** : La codebase est bien maintenue avec une dette technique modérée. La priorité absolue est l'internationalisation (i18n) qui bloque le déploiement multi-marchés.

---

## 1. 🔴 DETTE CRITIQUE — Internationalisation (i18n)

### Problème
Le codebase contient **~20+ chaînes de texte en français dur** qui ne seront pas traduites lors d'un changement de langue.

### Localisations identifiées

#### `src/modules/ui/components/UpgradeSheet.ts`
| Ligne | Code | Texte en dur |
|-------|------|--------------|
| 44 | `showToast()` | "Achat impossible — vérifiez votre connexion ou réessayez." // TODO i18n |
| 63 | `showToast()` | "Restauration en cours…" // TODO i18n |
| 67 | `showToast()` | "✅ Achats restaurés !" // TODO i18n |
| 70 | `showToast()` | "Aucun achat à restaurer." // TODO i18n |

#### `index.html` — Template UpgradeSheet
Plusieurs `<!-- TODO i18n -->` dans les labels marketing (~15 occurrences) :
- "Passer à Pro ✨"
- "Carte détail maximum (zoom LOD 18)"
- "Vue Satellite"
- "Bâtiments 3D — architecture réaliste sur le terrain"
- "Calendrier solaire — simulez les ombres..."
- "Analyse solaire complète — azimut, élévation..."
- "Station météo avancée — graphique 24h..."
- "Inclinomètre numérique — pente du terrain..."
- "Multi-tracés GPX — importez autant de randonnées..."
- "Export GPX + statistiques avancées..."
- "Zones offline illimitées — téléchargez autant de régions..."

### Impact utilisateur
- **Marchés non-francophones** (DE, IT, EN) voient du texte français dans le flux d'achat Pro
- **Incohérence UX** : l'app est traduite mais le paywall ne l'est pas complètement
- **Blocage production** : Ces chaînes doivent être internationalisées avant déploiement en Allemagne, Italie, etc.

### Recommandation
**Priorité : HAUTE** — Ajouter les clés dans `i18n/locales/{fr,en,de,it}.json` et utiliser `i18n.t()` dans le code.

---

## 2. 📦 AUDIT DES DÉPENDANCES (Agent analysis)

### 2.1 Dépendances analysées (package.json)

#### dependencies (15 packages)
| Package | Utilisé ? | Fichiers | Action |
|---------|-----------|----------|--------|
| `three` | ✅ Oui | Partout | Conserver |
| `three-stdlib` | ❌ **Non** | **Aucun import trouvé** | **⚠️ Supprimer** — Three.js r160 inclut déjà les helpers |
| `@capacitor/core` | ✅ Oui | iapService, foregroundService, etc. | Conserver |
| `@capacitor/geolocation` | ✅ Oui | location.ts, ui.ts | Conserver |
| `@capacitor/filesystem` | ✅ Oui | TrackSheet.ts, foregroundService.ts | Conserver |
| `@capacitor/haptics` | ✅ Oui | haptics.ts | Conserver |
| `@capacitor/app` | ✅ Oui | mobile.ts (back button) | Conserver |
| `@revenuecat/purchases-capacitor` | ✅ Oui | iapService.ts | Conserver |
| `suncalc` | ✅ Oui | analysis.ts, sun.ts, ExpertSheets.ts | Conserver |
| `pmtiles` | ✅ Oui | tileLoader.ts | Conserver |
| `gpxparser` | ✅ Oui | TrackSheet.ts | Conserver |
| `@mapbox/vector-tile` | ✅ Oui | buildings.ts | Conserver |
| `pbf` | ✅ Oui | buildings.ts | Conserver |
| `@capacitor/android` | ✅ Oui (build) | Sync Android | Conserver |
| `@capacitor/cli` | ⚠️ **Build tool** | `npx cap sync` | **🔄 Déplacer en devDependencies** |

#### devDependencies (13 packages)
| Package | Utilisé ? | Action |
|---------|-----------|--------|
| `typescript`, `vite`, `vitest` | ✅ Oui | Conserver |
| `vite-plugin-pwa` | ✅ Oui | Conserver |
| `@types/three`, `@types/suncalc`, `@types/node` | ✅ Oui | Conserver |
| `@types/mapbox__vector-tile` | ❌ **Redondant** | **⚠️ Supprimer** — @mapbox/vector-tile inclut ses propres types |
| `@types/pbf` | ❌ **Redondant** | **⚠️ Supprimer** — pbf inclut ses propres types |
| `@testing-library/dom`, `axe-core`, `happy-dom` | ✅ Oui | Conserver |
| `@capacitor/assets` | ✅ Oui | Conserver |

### 2.2 Problèmes identifiés

| # | Problème | Package | Impact |
|---|----------|---------|--------|
| 1 | **Jamais importé** | `three-stdlib` | Encombrement inutile (+~500ko potentiel) |
| 2 | **Mauvaise catégorie** | `@capacitor/cli` | Devrait être devDependency |
| 3 | **Types redondants** | `@types/mapbox__vector-tile` | @mapbox/vector-tile v2.0.4 a `"types": "index.d.ts"` |
| 4 | **Types redondants** | `@types/pbf` | pbf v4.0.1 a `"types": "index.d.ts"` |

### 2.3 Recommandations package.json

```bash
# 1. Supprimer three-stdlib (jamais utilisé)
npm uninstall three-stdlib

# 2. Déplacer @capacitor/cli en devDependencies
npm uninstall @capacitor/cli && npm install -D @capacitor/cli

# 3. Supprimer types redondants
npm uninstall @types/mapbox__vector-tile @types/pbf
```

---

## 3. 🧪 AUDIT DES TESTS (Agent analysis)

### 3.1 Tests Skipped (.skip, xit, xdescribe)
**✅ Aucun trouvé** — La suite ne contient pas de tests désactivés.

### 3.2 Tests Sans Assertions
**✅ Aucun trouvé** — Tous les tests ont des assertions `expect()` valides.

### 3.3 Suites de Tests Dupliquées

**🔴 Problème identifié : GPX Layer**

| Fichier | Suite | Fonctions testées | Lignes |
|---------|-------|-------------------|--------|
| `terrain.test.ts` | `describe('GPX Layer (Multi-GPX v5.10)')` | `addGPXLayer`, `removeGPXLayer` | 18-66 (~50 lignes) |
| `gpxLayers.test.ts` | `describe('Multi-GPX Layers (v5.10)')` | `addGPXLayer`, `removeGPXLayer`, `toggleGPXLayer`, etc. | 10-135 (~125 lignes) |

**Analyse** : Le bloc `GPX Layer` dans `terrain.test.ts` teste les mêmes fonctions que `gpxLayers.test.ts` mais avec une couverture moins complète. C'est une duplication claire.

**Recommandation** : Supprimer le bloc `describe('GPX Layer (Multi-GPX v5.10)')` de `terrain.test.ts` (lignes 18-66).

### 3.4 Mocks Simplifiables ou Problématiques

#### A. `weatherPro.test.ts` — Mock qui réimplémente (lignes 13-26)
```typescript
vi.mock('../modules/weather', async () => {
    function getWeatherIcon(code: number): string {  // ← RÉIMPLÉMENTATION !
        if (code === 0) return '☀️';
        if (code <= 3) return '🌤️';
        // ... etc
    }
    return { getWeatherIcon };
});
```

**Problème** : Le mock réimplémente la logique de `getWeatherIcon` au lieu de tester la vraie fonction.

**Recommandation** : Tester la vraie implémentation ou utiliser `vi.fn()` avec valeurs fixes.

#### B. `solarAnalysis.test.ts` — Mock inutile (lignes 13-16)
```typescript
vi.mock('three', async () => {
    const actual = await vi.importActual<typeof import('three')>('three');
    return actual;  // ← Retourne le module réel, mock inutile
});
```

**Problème** : Ce mock ne fait que réexporter `three` — il n'apporte rien.

**Recommandation** : Supprimer ce mock, Vitest importera automatiquement le vrai module.

#### C. Mocks répétitifs
Plusieurs fichiers mockent les mêmes dépendances (`./utils`, `./terrain`, `state`) de manière indépendante.

**Recommandation** : Centraliser les mocks communs dans `src/test/setup.ts`.

### 3.5 Récapitulatif Tests

| Métrique | Valeur |
|----------|--------|
| Tests skipés | ✅ 0 |
| Tests vides | ✅ 0 |
| Duplications | 🔴 1 suite GPX |
| Mocks problématiques | 🟡 2 |
| Mocks simplifiables | 🟡 Potentiel de consolidation |

---

## 4. 🗑️ CODE MORT & DÉPRÉCIATIONS

### 4.1 Fonctions @deprecated

#### A. `downloadOfflineZone()` — tileLoader.ts:319
```typescript
/**
 * @deprecated Utiliser downloadVisibleZone() à la place — ce que tu vois = ce que tu télécharges.
 */
```

**Statut** : Fonction présente mais marquée `@deprecated`  
**Remplacement** : `downloadVisibleZone()`  
**Action** : Vérifier qu'elle n'est plus appelée, puis supprimer.

#### B. `preloadChOverviewTiles()` — tileLoader.ts:372
```typescript
/**
 * @deprecated Ne pas réactiver sans un accord explicite du fournisseur de tuiles
 * ou l'utilisation d'un serveur de tuiles auto-hébergé (PMTiles).
 */
```

**Statut** : Désactivée (no-op avec `console.log`)  
**Contexte** : Violation des politiques OSM/OpenTopoMap  
**Action** : Laisser en no-op — documentation déjà claire dans AGENTS.md

### 4.2 Fichiers Orphelins & Code Mort Détecté (Agent analysis)

#### A. Fichier ORPHELIN — `src/modules/peaks.ts`

**Statut** : 🔴 **Jamais importé en production**

| Détail | Valeur |
|--------|--------|
| Export principal | `fetchLocalPeaks()` |
| Importé par | Uniquement `peaks.test.ts` (fichier de test) |
| Utilisé dans la codebase | ❌ **NON** — La fonction n'est jamais appelée |

**Contexte** : 
- Le fichier implémente la récupération des sommets via Overpass API
- Le résultat alimenterait `state.localPeaks` pour la recherche
- **Mais** la fonctionnalité n'a jamais été intégrée ou a été désactivée
- La recherche dans l'app utilise `state.localPeaks` mais ceux-ci ne sont jamais peuplés

**Recommandation** : 
- Soit **supprimer** le fichier + son test si non prévu
- Soit **intégrer** l'appel à `fetchLocalPeaks()` dans `SearchSheet.ts` ou `ui.ts`

#### B. Fonctions exportées JAMAIS IMPORTÉES

| Fichier | Fonction | Ligne | Statut |
|---------|----------|-------|--------|
| `weatherUtils.ts` | `getUVColor()` | 16 | 🔴 **Jamais importée** — 0 références externes |
| `weatherUtils.ts` | `getComfortLabel()` | 39 | 🔴 **Jamais importée** — 0 références externes |
| `weatherUtils.ts` | `getUVCategory()` | 7 | 🟡 **Orpheline** — Utilisée uniquement par `getUVColor()` (elle-même morte) |

**Impact** : Ces fonctions météo (UV et confort thermique) étaient peut-être prévues pour l'affichage dans `ExpertSheets.ts` mais n'ont jamais été intégrées.

**Recommandation** : Supprimer ces 3 fonctions si non prévues pour une feature future.

#### C. Fonctions @deprecated encore présentes

| Fichier | Fonction | Ligne | Statut |
|---------|----------|-------|--------|
| `tileLoader.ts` | `preloadChOverviewTiles()` | 375 | 🟡 **No-op** — Retourne immédiatement avec console.log |
| `tileLoader.ts` | `downloadOfflineZone()` | 321 | 🟡 **Fonctionnelle mais deprecated** — Remplacée par `downloadVisibleZone()` |

**Note** : `preloadChOverviewTiles()` est encore importée dans `main.ts` mais ne fait rien.

### 4.3 Commandes pour détecter le code mort

```bash
# Analyse complète avec knip
npx knip --production

# Alternative avec ts-prune  
npx ts-prune

# Recherche d'exports non utilisés (vite)
npm run build 2>&1 | grep "unused"
```

---

## 5. 🎯 PLAN D'ACTION PAR PRIORITÉ

### 🔴 HAUTE PRIORITÉ (Blocage production)

1. **Internationaliser UpgradeSheet.ts**
   - 4 toasts lignes 44, 63, 67, 70
   - Ajouter clés dans `i18n/locales/*.json`
   - Utiliser `i18n.t('upgrade.toast.error')`, etc.

2. **Internationaliser index.html UpgradeSheet**
   - ~15 labels avec `<!-- TODO i18n -->`
   - Remplacer par `data-i18n` attributes

### 🟡 MOYENNE PRIORITÉ (Qualité)

3. **Nettoyer package.json**
   ```bash
   npm uninstall three-stdlib @types/mapbox__vector-tile @types/pbf
   npm uninstall @capacitor/cli && npm install -D @capacitor/cli
   ```

4. **Nettoyer tests dupliqués**
   - Supprimer bloc `GPX Layer` de `terrain.test.ts` (lignes 18-66)

5. **Simplifier mocks**
   - Corriger `weatherPro.test.ts` (lignes 13-26)
   - Supprimer mock inutile `solarAnalysis.test.ts` (lignes 13-16)

6. **Analyser code mort**
   ```bash
   npx knip --production
   ```

### 🟢 BASSE PRIORITÉ (Maintenance)

7. **Consolider mocks dans setup.ts**

8. **Supprimer code mort détecté**
   - `src/modules/peaks.ts` (si feature non prévue)
   - `src/modules/weatherUtils.ts` : `getUVColor()`, `getComfortLabel()`, `getUVCategory()`
   - `src/modules/tileLoader.ts` : `downloadOfflineZone()` (si confirmé inutilisée)

---

## 6. 📈 MÉTRIQUES DE DETTE

| Métrique | Valeur | Tendance |
|----------|--------|----------|
| TODO/FIXME | ~20+ i18n | 🔴 À traiter |
| @deprecated | 2 fonctions | 🟢 Documenté |
| Imports inutilisés | 1 fichier, 2-3 fonctions | 🟡 Supprimer après confirmation |
| Tests échoués | 1/1 corrigé | ✅ Corrigé (coordonnées) |
| Dépendances inutilisées | 1 | 🟡 À nettoyer |
| Types redondants | 2 | 🟡 À nettoyer |
| Tests dupliqués | 1 suite (~50 lignes) | 🟡 À nettoyer |

---

## 7. ✅ CONCLUSION

### Points forts
- ✅ **Architecture stable** : State réactif, EventBus, Composants bien structurés
- ✅ **Documentation à jour** : CHANGELOG, AGENTS.md maintenus
- ✅ **Tests complets** : 13+ fichiers de test, bonne couverture
- ✅ **Nettoyages réguliers** : Expert Panel supprimé, doublons UI éliminés

### Points de vigilance
- 🔴 **i18n incomplète** dans le flux d'achat Pro (bloquant multi-marchés)
- 🟡 **Package.json** : 4 problèmes identifiés (1 inutilisé, 2 redondants, 1 mauvaise catégorie)
- 🟡 **Tests** : 1 suite dupliquée, 2 mocks problématiques
- 🟡 **Code mort** : 1 fichier orphelin (`peaks.ts`), 2-3 fonctions non utilisées (`weatherUtils.ts`)

### Verdict
La dette technique est **modérée et gérable**. L'**internationalisation** est le seul point bloquant pour un déploiement production multi-marchés. Le reste est du nettoyage de qualité qui peut être fait progressivement.

**Charge estimée** : ~2-3 heures pour traiter les points haute priorité (i18n + package.json).

---

## 8. 🔧 COMMANDES UTILES

```bash
# Vérifier les dépendances inutilisées
npx knip --production

# Trouver le code mort TypeScript
npx ts-prune

# Lancer tous les tests
npm test

# Vérifier les types TypeScript
npm run check
```

---

*Rapport généré par audit multi-agents (4 agents parallèles) + analyse manuelle*  
*Date : 31 mars 2026*  
*Version analysée : SunTrail 3D v5.16.7*