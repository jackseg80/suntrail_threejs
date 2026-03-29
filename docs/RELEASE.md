# SunTrail 3D — Workflow de Publication

> Guide pour les agents IA et le développeur. Suivre dans l'ordre exact.

---

## 🚀 Publication d'une nouvelle version (workflow standard)

### Étape 1 — Incrémenter le versionCode (OBLIGATOIRE)

Dans `android/app/build.gradle` :

```groovy
versionCode 513        // ← incrémenter de 1 à chaque release
versionName "5.12.3"   // ← mettre à jour selon le tag git
```

> ⚠️ Play Store refuse tout AAB avec un versionCode déjà utilisé.
> Ne jamais réutiliser un versionCode même si la release a échoué.

### Étape 2 — Commit + Tag

```bash
git add android/app/build.gradle
git commit -m "chore: bump versionCode XXX→YYY, versionName X.Y.Z"
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Le tag déclenche automatiquement `.github/workflows/release.yml`.

### Étape 3 — Attendre le CI (~5 min)

GitHub → Actions → "Build Android AAB" → vérifier que le run passe.

L'AAB signé est disponible dans : **GitHub → Releases → vX.Y.Z → app-release.aab**

### Étape 4 — Upload Play Console

1. [play.google.com/console](https://play.google.com/console) → SunTrail 3D
2. Selon la cible :
   - **Tests internes** → pour tester soi-même (immédiat)
   - **Tests fermés** → pour les 20 testeurs (14 jours obligatoires 1ère fois)
   - **Production** → après validation closed testing
3. Créer une release → Téléverser l'AAB → Notes de version → Examiner → Déployer

---

## 📋 Historique des versionCodes

| versionCode | versionName | Tag git | Track Play Store | Date |
|-------------|-------------|---------|-----------------|------|
| 512 | 5.11.1 | v5.12.0 | CI test — clé RevenueCat `test_` (crash) | 2026-03-29 |
| 512 | 5.11.1 | v5.12.1 | CI test — fix CRLF gradlew | 2026-03-29 |
| 512 | 5.11.1 | v5.12.2 | CI test — fix permissions GitHub Release | 2026-03-29 |
| 512 | 5.11.1 | v5.12.3 | CI test — clé RevenueCat `goog_` | 2026-03-29 |
| 513 | 5.12.3 | v5.12.4 | Tests internes — 1er upload Play Console | 2026-03-29 |
| 513 | 5.12.3 | v5.12.5 | Setup screen auto-skip (clé bundlée) | 2026-03-29 |
| 514 | 5.12.5 | v5.12.5-fix | Tests internes — app fonctionnelle Galaxy Tab S8 | 2026-03-29 |
| 515 | 5.12.6 | v5.12.6 | Fix timeline 2D + regression widget display order | 2026-03-29 |
| 516 | 5.12.7 | v5.12.7 | Fix bouton timeline accessible en 2D au démarrage | 2026-03-29 |
| **517** | **5.12.8** | **v5.12.8** | **Fix REC crash GPS + perte données auto-stop + persistence filesystem** | **2026-03-29** |

> À compléter à chaque release. Ne jamais laisser ce tableau vide.

---

## 🔑 Secrets & Clés (jamais dans Git)

| Variable | Où | Usage |
|---|---|---|
| `VITE_MAPTILER_KEY` | `.env` + GitHub Secret | Tiles MapTiler bundlées |
| `VITE_REVENUECAT_KEY` | `.env` + GitHub Secret | IAP RevenueCat Android (`goog_`) |
| `KEYSTORE_BASE64` | GitHub Secret | Signature AAB |
| `STORE_PASSWORD` | GitHub Secret | Mot de passe keystore |
| `KEY_PASSWORD` | GitHub Secret | Mot de passe clé |
| `KEY_ALIAS` | GitHub Secret | `suntrail` |

**Fichiers locaux hors Git :**
- `android/suntrail.keystore` — sauvegarder hors repo (cloud chiffré)
- `android/keystore.properties` — contient les mots de passe en clair
- `.env` — contient toutes les clés API

---

## ⚙️ Build local (sans CI)

```bash
# 1. Build web
npm run build

# 2. Sync Capacitor
npx cap sync android

# 3. Build AAB signé
JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew bundleRelease --no-daemon
# (depuis android/)

# AAB généré dans :
# android/app/build/outputs/bundle/release/app-release.aab
```

---

## 🔗 RevenueCat — Configuration

| Paramètre | Valeur |
|---|---|
| Projet | SunTrail |
| App Android | `com.suntrail.threejs` |
| Entitlement | `SunTrail 3D Pro` |
| Offerings | monthly / yearly / lifetime |
| SDK key (Android) | `goog_uNvY...` (dans `.env`) |
| Service Account JSON | ⬜ À configurer (validation serveur — post-lancement) |

---

## 📱 Tracks Play Store

| Track | Usage | Délai review |
|---|---|---|
| **Tests internes** | Toi + quelques proches (≤100) | Instantané |
| **Tests fermés** | 20+ testeurs, 14 jours obligatoires (1ère fois) | Instantané |
| **Open Testing** | Beta publique | Quelques heures |
| **Production** | Tout le monde | Quelques heures |

> Le passage Tests fermés → Production est obligatoire pour les nouveaux développeurs.
> Après la 1ère production, toutes les updates passent directement sans délai.

---

## ✅ Checklist avant chaque release production

- [ ] `versionCode` incrémenté dans `build.gradle`
- [ ] `npm run check` → 0 erreur TypeScript
- [ ] `npm test` → suite verte
- [ ] AAB buildé et signé par CI
- [ ] Testé sur appareil physique (Galaxy Tab S8 ou équivalent)
- [ ] Notes de version rédigées (FR + EN)
- [ ] Screenshots à jour si nouvelles features visuelles
