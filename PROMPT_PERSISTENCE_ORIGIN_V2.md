# PROMPT DE RÉPARATION : Persistance de l'Origine d'Enregistrement GPS (v2)

## Contexte
L'application SunTrail 3D utilise un système de coordonnées relatives basées sur une tuile d'origine (originTile). Pour garantir la cohérence d'un tracé GPS en cours d'enregistrement (REC), nous utilisons `state.recordingOriginTile` pour figer l'origine. Actuellement, cette variable est perdue si l'application est fermée/tuée par Android, car elle n'est pas persistée dans le localStorage.

## Objectif
Modifier le système de persistance pour sauvegarder et restaurer `recordingOriginTile` afin que la reprise d'un enregistrement après un crash soit géographiquement parfaite (pas de décalage de ligne).

## Problème spécifique identifié
Dans **TrackSheet.ts ligne 71**, `recordingOriginTile` est assigné AVANT `startRecordingService()`, donc le snapshot initial ne contient pas l'originTile. De plus, `getInterruptedRecording()` ne retourne pas cette valeur lors de la reprise.

## Fichiers à modifier

1. **src/modules/foregroundService.ts** (Interface + persistance + récupération)
2. **src/modules/ui/components/TrackSheet.ts** (Ordre des opérations au démarrage)
3. **src/modules/main.ts** ou fichier de recovery (Restauration au démarrage)

## Instructions détaillées

### 1. foregroundService.ts

#### a) Mettre à jour l'interface RecordingSnapshot (ligne ~33)
```typescript
interface RecordingSnapshot {
    isRecording: boolean;
    startTime: number;
    pointCount: number;
    originTile?: { x: number; y: number; z: number };  // AJOUTER CECI
}
```

#### b) Modifier startRecordingService() (ligne ~58)
**AVANT :**
```typescript
export async function startRecordingService(): Promise<void> {
    const snapshot: RecordingSnapshot = {
        isRecording: true,
        startTime: Date.now(),
        pointCount: 0,
    };
```

**APRÈS :**
```typescript
export async function startRecordingService(originTile?: { x: number; y: number; z: number }): Promise<void> {
    const snapshot: RecordingSnapshot = {
        isRecording: true,
        startTime: Date.now(),
        pointCount: 0,
        originTile: originTile,  // AJOUTER CECI
    };
```

#### c) Modifier getInterruptedRecording() (ligne ~261)
**AVANT :**
```typescript
export function getInterruptedRecording(): RecordingSnapshot | null {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        return snapshot.isRecording ? snapshot : null;
    } catch {
        return null;
    }
}
```

**APRÈS :** (Retourner tout le snapshot y compris originTile)
```typescript
export function getInterruptedRecording(): RecordingSnapshot | null {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        return snapshot.isRecording ? snapshot : null;
    } catch {
        return null;
    }
}
```

#### d) Vérifier updateRecordingSnapshot() (ligne ~109)
**S'assurer que originTile n'est pas perdu lors des mises à jour :**
```typescript
export function updateRecordingSnapshot(
    pointCount: number,
    points?: LocationPoint[]
): void {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return;
    try {
        const snapshot: RecordingSnapshot = JSON.parse(raw);
        snapshot.pointCount = pointCount;
        // NE PAS ÉCRASER originTile - elle est déjà dans snapshot
        localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch { /* ignore */ }
    // ... reste de la fonction inchangé
}
```

### 2. TrackSheet.ts (lignes 69-72)

**AVANT (actuel) :**
```typescript
// v5.23.4: Figer originTile au démarrage pour cohérence des coordonnées
state.recordingOriginTile = { ...state.originTile };
await startRecordingService();   // Snapshot créé ici mais SANS originTile!
```

**APRÈS (corrigé) :**
```typescript
// v5.23.4: Figer originTile au démarrage pour cohérence des coordonnées
const currentOrigin = { ...state.originTile };
state.recordingOriginTile = currentOrigin;
await startRecordingService(currentOrigin);   // Passer l'origin au snapshot
```

### 3. Logique de récupération (Recovery)

Dans **main.ts** (ou où la logique de recovery est gérée), lors de la détection d'un enregistrement interrompu :

**AJOUTER la restauration de recordingOriginTile :**
```typescript
const interrupted = getInterruptedRecording();
if (interrupted && interrupted.originTile) {
    // Restaurer l'originTile avant de traiter les points
    state.recordingOriginTile = interrupted.originTile;
    
    // Puis fusionner les points natifs
    const nativePoints = await getNativeRecordedPoints();
    if (nativePoints.length > 0) {
        state.recordedPoints = mergeAndDeduplicatePoints([], nativePoints);
        updateRecordedTrackMesh();
    }
}
```

### 4. Vérification terrain.ts

S'assurer que `updateRecordedTrackMesh()` utilise bien l'origin restaurée (normalement déjà OK avec la ligne 1074) :
```typescript
// v5.23.4: Utiliser recordingOriginTile figé si disponible
const originTile = state.recordingOriginTile || state.originTile;
```

## Contraintes importantes

- **NE PAS** modifier le format du fichier JSON des points (`suntrail_rec_points_v1.json`)
- **NE PAS** modifier le service natif Java (RecordingService.java)
- Préserver la compatibilité avec les versions précédentes (originTile optionnel)

## Validation (Tests à effectuer)

### Test 1 : Persistance basique
1. Démarrer un REC
2. Vérifier dans DevTools > Application > LocalStorage que `suntrail_rec_snapshot_v1` contient `originTile` avec les bonnes coordonnées
3. Fermer l'application (forcer l'arrêt)
4. Rouvrir l'application
5. Vérifier que `state.recordingOriginTile` est restaurée correctement

### Test 2 : Cohérence géographique
1. Démarrer un REC à un endroit précis (noter les coordonnées)
2. Marcher ~100m
3. Fermer l'application pendant le REC
4. Rouvrir et vérifier que :
   - La trace s'affiche au bon endroit
   - Les points ne sont pas décalés
   - Le marqueur de position correspond à la trace

### Test 3 : Continuité après recovery
1. Démarrer un REC
2. Ajouter quelques points
3. Simuler un crash (forcer l'arrêt)
4. Rouvrir et continuer le REC
5. Vérifier que les nouveaux points s'ajoutent cohérents avec les anciens (pas de saut)

## Vérification finale

S'assurer que `lngLatToWorld()` dans `updateRecordedTrackMesh()` utilise bien :
```typescript
const originTile = state.recordingOriginTile || state.originTile;
```

Cela garantit que si `recordingOriginTile` est présente (persistée), elle est utilisée en priorité.

---

**Critère de succès :** Après un crash/recovery, la trace affichée est exactement au même endroit que si l'application n'avait pas crashé.
