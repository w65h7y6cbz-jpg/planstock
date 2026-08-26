import { Router } from 'express';
import { isBackupName, listBackups, restoreBackup, runStartupBackup } from '../backup.js';
import { asyncRoute, badRequest, conflict, requireUser } from '../lib/http.js';

/** Copies datées de la base : liste, création à la demande, restauration. */
export function createBackupsRouter(db, backupsDir) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(backupsDir ? listBackups(backupsDir) : []);
  });

  router.post(
    '/',
    asyncRoute(async (req, res) => {
      if (!backupsDir) throw conflict('Aucun dossier de sauvegarde configuré.');
      requireUser(db, req);
      const { file } = await runStartupBackup(db, backupsDir);
      res.status(201).json({ created: file.split(/[\\/]/).pop() });
    }),
  );

  router.post(
    '/:name/restore',
    asyncRoute(async (req, res) => {
      if (!backupsDir) throw conflict('Aucun dossier de sauvegarde configuré.');
      requireUser(db, req);

      const { name } = req.params;
      if (!isBackupName(name)) throw badRequest('Nom de sauvegarde invalide.');

      try {
        res.json(await restoreBackup(db, backupsDir, name));
      } catch (cause) {
        throw conflict(cause instanceof Error ? cause.message : 'Restauration impossible.');
      }
    }),
  );

  return router;
}
