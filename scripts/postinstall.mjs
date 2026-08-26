import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Installe les dépendances du front après celles du serveur.
// Tolérant : tant que web/package.json n'existe pas (avant l'étape 3), on passe.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPackage = path.join(rootDir, 'web', 'package.json');

if (!existsSync(webPackage)) {
  console.log('[PlanStock] Front pas encore initialisé : installation du serveur uniquement.');
  process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['--prefix', 'web', 'install'], { cwd: rootDir, stdio: 'inherit' });
process.exit(result.status ?? 1);
