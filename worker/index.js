import { app } from './app.js';

/**
 * Point d'entrée du Worker. Cloudflare sert d'abord l'interface compilée
 * (web/dist) ; seules les requêtes `/api/*` arrivent ici.
 */
export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
};
