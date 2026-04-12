# Analyse du Bug d'Enregistrement GPS - 07.04.2026

## Données comparées

### Garmin (référence)
- Distance: **1.11 km**
- D+: **7m**, D-: **6m**
- Durée: **16min56**
- Points: ~1000+ (enregistrement continu 1s)
- Fenêtre temporelle: 07:02:37 → ~07:19:33 (cohérent avec 17min)

### SunTrail v5.25.0
- Distance: **2.3 km** (doublée ❌)
- D+: **13m**, D-: **13m** (doublés ❌)
- Points: **293**
- Fenêtre temporelle: 07:02:21 → 07:19:10 (17min ✅)
- **Problème**: Distance doublée malgré même durée

## Problèmes identifiés

### 1. Duplication de points dans le fichier GPX ⚠️

En analysant le fichier `suntrail-2026-04-07-1775546370850.gpx`:

**Lignes 962-1176**: Points normaux (07:15:02 → 07:19:10)
```xml
<trkpt lat="47.3577467" lon="7.3853062">
  <ele>429.1</ele>
  <time>2026-04-07T07:15:02.000Z</time>
</trkpt>
```

**Lignes 1178-1365**: Points **DUPLIQUÉS** avec les **mêmes timestamps**
```xml
<trkpt lat="47.3578082" lon="7.3851354">
  <ele>429.1</ele>
  <time>2026-04-07T07:15:19.815Z</time>  ← DUPLIQUÉ de ligne 990!
</trkpt>
```

**Duplication détectée**:
- Lignes 1178-1365 = Duplication des lignes 986-1365
- Les timestamps sont identiques (07:15:19 → 07:19:10)
- Les coordonnées sont identiques

### 2. Enregistrement involontaire du trajet retour ⚠️

**Fichier GPX complet**:
- Début: 07:02:21 (aller)
- Point culminant temporel: ~07:10:27 (ligne 551 - latitude 47.3582508)
- Fin: 07:19:10 (retour)

La trace SunTrail a enregistré:
1. **Aller simple**: 07:02:21 → 07:10:27 (~8 min) - Distance normale
2. **Retour**: 07:10:27 → 07:19:10 (~9 min) - **Enregistrement continu!**

**Trous temporels détectés** (indiquant kill de l'app):
- Ligne 172-173: Gap de ~4s (07:03:50 → 07:03:53)
- Ligne 200-201: Gap de ~4s (07:04:08 → 07:04:10)
- Ligne 306-308: **Gap de 32s** (07:05:38 → 07:06:10) ← **Kill de l'app ici?**
- Ligne 436-437: Gap de ~23s (07:08:31 → 07:08:33)
- Ligne 501-502: Gap de ~15s (07:09:29 → 07:09:45)
- Ligne 648-649: Gap de ~12s (07:11:01 → 07:11:19)
- Ligne 1006-1008: Gap de ~43s (07:15:26 → 07:16:08) ← **Grand gap**

### 3. "Gros champignon" mentionné par l'utilisateur

L'utilisateur dit: "Ca a d'abord affiché un gros champignon mais ensuite ca a repris la trace"

Cela suggère:
- L'app a été tuée pendant l'enregistrement
- Au redémarrage, **tous les points enregistrés** ont été rechargés
- Puis l'enregistrement a continué
- **Problème**: Les points ont été réinsérés dans la base lors de la reprise

## Hypothèse du bug

### Scénario:

1. **07:02:21**: Enregistrement démarré
2. **07:05-07:06**: **App tuée** (gap de 32s détecté)
3. **Reprise**: L'utilisateur rouvre l'app
   - Recovery charge tous les points depuis SQLite
   - **Mais les points sont peut-être réinsérés?**
4. **07:10:27**: Arrivée au point le plus éloigné
5. **07:10:27+**: Retour vers la maison - **Enregistrement continue (pourquoi?)**
6. **Fin**: Arrêt manuel ou kill final

### Problème probable dans `nativeGPSService.ts`:

```typescript
// Au redémarrage après kill, les points sont récupérés via:
const points = await RecordingNative.getPoints(since);
// MAIS si 'since' est incorrect ou absent, on peut avoir:
// 1. Récupération de TOUS les points
// 2. Réinsertion dans l'affichage
// 3. Déduplication qui échoue?
```

### Problème de recovery:

Dans `RecordingService.java`, le recovery sauve `currentCourseId`:
```java
prefs.edit().putLong("currentCourseId", courseId).apply();
```

Mais au redémarrage, la logique de récupération des points existants peut:
1. Recharger tous les points depuis SQLite
2. Les **réinsérer** dans la liste affichée
3. Créer des doublons dans l'affichage

## Actions recommandées

### 1. Vérifier la logique de recovery (CRITIQUE)

Dans `nativeGPSService.ts`, vérifier:
```typescript
// Au démarrage, après recovery:
const existingPoints = await RecordingNative.getPoints(0); // 0 = tous les points
// Les points sont-ils dédoublonnés avant affichage?
```

### 2. Vérifier l'arrêt de l'enregistrement

L'utilisateur dit avoir tué l'app, mais l'enregistrement a continué jusqu'à 07:19:10.
- Le bouton STOP a-t-il été pressé?
- Le RecordingService s'est-il **vraiment** arrêté?
- Y a-t-il des logs Android montrant l'arrêt?

### 3. Ajouter des logs diagnostics

Dans le commit 376642c, des logs ont été ajoutés. Les utiliser pour:
- Vérifier combien de points sont dans SQLite au total
- Vérifier les timestamps des points insérés
- Vérifier si les points sont envoyés plusieurs fois via `onNewPoints`

### 4. Vérifier le code de duplication GPX

Dans le module d'export GPX, vérifier:
```typescript
// Le GPX exporté ne devrait pas contenir de doublons
// Vérifier que `points` est un tableau unique
const uniquePoints = [...new Map(points.map(p => [p.timestamp, p])).values()];
```

## Questions pour l'utilisateur

1. **Bouton STOP**: Avez-vous appuyé sur le bouton STOP rouge avant de tuer l'app, ou avez-vous tué l'app directement?
2. **Durée enregistrement**: La trace montre 17 minutes d'enregistrement. À quel moment avez-vous arrêté intentionnellement?
3. **Champignon**: Quand vous dites "gros champignon", est-ce que c'était:
   - Un groupe de lignes rectilignes au même endroit?
   - Des points en désordre?
4. **Panel Parcours**: Quand vous avez tué l'app, avez-vous vu le panneau "Parcours" afficher des points avant le crash?

## Fichiers impactés

### Code à vérifier:

1. **`src/modules/nativeGPSService.ts`**
   - Recovery logic: comment les points existants sont rechargés
   - `getPoints(since)`: vérifier le paramètre `since`
   - Déduplication: vérifier `donePointsTimestamps`

2. **`android/app/src/main/java/com/suntrail/threejs/RecordingService.java`**
   - `onStopRecording()`: vérifier que tout est bien nettoyé
   - Recovery: vérifier `SharedPreferences` et rechargement

3. **`android/app/src/main/java/com/suntrail/threejs/RecordingPlugin.java`**
   - `getPoints(since)`: vérifier la requête SQL
   - `getNewPoints()`: vérifier le retour

4. **GPX Export** (module inconnu)
   - Vérifier que le tableau de points est unique avant export

## Prochaines étapes

1. Demander les logs Android (`adb logcat | grep RecordingNative`) pour voir:
   - Timestamps des points insérés
   - Nombre de points en base
   - Si `onNewPoints` est appelé plusieurs fois

2. Reproduire le bug:
   - Démarrer un enregistrement
   - Marcher ~5 min
   - Tuer l'app
   - Rouvrir l'app
   - Vérifier le panneau Parcours

3. Corriger la duplication dans le GPX exporté (quick fix)
4. Corriger le root cause dans la logique de recovery