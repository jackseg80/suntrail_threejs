# Guide de Déploiement Android - Suntrail 3D

Ce projet utilise **Capacitor** pour transformer l'application Web en une application Android native.

## 🚀 Flux de travail Rapide (Simplifié)

Dès que vous modifiez le code source (`src/*.ts`), utilisez la commande unique :

```powershell
npm run deploy
```

Cette commande automatise tout le processus :
1. **Validation :** Vérifie qu'il n'y a pas d'erreurs de type TypeScript.
2. **Build :** Compile le projet web dans le dossier `dist/`.
3. **Synchronisation :** Copie les fichiers dans le projet Android natif.

## 🛠️ Pré-requis

1. **Android Studio** (Dernière version recommandée).
2. **Mode Développeur** activé sur votre téléphone Android.

## 📱 Lancer sur Téléphone

1. Ouvrez le projet dans Android Studio :
   ```powershell
   npm run cap:open
   ```
2. Dans Android Studio, cliquez sur le bouton **Run (▶️)**.

## 🎨 Personnalisation des visuels

### Icônes et Splash Screen adaptatifs
Toutes les icônes (rondes, adaptatives, legacy) et les splash screens sont générés à partir de `assets/icon.png`. Pour appliquer un changement visuel :
```powershell
npm run cap:assets
```

## 📦 Distribution

Pour générer un APK ou un AAB (Play Store) :
1. Allez dans `Build > Generate Signed Bundle / APK...` dans Android Studio.
2. Suivez l'assistant de signature.
