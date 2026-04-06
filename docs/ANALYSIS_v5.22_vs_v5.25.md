# Analyse Comparative : Avant (v5.22.x) vs Après (v5.25.0)

## 🎯 Système AVANT commit 78e1036 (v5.22.x)

### Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                      JAVASCRIPT (WebView)                       │
│  Geolocation.watchPosition() ← JS uniquement                    │
│       ↓                                                         │
│  state.recordedPoints[] ← SEULE source de points                │
│       ↓                                                         │
│  Filesystem.writeFile() ← Persistance fallback                  │
│  (tous les 10 points ou 20s)                                    │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                      ANDROID NATIF                              │
│  RecordingService.java                                          │
│  ├── startForeground() / stopForeground() uniquement            │
│  └── Garde le processus en vie (notification)                   │
│  └── NE fait PAS d'enregistrement GPS lui-même                  │
└─────────────────────────────────────────────────────────────────┘
```

### Fonctionnement
1. **Enregistrement** : Uniquement par `Geolocation.watchPosition()` dans `location.ts`
2. **Persistance** : `Filesystem.writeFile()` tous les 10 points ou 20 secondes
3. **Recovery** : Au kill/restart, récupération depuis `Filesystem.readFile()`
4. **Points** : Toujours dans `state.recordedPoints` (JavaScript uniquement)

### Avantages ✅
- **Simple** : Un seul système d'enregistrement (JS)
- **Fonctionnait** : Pas de doublons car un seul source
- **Recovery simple** : Récupération depuis fichier JSON

### Inconvénients ❌
- **Problème du "phone in pocket"** : WebView suspendue = pas d'enregistrement
- **Android tue la WebView** : Pas de points pendant que l'app est en background
- **Fiabilité** : Dépend de la WebView qui peut être tuée par Android

---

## 🎯 Système APRÈS commit 78e1036 → v5.25.0 (Room/Single Source of Truth)

### Architecture actuelle
```
┌─────────────────────────────────────────────────────────────────┐
│                      ANDROID NATIF                              │
│  FusedLocationProviderClient → RecordingService.java            │
│  ├── Filtre GPS (9 étapes, 3m min)                              │
│  ├── Room SQLite ← SEULE source de vérité                       │
│  └── Émission événements → JS                                   │
└─────────────────────────┬───────────────────────────────────────┘
                          │ onNewPoints / onLocationUpdate
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│                      JAVASCRIPT                                 │
│  nativeGPSService.ts                                            │
│  ├── Écoute les événements natifs                               │
│  ├── Récupère points depuis SQLite (getPoints)                  │
│  └── Met à jour state.recordedPoints (lecture seule)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Comparaison détaillée

| Aspect | AVANT (v5.22.x) | APRÈS (v5.25.0) | Statut |
|--------|-----------------|-----------------|--------|
| **Source d'enregistrement** | JS uniquement (`watchPosition`) | Natif uniquement (`FusedLocationProvider`) | ✅ Amélioration |
| **Fiabilité background** | ❌ WebView suspendue = pas de points | ✅ Service natif indépendant | ✅ Amélioration |
| **Persistance** | JSON fichier (tous les 10pts/20s) | SQLite Room (immédiat) | ✅ Amélioration |
| **Recovery** | Récupère depuis JSON | Récupère depuis SQLite | ✅ Théoriquement mieux |
| **Filtrage GPS** | Aucun (tous les points JS) | 9 filtres (3m min) | ✅ Amélioration |
| **Timestamps** | `Date.now()` (système) | `loc.getTime()` (GPS) | ✅ Plus précis |
| **Complexité** | Simple, 1 système | Complexe, bridge natif/JS | ❌ Régression |
| **Recovery après kill** | ⚠️ Fonctionnait (JSON) | ❌ Bugué (courseId perdu) | 🐛 Bug introduit |
| **Points doublons** | ✅ Jamais (1 source) | 🐛 Risque (merge natif/JS) | 🐛 Bug potentiel |
| **Densité points** | ~1 point/2s (sans filtre) | ~1 point/3s (avec filtre 3m) | ✅ Réduction jitter |
| **Altitude** | Brute GPS (ellipsoïdale) | Corrigée (orthométrique) | ✅ Plus précis |
| **Performance UI** | ✅ Recréation mesh à chaque point | ✅ Debounce (1s) | ✅ Amélioration |

---

## 🐛 Bugs introduits par v5.25.0

### 1. **Recovery après kill** (CRITIQUE)
- **Symptôme** : Quand on kill l'app et qu'on la rouvre, tout est vide
- **Cause** : `courseId` stocké en mémoire du plugin, pas persisté
- **Fix appliqué** : Sauvegarder `courseId` dans SharedPreferences

### 2. **Communication événements** (CRITIQUE)
- **Symptôme** : Points non affichés en temps réel
- **Cause** : Mismatch entre ce que le natif envoie (`courseId+count`) et ce que JS attend (`points[]`)
- **Fix appliqué** : Méthode `getPoints(courseId, since)` + fetch incrémental

### 3. **Trop de points (2911 pour 5min)** (MAJEUR)
- **Symptôme** : Jitter GPS crée des micro-déplacements
- **Cause** : Filtre `MIN_DISTANCE_M = 1m` trop petit
- **Fix appliqué** : `MIN_DISTANCE_M = 3m` + déduplication timestamp

### 4. **Altitude incorrecte** (MOYEN)
- **Symptôme** : 490m au lieu de 430m
- **Cause** : GPS retourne altitude ellipsoïdale
- **Fix appliqué** : Correction géoïde + MSL sur Android 12+

---

## ⚖️ Bilan : Qu'est-ce qui est mieux/pire ?

### ✅ Ce qui est MIEUX maintenant
1. **Background reliability** : Le natif continue même si WebView tuée
2. **Persistance** : SQLite plus fiable que JSON
3. **Filtrage** : Moins de points parasites (jitter)
4. **Timestamps** : GPS atomique plus précis
5. **Altitude** : Correction géoïde pour MSL

### ❌ Ce qui est PIRE / Plus complexe
1. **Complexité architecture** : Bridge natif/JS avec events
2. **Recovery** : Bug introduit (courseId non persisté initialement)
3. **Debug** : Plus difficile (2 systèmes vs 1)
4. **Latence** : Fetch SQLite + conversion vs accès direct

### ⚠️ Ce qui était mieux AVANT
1. **Simplicité** : Un seul système JS, pas de bridge complexe
2. **Recovery** : Fonctionnait immédiatement (JSON simple)
3. **Temps réel** : Points disponibles instantanément (pas de fetch)

---

## 🎯 Recommandation

Le système v5.25.0 est **techniquement supérieur** pour :
- Longues randos (background reliable)
- Précision (filtres, timestamps GPS, altitude)
- Persistance (SQLite > JSON)

Mais il est **plus complexe** et a introduit des bugs de recovery qu'il a fallu corriger.

**Si v5.22.x fonctionnait parfaitement pour ton usage**, les bénéfices de v5.25.0 sont :
- ✅ Plus fiable en background (crucial pour randos > 1h)
- ✅ Moins de points parasites quand immobile
- ✅ Altitude correcte

**Les coûts** :
- ⚠️ Architecture plus complexe (maintenance)
- ⚠️ Bugs de recovery (maintenant corrigés)
- ⚠️ Latence légère (fetch SQLite)

---

## 🔧 Suggestions d'amélioration

1. **Simplifier le recovery** : Le rendre aussi simple qu'avant (1 seule source)
2. **Nettoyage SQLite auto** : Supprimer vieilles courses (>7 jours)
3. **Export GPX dédupliqué** : Sécurité contre bugs éventuels
4. **Métriques debug** : Nombre de points rejetés dans notification

**Conclusion** : Le nouveau système est meilleur pour la fiabilité, mais il a fallu corriger des bugs introduits par la complexité supplémentaire.
