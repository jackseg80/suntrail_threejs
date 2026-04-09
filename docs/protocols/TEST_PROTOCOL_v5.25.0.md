# Protocole de Test Terrain - SunTrail v5.25.0

## Objectif
Valider l'architecture "Single Source of Truth" et corriger les problèmes de doublons GPS.

## Scénario de test recommandé

### Test 1 : Rando courte (30-60 min) - VALIDATION CRITIQUE
**But :** Vérifier que le problème de doublons est résolu

1. **Avant la rando**
   - Activer l'enregistrement GPS (bouton REC)
   - Vérifier que la position est acquise (point rouge sur la carte)
   - Noter l'heure de départ

2. **Pendant la rando**
   - Mettre le téléphone en poche (écran éteint)
   - Marcher normalement 15-20 min
   - Ne PAS manipuler l'app
   - Sortir le téléphone, vérifier que le tracé suit bien
   - Remettre en poche, continuer 15-20 min
   - Répéter 2-3 fois

3. **À l'arrêt**
   - Arrêter l'enregistrement
   - Vérifier le tracé : **aucune ligne droite étrange**
   - Exporter le GPX
   - Comparer avec Garmin/Strava si dispo

4. **Critères de succès**
   - Distance affichée = distance réelle ±5%
   - Pas de lignes droites reliant des points éloignés
   - D+/D- cohérent avec le terrain
   - Le tracé suit bien le sentier sur la carte

### Test 2 : Test de recovery (simuler un crash)
**But :** Vérifier que l'app récupère bien après kill

1. Démarrer un enregistrement
2. Marcher 5 min
3. **Forcer l'arrêt** de l'app (swipe up + kill)
4. Rouvrir l'app immédiatement
5. **Vérifier :**
   - Popup "Reprendre l'enregistrement ?" doit apparaître
   - Les points enregistrés avant kill doivent être présents
   - Cliquer sur "Reprendre" doit continuer sans doublons

### Test 3 : Stress test (si possible)
**But :** Vérifier la stabilité sur longue durée

- Rando de 3-4h minimum
- Téléphone en poche la plupart du temps
- Vérifier que l'app ne crashe pas
- Vérifier que le tracé reste précis jusqu'au bout

## Checklist validation

| Critère | Attendu | Résultat |
|---------|---------|----------|
| Distance totale | Précision ±5% vs réel | ☐ |
| Dénivelé D+ | Précision ±10% vs Garmin | ☐ |
| Lignes droites | AUCUNE sur le tracé | ☐ |
| Recovery après kill | Fonctionne sans doublons | ☐ |
| Drain batterie | Normal (pas excessif) | ☐ |
| Crash app | AUCUN | ☐ |

## Si problèmes détectés

1. **Récupérer les logs** :
   ```bash
   adb logcat -d > logcat.txt
   ```

2. **Exporter le GPX** depuis l'app (TrackSheet → Partager)

3. **Noter exactement** :
   - Heure du problème
   - Ce que vous faisiez (poche, main, etc.)
   - Comportement observé

4. **Ouvrir une issue** avec :
   - Le fichier GPX
   - Les logs
   - La description du problème

## Build pour test

```bash
# Build Android
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug

# Installer sur device
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Notes importantes

- **Ne PAS** désinstaller l'app entre les tests (pour conserver les données)
- **Ne PAS** utiliser de mode économie d'énergie agressif
- **Autoriser** toutes les permissions GPS (précision + arrière-plan)
- **Comparer** avec une montre GPS si possible (Garmin, Polar, etc.)

## Test 4 : Vérification densité des points (NOUVEAU)
**But :** Vérifier qu'on n'a pas trop de points (jitter quand immobile)

1. Démarrer un enregistrement
2. Marcher 5 minutes normalement
3. **S'arrêter et rester immobile 2 minutes** (téléphone en poche)
4. Marcher encore 5 minutes
5. Arrêter l'enregistrement
6. **Vérifier :**
   - Nombre de points : ~150-250 pour 10-12min de marche (pas 2000+ !)
   - La trace ne doit pas montrer d'allers-retours quand tu étais immobile
   - Export GPX : vérifier le nombre de points dans le fichier

## Test 5 : Précision altitude (NOUVEAU)
**But :** Vérifier que l'altitude correspond à la réalité

1. Se placer à un endroit avec altitude connue (panneau, carte IGN)
2. Démarrer l'enregistrement
3. Attendre 30 secondes
4. Vérifier que l'altitude affichée correspond à l'altitude réelle ±5m

## Problèmes connus (corrigés)

| Problème | Symptôme | Fix appliqué |
|----------|----------|--------------|
| Recovery après kill | App vide quand on rouvre | `currentCourseId` sauvegardé dans SharedPreferences |
| Trop de points | 2911 points pour 5min, lignes chaotiques | `MIN_DISTANCE_M` passé de 1m à 3m + déduplication |
| Altitude fausse | 490m au lieu de 430m | Correction géoïde + MSL sur Android 12+ |
| CourseId perdu | Nouveau REC à 0 après kill | `getCurrentCourse()` récupère depuis SharedPreferences |

## Success criteria finale

L'architecture est validée si :
1. ✅ Distance cohérente (erreur < 5%)
2. ✅ Pas de doublons (tracé propre)
3. ✅ **Recovery fonctionne après kill** (points présents quand on rouvre)
4. ✅ **Densité correcte** (~150-250 points pour 10min, pas 2000+)
5. ✅ **Altitude correcte** (±5m vs réalité)
6. ✅ Pas de crash sur 3h+ d'utilisation

**Une fois validé**, nettoyage de l'ancien code JSON et release v5.25.0.
