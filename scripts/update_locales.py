import json
import os

updates = {
    'en': {
        'track.toast.exportError': 'GPX export error',
        'weather.aria.close': 'Close weather'
    },
    'de': {
        'track.toast.exportError': 'GPX-Exportfehler',
        'weather.aria.close': 'Wetter schließen'
    },
    'it': {
        'track.toast.exportError': 'Errore esportazione GPX',
        'weather.aria.close': 'Chiudi meteo'
    }
}

def update_json(lang, data):
    path = f'src/i18n/locales/{lang}.json'
    with open(path, 'r', encoding='utf-8') as f:
        content = json.load(f)
    
    # Update track.toast.exportError
    if 'track' in content and 'toast' in content['track']:
        content['track']['toast']['exportError'] = data['track.toast.exportError']
    
    # Update weather.aria.close
    if 'weather' in content:
        if 'aria' not in content['weather']:
            content['weather']['aria'] = {}
        content['weather']['aria']['close'] = data['weather.aria.close']
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(content, f, ensure_ascii=False, indent=2)

for lang, data in updates.items():
    update_json(lang, data)
    print(f"Updated {lang}.json")
