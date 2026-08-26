import { Router } from 'express';
import { listBackups } from '../backup.js';

/** Liste des copies datées de la base (la restauration arrive à l'étape 8). */
export function createBackupsRouter(backupsDir) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(backupsDir ? listBackups(backupsDir) : []);
  });

  return router;
}
