# SunTrail v5.11.0 — Rapport d'audit pré-Play Store

**Date :** 2026-03-28  
**Scope :** Sécurité · Qualité code · UX/PWA · Android/Capacitor · Dépendances  
**Tests :** 188/188 ✅ · TypeScript 0 erreurs ✅ · Lighthouse Accessibility 91/100 · Best Practices 100/100

---

## 🔴 CRITIQUES — Bloquants avant soumission (4)

### C1 — `android:usesCleartextTraffic` absent + pas de `network_security_config.xml`
**Fichier :** `android/app/src/main/AndroidManifest.xml`  
**Risque :** Android autorise le trafic HTTP cleartext par défaut. Sans `networkSecurityConfig`, aucune restriction réseau côté OS. Les review Play Store signalent systématiquement ce manque.

**Fix :**  
1. Créer `android/app/src/main/res/xml/network_security_config.xml` :
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```
2. Dans `<application>` du manifest, ajouter :
```xml
android:usesCleartextTraffic="false"
android:networkSecurityConfig="@xml/network_security_config"
```

---

### C2 — Clé API MapTiler stockée en clair dans `localStorage`
**Fichiers :** `src/modules/state.ts:343` · `src/modules/ui/components/SharedAPIKeyComponent.ts:29` · `src/modules/ui.ts:87`  
**Risque :** La clé MapTiler (saisie par l'utilisateur) est stockée en plaintext sous `maptiler_key` et `suntrail_settings.MK`. Toute faille XSS ou accès aux données Android peut l'exposer.  
**Note :** La clé est fournie par l'utilisateur, pas hardcodée — c'est un risque atténué. Mais le stockage plaintext + backup Android (C4) est problématique.

**Fix recommandé :** Obfusquer avec un salt généré à la première installation. Ou utiliser `sessionStorage` (effacé à la fermeture, re-saisie par session).

---

### C3 — Coordonnées GPS du tracé stockées en clair dans `localStorage`
**Fichier :** `src/modules/foregroundService.ts:47, 85` — clé `suntrail_recording_snapshot`  
**Risque :** L'array complet de waypoints GPS (lat/lon/alt) est persisté en plaintext pour survivre aux crashes Android. Données personnelles sensibles per RGPD.

**Fix :** Chiffrer le snapshot avant stockage (AES-GCM avec `window.crypto`) ou n'y stocker que les métadonnées (compteur, bornes bbox), pas les coordonnées.

---

### C4 — `android:allowBackup="true"` expose localStorage aux backups Google
**Fichier :** `android/app/src/main/AndroidManifest.xml` ligne 4  
**Risque :** Android Auto-Backup inclut le localStorage WebView (clé MapTiler + tracés GPS) et l'envoie sur les serveurs Google. Les données sont restaurables sur un autre appareil — ou accessibles via compte Google compromis.

**Fix :** Soit `android:allowBackup="false"`, soit créer un `backup_rules.xml` avec exclusions :
```xml
<!-- res/xml/backup_rules.xml -->
<full-backup-content>
    <exclude domain="sharedpref" path="." />
    <exclude domain="database" path="." />
</full-backup-content>
```
Puis dans le manifest : `android:fullBackupContent="@xml/backup_rules"`.

---

## 🟠 AVERTISSEMENTS — Recommandés avant soumission (7)

### W1 — ProGuard : règles manquantes pour Three.js / pmtiles
**Fichier :** `android/app/proguard-rules.pro`  
**Risque :** R8 peut stripper des classes Three.js ou des parseurs de tuiles vectorielles → crash silencieux en release.  
**Fix :** Ajouter à `proguard-rules.pro` :
```
-keep class three.** { *; }
-dontwarn three.**
-keep class pmtiles.** { *; }
-dontwarn pmtiles.**
-keep class com.mapbox.** { *; }
-dontwarn com.mapbox.**
```

---

### W2 — PWA Manifest incomplet
**Fichier :** `vite.config.js:73-90`  
**Risque :** Absence de `display`, `orientation` et `background_color` → les utilisateurs n'ont pas d'expérience app-like (pas de fullscreen, flash blanc au démarrage).  
**Fix :** Ajouter dans l'objet manifest :
```js
display: 'standalone',
orientation: 'portrait',
background_color: '#12141c',
```

---

### W3 — Meta tags iOS manquants
**Fichier :** `index.html`  
**Risque :** Safari iOS n'active pas le mode standalone sans ces tags.  
**Fix :** Ajouter dans `<head>` :
```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```

---

### W4 — 11+ blocs `catch` vides (debug difficile post-release)
**Fichiers :** `buildings.ts` (×7) · `hydrology.ts` (×3) · `poi.ts` (×2) · `weather.ts` (×1)  
**Risque :** Les erreurs sont avalées silencieusement. Si un utilisateur rapporte "pas de bâtiments" ou "météo absente", impossible à diagnostiquer. Pas de blocage Play Store mais risque support élevé.  
**Fix minimal :** Ajouter `console.warn('[Module] Failed silently:', e)` dans chaque catch vide. Fix optimal : `showToast()` pour les erreurs visibles de l'utilisateur.

---

### W5 — `setInterval(updateStorageUI, 2000)` sans nettoyage
**Fichier :** `src/modules/ui.ts:67`  
**Risque :** L'intervalle tourne jusqu'à la mort de l'app. Fuite mémoire potentielle si `initUI()` est appelé plusieurs fois (tests, reload).  
**Fix :**
```typescript
let storageUpdateInterval: ReturnType<typeof setInterval>;
// Dans initUI() :
storageUpdateInterval = setInterval(updateStorageUI, 2000);
// Dans disposeScene() ou un cleanup central :
clearInterval(storageUpdateInterval);
```

---

### W6 — Assets icônes dupliquées (5 MB en double)
**Fichier :** `public/assets/icons/icon.png` et `icon_1024.png` — identiques, 2.5 MB chacun  
**Risque :** Gonfle inutilement le bundle web et l'APK. Pas de blocage Play Store.  
**Fix :** Conserver uniquement `icon_1024.png` comme source master, générer les autres avec `npx capacitor-assets generate`. Convertir en WebP (économie ~70%).

---

### W7 — `console.log` non strippés en production
**Fichiers :** `main.ts`, `state.ts`, `tileLoader.ts`, `ui.ts`, `workerManager.ts` — 7 occurrences  
**Risque :** Expose le comportement interne dans les DevTools Android. Pas de données sensibles mais bruit.  
**Fix :** Dans `vite.config.js`, option build :
```js
build: {
  minify: 'terser',
  terserOptions: {
    compress: { drop_console: true, drop_debugger: true }
  }
}
```

---

## 🟡 INFORMATIONS — Pas bloquants (3)

### I1 — `android:largeHeap` non défini
**Risque :** Sur appareils avec peu de RAM (4 GB), le rendu 3D + tiles peut provoquer un OOM. Play Store ne bloque pas, mais le crash rate pourrait être élevé sur Eco/STD tier.  
**Fix optionnel :** Ajouter `android:largeHeap="true"` à `<application>` dans le manifest.

### I2 — `capacitor.config.json` : `appName` avec underscore
**Valeur :** `"suntrail_threejs"` — Le nom affiché est géré par `strings.xml` ("Suntrail 3D"), donc cosmétique seulement.

### I3 — Pas de `engines` dans `package.json`
**Fix :** Ajouter `"engines": { "node": ">=18" }` pour la reproductibilité CI.

---

## ✅ VALIDÉ — Aucune action requise (13 points)

| Domaine | Statut | Détails |
|---|---|---|
| GPS Disclosure | ✅ | `requestGPSDisclosure()` appelé AVANT toute géolocalisation (`ui.ts:142`) |
| Permissions Android | ✅ | 7 permissions, toutes justifiées. Aucune permission inutile. |
| Clés hardcodées | ✅ | Aucune clé/token hardcodé dans le source. La clé MapTiler est user-supplied. |
| Trafic HTTP dans le source | ✅ | Aucune requête HTTP cleartext (seul `http://www.topografix.com/GPX/...` = namespace XML, pas réseau) |
| Keystore exclu de git | ❌ | `.gitignore` contient seulement 4 lignes (`node_modules`, `dist`, `.vscode`, `.DS_Store`). `*.jks`, `*.keystore`, `keystore.properties` **ne sont pas exclus** — risque de commit accidentel. À corriger avant de générer le keystore. |
| SDK Android | ✅ | `minSdk=24`, `compileSdk=36`, `targetSdk=36` — à jour |
| versionCode/versionName | ✅ | `511` / `"5.11.0"` — alignés |
| R8/ProGuard activé | ✅ | `minifyEnabled=true`, `shrinkResources=true` en release |
| Icônes adaptive | ✅ | Toutes densités + `mipmap-anydpi-v26` avec foreground/background |
| `alert()`/`confirm()` | ✅ | Aucun dialog navigateur dans le source |
| TODO/FIXME dans le source | ✅ | Aucun commentaire TODO/FIXME/HACK restant |
| Service Worker / Offline | ✅ | CacheFirst 30j pour MapTiler + Swisstopo, precache assets statiques |
| Store Listing | ✅ | Titre court ≤80 chars ✅ · Description ≤4000 chars ✅ · FR + EN ✅ |

---

## 📋 Checklist finale avant soumission

### Bloquants (Play Store rejection risk)
- [ ] **C1** — Créer `network_security_config.xml` + `android:usesCleartextTraffic="false"`
- [ ] **C4** — `android:allowBackup="false"` ou `backup_rules.xml` avec exclusions
- [ ] **C2/C3** — Décider de la stratégie pour la clé MapTiler et les snapshots GPS
  - *Minimum acceptable :* documenter dans la Privacy Policy que ces données sont locales

### Fortement recommandés
- [ ] **W1** — Règles ProGuard Three.js/pmtiles
- [ ] **W2** — `display`, `orientation`, `background_color` dans le manifest PWA
- [ ] **W3** — Meta tags iOS `apple-mobile-web-app-capable`
- [ ] **W7** — `drop_console: true` dans terser config

### Optionnels
- [ ] **W4** — Ajouter logs minimes dans les catch vides
- [ ] **W5** — Nettoyer l'interval `updateStorageUI`
- [ ] **W6** — Dédupliquer/compresser les icônes
- [ ] **I1** — `android:largeHeap="true"`
- [ ] Sprint 5 Play Console : Data Safety, Content Rating (IARC), Screenshots

---

## Récapitulatif par sévérité

| Sévérité | Nombre | Action |
|---|---|---|
| 🔴 Critique | 4 | Corriger avant soumission |
| 🟠 Avertissement | 7 | Fortement recommandé avant soumission |
| 🟡 Info | 3 | Optionnel |
| ✅ Validé | 13 | Aucune action |
