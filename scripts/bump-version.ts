import * as fs from 'fs';
import * as path from 'path';

/**
 * Script d'automatisation du versioning (v5.28.0)
 * Synchronise package.json et android/app/build.gradle
 */

const PACKAGE_JSON_PATH = path.join(process.cwd(), 'package.json');
const BUILD_GRADLE_PATH = path.join(process.cwd(), 'android', 'app', 'build.gradle');

function bump() {
    const args = process.argv.slice(2);
    const type = args[0] || 'patch'; // patch, minor, major

    if (!fs.existsSync(PACKAGE_JSON_PATH)) {
        console.error('package.json not found');
        process.exit(1);
    }

    // 1. Lire package.json
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const oldVersion = pkg.version;
    const parts = oldVersion.split('.').map(Number);

    if (type === 'major') parts[0]++;
    else if (type === 'minor') parts[1]++;
    else parts[2]++;

    if (type === 'major' || type === 'minor') parts[2] = 0;
    if (type === 'major') parts[1] = 0;

    const newVersion = parts.join('.');
    pkg.version = newVersion;

    // 2. Mettre à jour android/app/build.gradle
    if (fs.existsSync(BUILD_GRADLE_PATH)) {
        let gradle = fs.readFileSync(BUILD_GRADLE_PATH, 'utf8');
        
        // Bump versionCode (incrément simple)
        gradle = gradle.replace(/versionCode\s+(\d+)/, (match, code) => {
            const newCode = parseInt(code) + 1;
            console.log(`Bumping versionCode: ${code} -> ${newCode}`);
            return `versionCode ${newCode}`;
        });

        // Update versionName
        gradle = gradle.replace(/versionName\s+"[^"]+"/, () => {
            console.log(`Updating versionName: ${newVersion}`);
            return `versionName "${newVersion}"`;
        });

        fs.writeFileSync(BUILD_GRADLE_PATH, gradle);
    } else {
        console.warn('build.gradle not found, skipping Android bump');
    }

    // 3. Sauvegarder package.json
    fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Version bumped: ${oldVersion} -> ${newVersion}`);
}

bump();
