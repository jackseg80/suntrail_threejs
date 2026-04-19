import os
path = 'android/app/build.gradle'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Suppression de TOUS les backslashes avant les guillemets (nettoyage global)
new_content = content.replace('\\"', '"')

# Mise à jour vers v5.32.19 / 735 pour repartir sur une base saine
new_content = new_content.replace('versionCode 734', 'versionCode 735')
new_content = new_content.replace('versionName "5.32.18"', 'versionName "5.32.19"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Clean fix applied for v5.32.19")
