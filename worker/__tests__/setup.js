import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeEach } from 'vitest';

/**
 * Chaque test part d'un PlanStock neuf : ses deux locaux, et rien d'autre.
 *
 * Le pool ne remet plus la base en état tout seul entre les tests depuis sa
 * version 0.22 — on la reconstruit donc ici. Les tables sont supprimées des
 * enfants vers les parents, ce qui évite d'avoir à désactiver les clés
 * étrangères.
 */
const TABLES_CHILDREN_FIRST = [
  'd1_migrations',
  'movements',
  'item_locations',
  'items',
  // Avant `customers` et `users` : il référence les deux.
  'user_customers',
  'customers',
  'landmarks',
  'shelves',
  'racks',
  'users',
  'sites',
  'settings',
  'app_secrets',
];

beforeEach(async () => {
  for (const table of TABLES_CHILDREN_FIRST) {
    await env.DB.prepare(`DROP TABLE IF EXISTS "${table}"`).run();
  }
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
