import os
path = 'android/app/build.gradle'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('\\"', '"') # Safety
content = content.replace('versionCode 736', 'versionCode 737')
content = content.replace('versionName "5.32.20"', 'versionName "5.32.21"')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated to v5.32.21")
