import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = 'dist';
const MIB = 1024 * 1024;
const limits = {
    application: 300 * 1024,
    thirdParty: 800 * 1024,
    precache: 2.5 * MIB,
};

if (!existsSync(DIST)) {
    throw new Error(
        'Build output missing: run `npm run build` before `npm run check:bundle`.'
    );
}

function listFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? listFiles(path) : [path];
    });
}

const files = listFiles(DIST);
const failures = [];
for (const file of files.filter((path) => path.endsWith('.js'))) {
    const name = relative(DIST, file).replaceAll('\\', '/');
    const size = statSync(file).size;
    const isConstrainedThirdParty =
        /(^|\/)(three|Purchases(?:\.es)?)-[^/]+\.js$/.test(name);
    const limit = isConstrainedThirdParty
        ? limits.thirdParty
        : limits.application;
    if (size > limit) {
        failures.push(
            `${name}: ${(size / 1024).toFixed(1)} KiB exceeds ${(limit / 1024).toFixed(0)} KiB`
        );
    }
}

const sw = join(DIST, 'sw.js');
if (!existsSync(sw)) {
    failures.push(
        'dist/sw.js is missing; the PWA service worker was not generated.'
    );
} else {
    const serviceWorker = readFileSync(sw, 'utf8');
    const precacheCall = serviceWorker.indexOf('precacheAndRoute');
    const manifestStart = serviceWorker.indexOf('[', precacheCall);
    const manifestEnd = serviceWorker.indexOf('],', manifestStart) + 1;
    if (manifestStart < 0 || manifestEnd === 0) {
        failures.push(
            'Could not find the Workbox precache manifest in dist/sw.js.'
        );
    }
    const manifest = serviceWorker.slice(manifestStart, manifestEnd);
    const urls = [...manifest.matchAll(/url:["']([^"']+)["']/g)].map(
        (match) => match[1]
    );
    const precacheBytes = urls.reduce((sum, url) => {
        const asset = join(DIST, url.replace(/^\.\//, '').replace(/^\//, ''));
        return sum + (existsSync(asset) ? statSync(asset).size : 0);
    }, 0);
    if (precacheBytes > limits.precache) {
        failures.push(
            `PWA precache: ${(precacheBytes / MIB).toFixed(2)} MiB exceeds 2.50 MiB`
        );
    }
    console.log(`PWA precache: ${(precacheBytes / MIB).toFixed(2)} MiB`);
}

if (failures.length) {
    throw new Error(`Bundle budget failed:\n${failures.join('\n')}`);
}

console.log('Bundle budget passed.');
