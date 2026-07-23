import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'sites-worker', 'index.js');
const outputDirectory = path.join(projectRoot, 'dist', 'server');
const output = path.join(outputDirectory, 'index.js');

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, output);
