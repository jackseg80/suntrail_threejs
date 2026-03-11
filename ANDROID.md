# Guide de Déploiement Android - Suntrail 3D

Ce projet utilise **Capacitor** pour transformer l'application Web Three.js en une application Android native.

## 🚀 Flux de travail Rapide

Dès que vous modifiez le code web (`src/`, `main.js`, etc.), lancez cette commande pour mettre à jour l'application Android :

```powershell
npm run android:update
```

Cette commande exécute :
1. `npm run build` : Compile le projet web dans le dossier `dist/`.
2. `npx cap sync` : Synchronise le dossier `dist/` avec le projet Android natif.

## 🛠️ Pré-requis

1. **Android Studio** installé sur votre machine.
2. **Mode Développeur** activé sur votre téléphone Android (avec Débogage USB).

## 📱 Lancer sur Téléphone

1. Ouvrez le projet dans Android Studio :
   ```powershell
   npm run cap:open
   ```
2. Connectez votre téléphone en USB.
3. Dans Android Studio, sélectionnez votre appareil en haut et cliquez sur le bouton **Run (▶️)**.

## 🎨 Personnalisation

### Icônes et Splash Screen
Les images sources sont dans le dossier `assets/`. Pour régénérer toutes les tailles d'icônes après avoir modifié `icon.png` :
```powershell
npx capacitor-assets generate --android
```

### Nom de l'application
Le nom est configuré dans `android/app/src/main/res/values/strings.xml` sous la clé `app_name`.

## 📦 Générer l'APK / AAB pour le Play Store

Dans Android Studio :
1. Allez dans `Build > Generate Signed Bundle / APK...`.
2. Choisissez `Android App Bundle` (pour le Play Store) ou `APK` (pour installation directe).
3. Suivez les étapes de création de clé (Keystore) pour signer votre application.
