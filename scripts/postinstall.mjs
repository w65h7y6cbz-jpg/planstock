import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Installe les dépendances du front après celles du serveur.
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webPackage = path.join(rootDir, 'web', 'package.json');

if (!existsSync(webPackage)) {
  console.log('[PlanStock] Front pas encore initialisé : installation du serveur uniquement.');
  process.exit(0);
}

// `npm_config_prefix` pointe vers l'installation globale de npm ; le laisser
// passer ferait installer l'interface au mauvais endroit.
const env = { ...process.env };
delete env.npm_config_prefix;

const options = { cwd: rootDir, stdio: 'inherit', env };
const npmArgs = ['install', '--prefix', 'web'];

/**
 * Relance npm par son propre script JavaScript avec le Node courant.
 * Sous Windows, lancer directement `npm.cmd` depuis Node est refusé depuis
 * Node 18.20 (spawn EINVAL, correctif CVE-2024-27980) : passer par
 * `node npm-cli.js` évite complètement le problème, sans dépendre du shell.
 */
function runViaNodeCli() {
  const npmCli = process.env.npm_execpath;
  if (typeof npmCli !== 'string' || !npmCli.endsWith('.js')) return null;
  return spawnSync(process.execPath, [npmCli, ...npmArgs], options);
}

/** Repli quand npm n'a pas exposé son chemin (appel direct du script). */
function runViaShell() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return spawnSync(npm, npmArgs, { ...options, shell: process.platform === 'win32' });
}

let result = runViaNodeCli();
if (!result || result.error) {
  if (result?.error) {
    console.log(`[PlanStock] Nouvelle tentative via le shell (${result.error.message}).`);
  }
  result = runViaShell();
}

if (result.error) {
  console.error(
    `[PlanStock] Installation de l'interface impossible : ${result.error.message}\n` +
      "            Lancez manuellement : npm --prefix web install",
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
