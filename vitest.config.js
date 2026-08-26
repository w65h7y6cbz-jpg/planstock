import { defineConfig } from 'vitest/config';

// Les tests du serveur uniquement : le front a sa propre configuration dans web/.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.js'],
  },
});
