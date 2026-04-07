# Fix GPS Recording Duplicates - v5.25.1

## Problème
Les traces GPX exportées contenaient des points dupliqués (47 doublons sur 340 points), 
ce qui doublait la distance calculée (2.3km au lieu de 1.11km).

## Root Cause
1. **SQLite**: Pas de contrainte UNIQUE sur (course_id, timestamp)
2. **Recovery**: Après kill de l'app, les points récupérés pouvaient être réinsérés
3. **Export GPX**: Pas de dédoublonnage avant l'export

## Solutions Implémentées

### 1. Contrainte UNIQUE SQLite (Solution définitive)
**Fichier**: `android/app/src/main/java/com/suntrail/threejs/data/GPSPoint.java`
```java
@Index(value = {"course_id", "timestamp"}, unique = true)
```

### 2. Migration de base de données
**Fichier**: `android/app/src/main/java/com/suntrail/threejs/data/AppDatabase.java`
- Migration 1→2 qui supprime les doublons existants avant d'appliquer la contrainte
- Préserve les données utilisateur

### 3. Insertion avec IGNORE
**Fichier**: `android/app/src/main/java/com/suntrail/threejs/data/GPSPointDao.java`
```java
@Insert(onConflict = OnConflictStrategy.IGNORE)
```

### 4. Logging des doublons
**Fichier**: `android/app/src/main/java/com/suntrail/threejs/RecordingService.java`
- Log WARN quand des points sont ignorés à cause de la contrainte UNIQUE
- Permet de monitorer si le problème persiste

### 5. Double sécurité export GPX
**Fichier**: `src/modules/ui/components/TrackSheet.ts`
```typescript
const uniquePoints = [...new Map(state.recordedPoints.map(p => [p.timestamp, p])).values()];
```

### 6. Tests unitaires
**Fichier**: `src/modules/gpsDeduplication.test.ts`
- 12 tests couvrant tous les scénarios de dédoublonnage
- Tests de recovery après kill
- Tests d'export GPX

## Tests
✅ 447 tests passent (1 failure pré-existante non liée)
✅ 12 nouveaux tests pour le dédoublonnage

## Impact
- **Avant**: Distance doublée, profil d'élévation faux
- **Après**: Traces précises, pas de doublons

## Migration
La migration est automatique au premier démarrage de l'app après mise à jour.
Les données existantes sont nettoyées et la contrainte UNIQUE est appliquée.
