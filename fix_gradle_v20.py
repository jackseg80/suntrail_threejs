import os
path = 'android/app/build.gradle'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# On s'assure que le contenu est propre (pas de backslashes avant les guillemets)
content = content.replace('\\"', '"')

# Update to v5.32.20 / 736
content = content.replace('versionCode 735', 'versionCode 736')
content = content.replace('versionName "5.32.19"', 'versionName "5.32.20"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated to v5.32.20")
