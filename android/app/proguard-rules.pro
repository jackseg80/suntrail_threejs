# Les points d'entrée Android (Activity/Service), Room et les plugins Capacitor
# sont couverts par le manifeste et les règles consumer de leurs dépendances.
# Ne pas réintroduire de -keep global : ajouter seulement une règle ciblée,
# justifiée par un échec release ou une sortie R8 inspectée.

# Crash reports lisibles (stack traces avec numéros de ligne).
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
