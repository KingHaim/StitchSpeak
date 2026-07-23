import { copyFile, cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildDirectory = path.join(projectRoot, 'dist');
const clientOutputDirectory = path.join(buildDirectory, 'client');
const source = path.join(projectRoot, 'sites-worker', 'index.js');
const outputDirectory = path.join(buildDirectory, 'server');
const output = path.join(outputDirectory, 'index.js');
const wranglerSource = path.join(projectRoot, 'sites-worker', 'wrangler.json');
const wranglerOutput = path.join(outputDirectory, 'wrangler.json');
const hostingSource = path.join(projectRoot, '.openai', 'hosting.json');
const hostingOutputDirectory = path.join(buildDirectory, '.openai');
const hostingOutput = path.join(hostingOutputDirectory, 'hosting.json');

await mkdir(clientOutputDirectory, { recursive: true });
const buildEntries = await readdir(buildDirectory, { withFileTypes: true });
for (const entry of buildEntries) {
  if (entry.name === 'client' || entry.name === 'server' || entry.name === '.openai') continue;
  await cp(
    path.join(buildDirectory, entry.name),
    path.join(clientOutputDirectory, entry.name),
    { recursive: true },
  );
}

await mkdir(outputDirectory, { recursive: true });
await copyFile(source, output);
await copyFile(wranglerSource, wranglerOutput);
await mkdir(hostingOutputDirectory, { recursive: true });
await copyFile(hostingSource, hostingOutput);
