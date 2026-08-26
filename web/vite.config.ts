import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // En développement, le front tourne sur 5173 et parle au serveur PlanStock sur 4823.
  // En production, Express sert directement web/dist : aucun proxy nécessaire.
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4823' },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
