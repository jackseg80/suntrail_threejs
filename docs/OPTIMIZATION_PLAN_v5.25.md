# Plan d'Optimisation v5.25.0 - Objectif : Mieux que v5.22.x

## 🎯 Objectifs

1. **Fiabilité** ≥ Ancien (recovery 100% fiable)
2. **Précision** ≥ Ancien (tracé propre, pas de doublons)
3. **Batterie** < Ancien (optimisé pour randos 8h+)
4. **Performance** UI fluide même après 6h d'enregistrement
5. **Simplicité** Réduire la complexité du bridge natif/JS

---

## 🔋 Optimisations Batterie (Critique)

### 1. **Intervalle GPS adaptatif** (HIGH PRIORITY)
**Problème** : Actuellement 1 point/seconde (interval: 3000ms, mais fastest: 1000ms)
**Solution** : Mode économie d'énergie progressif (sans sacrifier la précision)

```java
// RecordingService.java
// Mode dynamique selon la durée
// IMPORTANT: On ne dépasse jamais 10s pour garder une trace utilisable
private void adjustGpsInterval(long elapsedMinutes) {
    long interval;
    if (elapsedMinutes < 10) {
        interval = 3000;  // 3s (début précis pour calibrage)
    } else if (elapsedMinutes < 60) {
        interval = 5000;  // 5s (standard, bon compromis)
    } else if (elapsedMinutes < 180) {
        interval = 5000;  // 5s (1-3h, maintien qualité)
    } else {
        interval = 7000;  // 7s (3h+, économie modérée)
        // Note: 10s MAXIMUM pour garder précision dans virages
        // 15s créerait une trace trop approximative
    }
    // Mettre à jour LocationRequest sans redémarrer le service
}
```

**Pourquoi pas plus de 7-10s ?**
- À 4km/h (vitesse marche), en 7s on parcourt ~8m
- Dans un virage serré, 10s peuvent manquer le point de changement de direction
- 7s = bon compromis entre économie (~25%) et précision

**Impact** : ~20-25% d'économie de batterie (sans perte de qualité)

### 1b. **Précision GPS adaptative selon vitesse** (HIGH PRIORITY)
**Meilleure optimisation** : Adapter la précision GPS à la vitesse de déplacement

```java
// Si on marche lentement (< 3km/h) = pas besoin de haute précision
// Si on arrête de bouger > 30s = mode économie extrême

private void adjustGpsAccuracy(float speedMps) {
    if (speedMps < 0.5f) {
        // Presque à l'arrêt - mode économie
        locationRequest.setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY);
        locationRequest.setInterval(10000); // 10s quand immobile
    } else if (speedMps < 1.5f) {
        // Marche lente (3-5km/h)
        locationRequest.setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY);
        locationRequest.setInterval(5000); // 5s
    } else {
        // Marche rapide ou course
        locationRequest.setPriority(Priority.PRIORITY_HIGH_ACCURACY);
        locationRequest.setInterval(3000); // 3s
    }
}
```

**Impact** : ~35-40% d'économie (meilleur que juste l'intervalle fixe)

### 3. **Batch inserts SQLite** (HIGH PRIORITY)
**Problème** : 1 insert par point ( Room interdit MainThread mais exécuteur créé à chaque fois)
**Solution** : Buffer et insert par batch

```java
private List<GPSPoint> pointBuffer = new ArrayList<>();
private static final int BATCH_SIZE = 10;

// Dans onLocationResult
pointBuffer.add(point);
if (pointBuffer.size() >= BATCH_SIZE) {
    mDbExecutor.execute(() -> {
        mDao.insertAll(pointBuffer); // @Insert void insertAll(List<GPSPoint> points)
        pointBuffer.clear();
    });
}
```

**Impact** : Réduction I/O disque = moins de consommation

---

## 🚀 Optimisations Performance (Critique)

### 4. **Mesh 3D incrémental** (HIGH PRIORITY)
**Problème** : Recrée toute la géométrie à chaque update (même avec debounce)
**Solution** : Ajouter seulement les nouveaux segments

```typescript
// terrain.ts
export function updateRecordedTrackMeshIncremental(newPoints: LocationPoint[]): void {
    // Au lieu de recréer tout le mesh
    // Ajouter uniquement les nouveaux segments
    if (state.recordedMesh && newPoints.length > 0) {
        // Créer géométrie uniquement pour les nouveaux points
        // Les fusionner avec le mesh existant
    } else {
        // Premier appel: créer tout
        updateRecordedTrackMesh();
    }
}
```

### 5. **Lazy loading des points** (MEDIUM PRIORITY)
**Problème** : Tous les points chargés en mémoire
**Solution** : Pagination pour affichage

```typescript
// Charger uniquement les points visibles
const VISIBLE_POINT_LIMIT = 500;
const pointsToShow = state.recordedPoints.slice(-VISIBLE_POINT_LIMIT);
```

### 6. **Notification optimisée** (LOW PRIORITY)
**Problème** : Notification mise à jour trop fréquemment
**Solution** : Debounce côté natif

```java
// Dans RecordingService
private long lastNotificationUpdate = 0;
private static final long NOTIFICATION_MIN_INTERVAL = 5000; // 5s max

private void updateNotification(int pointCount) {
    long now = System.currentTimeMillis();
    if (now - lastNotificationUpdate < NOTIFICATION_MIN_INTERVAL) return;
    lastNotificationUpdate = now;
    // ... update
}
```

---

## 🛡️ Optimisations Recovery (Critique)

### 7. **Recovery simplifié** (HIGH PRIORITY)
**Problème** : Logique complexe dans main.ts (2 cas: actif vs interrompu)
**Solution** : Un seul cas - "récupérer depuis natif"

```typescript
// main.ts - Simplification
window.addEventListener('suntrail:uiReady', async () => {
    const course = await nativeGPSService.getCurrentCourse();
    if (course?.isRunning) {
        const points = await nativeGPSService.getAllPoints(course.courseId);
        state.recordedPoints = points;
        state.isRecording = true;
        state.currentCourseId = course.courseId;
        nativeGPSService.setupListeners();
        sheetManager.open('track');
        showToast(`Reprise — ${points.length} points`);
    }
});
```

### 8. **Persistance hybride** (MEDIUM PRIORITY)
**Problème** : Dépendance totale à SQLite (si corrompu = tout perdu)
**Solution** : Backup JSON automatique toutes les 5 minutes

```typescript
// foregroundService.ts - Réintroduire backup périodique
const BACKUP_INTERVAL = 5 * 60 * 1000; // 5min
setInterval(() => {
    if (state.isRecording && state.recordedPoints.length > 0) {
        persistAllPointsNow(state.recordedPoints);
    }
}, BACKUP_INTERVAL);
```

---

## 🎨 Optimisations UX (Medium)

### 9. **Indicateurs de batterie** (MEDIUM PRIORITY)
**Solution** : Afficher estimé temps restant dans notification

```java
// RecordingService notification
// "REC — 45min — Batterie: 78% (≈6h restantes)"
```

### 10. **Mode "Pause"** (LOW PRIORITY)
**Solution** : Bouton pause dans notification
- Arrête temporairement le GPS
- Garde le service en vie
- Reprise instantanée

---

## 🔧 Optimisations Code (Medium)

### 11. **Réduire complexité bridge** (HIGH PRIORITY)
**Problème** : Trop de méthodes dans RecordingPlugin
**Solution** : API minimaliste

```java
// Au lieu de 10+ méthodes, seulement 4 essentiels:
startCourse(options) → { courseId }
stopCourse() → void
getPoints({courseId, since}) → { points[] }
getCurrentCourse() → { courseId, isRunning, pointCount }
```

### 12. **Cleanup automatique** (MEDIUM PRIORITY)
**Solution** : Supprimer vieilles courses SQLite

```java
// Dans RecordingService.onStartCommand
mDbExecutor.execute(() -> {
    long oneWeekAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000);
    int deleted = mDao.deleteOldCourses(oneWeekAgo);
    if (deleted > 0) Log.i(TAG, "Nettoyage: " + deleted + " vieilles courses supprimées");
});
```

---

## 📋 Plan d'implémentation priorisé

### Phase 1 : Critique (Batterie + Recovery)
1. ☐ Intervalle GPS adaptatif (batterie)
2. ☐ Batch inserts SQLite (batterie + perf)
3. ☐ Simplification recovery main.ts (fiabilité)
4. ☐ Backup JSON périodique (sécurité)

### Phase 2 : Performance
5. ☐ Mesh 3D incrémental (UI fluide)
6. ☐ Lazy loading points (mémoire)
7. ☐ Notification debounce (batterie)

### Phase 3 : UX
8. ☐ Indicateur batterie dans notification
9. ☐ Mode pause
10. ☐ Cleanup automatique SQLite

### Phase 4 : Refactoring
11. ☐ API minimaliste RecordingPlugin
12. ☐ Tests unitaires natifs (Android)

---

## 🎯 Métriques de succès

Après optimisation, le système doit atteindre :

| Métrique | Avant (v5.22.x) | Actuel (v5.25.0) | Objectif |
|----------|-----------------|------------------|----------|
| **Batterie 8h** | ❌ WebView tuée | ⚠️ À mesurer | ✅ 8h+ avec <50% batterie |
| **Recovery** | ✅ 100% | ⚠️ Corrigé | ✅ 100% fiable |
| **Points 5min** | ~150 | 2911 (bug) | ✅ 100-200 (filtré) |
| **UI freeze** | ❌ Aucun | ⚠️ Sur longues rando | ✅ Aucun (mesh debounce) |
| **Complexité** | Simple | Complexe | ✅ Simplifiée |

---

## 💡 Recommandations immédiates

**À implémenter DÈS MAINTENANT** (batterie + fiabilité):

1. ✅ Intervalle GPS adaptatif (gros gain batterie)
2. ✅ Simplification recovery (supprimer cas complexe)
3. ✅ Backup JSON (sécurité SQLite)

**Ensuite** (performance):
4. ✅ Mesh incrémental (UI fluide)
5. ✅ Batch inserts (optimisation I/O)

**Tu veux que je commence par quelle optimisation ?** 🔧
