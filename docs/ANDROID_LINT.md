# Avertissements Android exclus

Le lint de l'application ne masque que des faux positifs liés à Capacitor/Cordova :

- `activity_main.xml` et `config.xml` sont recherchés au runtime par le pont Capacitor/Cordova ;
- les variantes `splash.png` sont générées par le pipeline d'assets Capacitor et doivent conserver leurs qualificateurs de densité et d'orientation.

Les avertissements Gradle restants viennent de dépendances tierces : `@capacitor/filesystem` utilise encore les API `libraryVariants`, `testVariants` et `unitTestVariants` héritées. Cela impose temporairement `android.newDsl=false` et `android.builtInKotlin=false`, documentés dans `android/gradle.properties`, jusqu'à une version compatible AGP 10.
