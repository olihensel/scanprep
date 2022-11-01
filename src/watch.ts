import { existsSync, readFileSync, writeFileSync } from 'fs';
import { readdir } from 'fs/promises';
import { join, relative, resolve } from 'path';
import { rebundlePdf } from './split';
function ensureEnv(env: string): string {
  const envVar = process.env[env];
  if (!envVar) {
    throw new Error('Environment variable not set');
  }
  return envVar;
}

const WATCH_DIR = ensureEnv('WATCH_DIR');
const OUT_DIR = ensureEnv('OUT_DIR');
const knownFilesFilename = join(OUT_DIR, process.env.KNOWN_FILES_FILE || 'known-files.json');
if (!existsSync(WATCH_DIR)) {
  throw new Error('Watch directory does not exist');
}
if (!existsSync(OUT_DIR)) {
  throw new Error('Output directory does not exist');
}

let knownFiles: string[] = [];

try {
  knownFiles = JSON.parse(readFileSync(knownFilesFilename, 'utf8'));
} catch (e) {}
function writeKnownFiles() {
  const knownFilesJson = JSON.stringify(knownFiles);
  writeFileSync(knownFilesFilename, knownFilesJson);
}
async function asyncDelay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function getFilesRecursive(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = resolve(dir, dirent.name);
      return dirent.isDirectory() ? await getFilesRecursive(res) : res;
    }),
  );
  return Array.prototype.concat(...files);
}
async function main() {
  while (true) {
    try {
      const files = await getFilesRecursive(WATCH_DIR);
      const relativePaths = files.map((f) => relative(WATCH_DIR, f));

      const newFiles = relativePaths.filter((f) => f.endsWith('/done') && !knownFiles.includes(f));
      if (newFiles.length > 0) {
        console.log(`New files: ${newFiles.join(', ')}`);
        for (const file of newFiles) {
          try {
            await rebundlePdf(WATCH_DIR, OUT_DIR, file);
          } catch (e2: any) {
            console.log(`Failed to split ${file}`, e2);
            writeFileSync(join(WATCH_DIR, file + '.err'), `${file}\n${e2?.toString()}`);
          }
        }
        knownFiles = knownFiles.concat(newFiles);
        writeKnownFiles();
      }
    } catch (e) {
      console.log(e);
    }
    await asyncDelay(process.env.POLL_INTERVAL_MS ? parseInt(process.env.POLL_INTERVAL_MS) : 60000);
  }
}
main();
