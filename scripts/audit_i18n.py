import os
import re
import json

def get_keys_from_json(data, prefix=''):
    keys = set()
    for k, v in data.items():
        new_key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            keys.update(get_keys_from_json(v, new_key))
        else:
            keys.add(new_key)
    return keys

def audit_i18n():
    src_dir = 'src'
    locales_dir = os.path.join(src_dir, 'i18n', 'locales')
    languages = ['fr', 'en', 'de', 'it']
    
    # 1. Extract keys from TypeScript files
    used_keys = set()
    # Patterns for i18n.t('key') and data-i18n="key"
    t_pattern = re.compile(r"i18n\.t\(\s*['\"]([^'\"]+)['\"]")
    attr_pattern = re.compile(r"data-i18n=['\"]([^'\"]+)['\"]")
    
    # Also handle dynamic keys like i18n.t(`nav.tab.${tabId}`)
    # These are hard to audit statically, so we'll just note them.
    dynamic_patterns = re.compile(r"i18n\.t\(\s*[`]([^`]+)[`]")

    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.ts'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    used_keys.update(t_pattern.findall(content))
                    used_keys.update(attr_pattern.findall(content))
                    # For simple template literals without variables, we can still extract
                    # but if they have ${}, we'll have to be careful.
                    # We'll just look for the static parts.

    # 2. Load keys from JSON files
    locale_keys = {}
    for lang in languages:
        path = os.path.join(locales_dir, f"{lang}.json")
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            locale_keys[lang] = get_keys_from_json(data)

    # 3. Compare
    all_locale_keys = set()
    for lang in languages:
        all_locale_keys.update(locale_keys[lang])

    missing_in_locales = {}
    for lang in languages:
        missing = [k for k in used_keys if k not in locale_keys[lang] and '${' not in k]
        if missing:
            missing_in_locales[lang] = missing

    unused_keys = {}
    for lang in languages:
        # A key is unused if it's in the JSON but not found in any TS file
        # Note: some keys might be constructed dynamically, e.g. `search.filter.${key}`
        # We need to be careful about false positives.
        unused = []
        for k in locale_keys[lang]:
            # Simple check: if k is not in used_keys and not matched by any dynamic pattern
            if k not in used_keys:
                # Check if it might be part of a dynamic key
                # e.g. search.filter.all might be used via i18n.t(`search.filter.${key}`)
                is_dynamic = False
                # This is a bit complex, let's just flag them for now.
                unused.append(k)
        if unused:
            unused_keys[lang] = unused

    # Report
    print("--- i18n Audit Report ---")
    for lang in languages:
        print(f"\nLanguage: {lang}")
        missing = missing_in_locales.get(lang, [])
        if missing:
            print(f"  Missing keys ({len(missing)}):")
            for k in sorted(missing):
                print(f"    - {k}")
        else:
            print("  No missing keys found (static).")
            
    # For unused keys, we'll be more conservative in the report
    print("\nPotential unused keys (may be used dynamically):")
    # Just show keys that are missing from ALL languages? No, that doesn't make sense.
    # Show keys that are in JSON but not explicitly in code.
    common_unused = set(unused_keys.get('en', []))
    for lang in languages:
        common_unused.intersection_update(unused_keys.get(lang, []))
    
    if common_unused:
        print(f"  Keys in all JSONs but not found in code ({len(common_unused)}):")
        for k in sorted(common_unused):
            # Filter out known dynamic patterns
            if any(k.startswith(p) for p in ['search.filter.', 'search.type.', 'nav.tab.', 'inclinometer.directions.', 'inclinometer.danger.']):
                continue
            print(f"    - {k}")

if __name__ == "__main__":
    audit_i18n()
