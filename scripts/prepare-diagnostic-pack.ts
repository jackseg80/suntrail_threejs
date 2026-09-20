import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve(
    process.argv[2] ??
        path.join('output', 'suntrail-pack-switzerland-sample-v1.pmtiles')
);
const target = path.resolve(
    'public',
    'diagnostic',
    'suntrail-pack-switzerland-sample-v1.pmtiles'
);

if (!fs.existsSync(source)) {
    throw new Error(`Pack diagnostic introuvable: ${source}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);

const hash = crypto
    .createHash('sha256')
    .update(fs.readFileSync(target))
    .digest('hex');
console.log(`Pack diagnostic prêt: ${target}`);
console.log(`SHA-256: ${hash}`);
