/**
 * upload-to-r2.ts
 *
 * Upload un fichier volumineux vers Cloudflare R2 via @aws-sdk/client-s3.
 * Contourne la limite de 300 MB de wrangler/dashboard via multipart upload.
 *
 * Setup (une seule fois) :
 *   1. Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token
 *      - Permissions : Object Read & Write
 *      - Bucket : suntrail-packs
 *   2. Copier Account ID, Access Key ID, Secret Access Key
 *   3. Ajouter dans .env :
 *      R2_ACCOUNT_ID=xxx
 *      R2_ACCESS_KEY_ID=xxx
 *      R2_SECRET_ACCESS_KEY=xxx
 *
 * Usage :
 *   npx tsx scripts/upload-to-r2.ts --file output/suntrail-pack-switzerland-v1.pmtiles --key packs/suntrail-pack-switzerland-v1.pmtiles
 */

import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import 'dotenv/config';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID ?? '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID ?? '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY ?? '';
const BUCKET = 'suntrail-packs';

async function main() {
    const fileArg = process.argv.find((_, i, arr) => arr[i - 1] === '--file');
    const keyArg = process.argv.find((_, i, arr) => arr[i - 1] === '--key');

    if (!fileArg || !keyArg) {
        console.error('Usage: npx tsx scripts/upload-to-r2.ts --file <path> --key <r2-key>');
        process.exit(1);
    }

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
        console.error('Variables manquantes dans .env : R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
        console.error('');
        console.error('Setup :');
        console.error('  1. Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token');
        console.error('  2. Copier Account ID + Access Key ID + Secret Access Key');
        console.error('  3. Ajouter dans .env :');
        console.error('     R2_ACCOUNT_ID=xxx');
        console.error('     R2_ACCESS_KEY_ID=xxx');
        console.error('     R2_SECRET_ACCESS_KEY=xxx');
        process.exit(1);
    }

    const filePath = path.resolve(fileArg);
    const fileSize = fs.statSync(filePath).size;

    console.log(`Upload : ${filePath}`);
    console.log(`Destination : ${BUCKET}/${keyArg}`);
    console.log(`Taille : ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
    console.log();

    const client = new S3Client({
        region: 'auto',
        endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    });

    const stream = fs.createReadStream(filePath);

    const upload = new Upload({
        client,
        params: {
            Bucket: BUCKET,
            Key: keyArg,
            Body: stream,
            ContentType: 'application/octet-stream',
        },
        // 100 MB per part, 4 concurrent uploads
        partSize: 100 * 1024 * 1024,
        queueSize: 4,
    });

    upload.on('httpUploadProgress', (progress) => {
        if (progress.loaded && fileSize) {
            const pct = ((progress.loaded / fileSize) * 100).toFixed(1);
            const mb = (progress.loaded / 1024 / 1024).toFixed(0);
            process.stdout.write(`\r  ${mb} / ${(fileSize / 1024 / 1024).toFixed(0)} MB (${pct}%)`);
        }
    });

    await upload.done();
    console.log(`\n\n✓ Upload terminé : ${BUCKET}/${keyArg}`);
}

main().catch(e => {
    console.error('ERREUR:', e);
    process.exit(1);
});
