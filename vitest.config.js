import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

/**
 * Les tests de l'API tournent dans le vrai moteur des Workers, sur une base D1
 * locale — le même SQLite qu'en production. Pas de simulacre : ce qui passe ici
 * passe déployé.
 *
 * Le front a sa propre configuration dans web/.
 */
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      miniflare: {
        // Le schéma est passé aux tests, qui l'appliquent sur une base vierge.
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ['worker/**/*.test.js'],
    setupFiles: ['./worker/__tests__/setup.js'],
  },
});
