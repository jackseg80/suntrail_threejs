import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve('dist');
const htmlFiles = readdirSync(distDir).filter((name) => name.endsWith('.html'));
const failures = [];

for (const htmlFile of htmlFiles) {
    const html = readFileSync(resolve(distDir, htmlFile), 'utf8');
    const references = html.matchAll(/(?:src|href)="([^"]+)"/g);

    for (const [, reference] of references) {
        if (/^(?:https?:|data:|mailto:|#)/.test(reference)) continue;

        if (reference.startsWith('/')) {
            failures.push(`${htmlFile}: URL absolue interdite (${reference})`);
            continue;
        }

        const relativePath = reference.split(/[?#]/, 1)[0].replace(/^\.\//, '');
        if (relativePath && !existsSync(resolve(distDir, relativePath))) {
            failures.push(`${htmlFile}: actif absent (${reference})`);
        }
    }
}

if (failures.length > 0) {
    console.error('Build Capacitor invalide :');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
}

console.log(
    `Build Capacitor valide : ${htmlFiles.length} pages, URLs locales relatives.`
);
