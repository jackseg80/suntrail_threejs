# Avertissements Android exclus

Le lint de l'application ne masque que des faux positifs liés à Capacitor/Cordova :

- `activity_main.xml` et `config.xml` sont recherchés au runtime par le pont Capacitor/Cordova ;
- les variantes `splash.png` sont générées par le pipeline d'assets Capacitor et doivent conserver leurs qualificateurs de densité et d'orientation.

Les avertissements Gradle restants viennent de dépendances tierces : `@capacitor/filesystem` utilise encore les API `libraryVariants`, `testVariants` et `unitTestVariants` héritées. Cela impose temporairement `android.newDsl=false` et `android.builtInKotlin=false`, documentés dans `android/gradle.properties`, jusqu'à une version compatible AGP 10.

## Android 15/16 edge-to-edge et cutout (v5.86.1)

- `targetSdk 36` impose l'edge-to-edge. `MainActivity` conserve uniquement le masquage de la barre
  de statut ; il n'appelle ni `enableEdgeToEdge()`, ni opt-out, ni surcharge cutout.
- Capacitor 8 transmet `systemBars | displayCutout` à la WebView. Avec `viewport-fit=cover`, les
  WebView modernes exposent `env(safe-area-inset-*)`; Capacitor injecte aussi les quatre variables
  `--safe-area-inset-*` et protège nativement les WebView plus anciennes ainsi que l'IME.
- Les tokens SunTrail `--safe-top/right/bottom/left` prennent le maximum des deux sources. Ils ne
  doivent pas être additionnés, sous peine de créer une double marge.
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` vient des ressources fusionnées
  `androidx.core:core-splashscreen:1.2.0` en `values-v27` et `values-v29`; `values-v30` utilise
  `always`. Le thème actif de `MainActivity` ne fixe pas cette valeur. Après réduction des
  ressources, l'AAB v5.86.1 ne contient plus la chaîne `shortEdges` dans `base/resources.pb` ;
  `always` reste présent. Ne pas ajouter de surcharge manifeste/thème pour ce diagnostic.

Preuve physique partielle v5.86.1 : un Galaxy S23 `SM-S911B` sous Android 16/API 36 affiche la
WebView sur toute la fenêtre, avec barre de statut immersive et cutout de 98 px. Les contrôles
restent hors cutout en portrait et paysage. Le mode gestes réserve 39 px en bas ; le mode trois
boutons, activé temporairement puis restauré, réserve 126 px. Avec le clavier Samsung, l'IME expose
991 px et la feuille Exploration se redimensionne sans masquer le champ ni la navigation.

## R8 release (v5.86.1)

Les points d'entrée Activity/Service sont gardés par le manifeste, Room et Gson par leurs règles
consumer, et les plugins Capacitor par `@CapacitorPlugin`/`@PluginMethod` et les règles consumer du
bridge. `android/app/proguard-rules.pro` ne conserve que les attributs source/ligne. Toute nouvelle
règle `-keep` doit cibler la classe ou le membre réellement réfléchi et être justifiée par un échec
release, `missing_rules.txt` ou l'inspection de `mapping.txt`, `seeds.txt` et `usage.txt`.

Preuve v5.86.1 : `bundleRelease` passe avec R8 9.2.14, sans règle ciblée supplémentaire. Les taux
R8 passent de 84,29 % à 61,42 % non rétréci, de 84,31 % à 61,93 % non optimisé et de 84,29 % à
61,35 % non obfusqué. `MainActivity`, `TrackingActivity`, `RecordingService`, `RecordingPlugin` et
`AppDatabase_Impl` restent présents dans les sorties R8. Les avertissements R8 restants portent
sur les tables de pile du SDK tiers Amazon Appstore 3.0.5 apporté par RevenueCat.
