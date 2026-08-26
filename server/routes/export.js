import { Router } from 'express';
import ExcelJS from 'exceljs';
import { asyncRoute } from '../lib/http.js';
import { listItems } from '../lib/store.js';

const HEADERS = [
  'Référence',
  'Désignation',
  'Famille',
  'Libellé famille',
  'Type',
  'Local',
  'Emplacement',
  'Côté',
];

const KIND_LABELS = {
  physical: 'Physique',
  service: 'Service',
  other_site: 'Hors PlanStock',
};

const SIDE_LABELS = { left: 'Gauche', center: 'Centre', right: 'Droite' };

/** Une ligne par article ; les emplacements multiples sont joints par « + ». */
function exportRows(db, siteId = null) {
  const join = (values) => [...new Set(values.filter(Boolean))].join(' + ');

  return listItems(db, { siteId }).map((item) => [
    item.reference_display,
    item.designation,
    item.family_code ?? '',
    item.family_label ?? '',
    KIND_LABELS[item.kind] ?? item.kind,
    join(item.locations.map((location) => location.site_name)),
    item.locations.map((location) => location.code).join(' + '),
    join(item.locations.map((location) => SIDE_LABELS[location.side])),
  ]);
}

/** `?site_id=` limite l'export au local demandé. */
function readSiteId(req) {
  const siteId = Number(req.query.site_id);
  return Number.isInteger(siteId) && siteId > 0 ? siteId : null;
}

function fileStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Échappement CSV : guillemets doublés, champ cité si nécessaire. */
function csvCell(value) {
  const text = String(value ?? '');
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createExportRouter(db) {
  const router = Router();

  router.get('/csv', (req, res) => {
    const lines = [HEADERS, ...exportRows(db, readSiteId(req))]
      .map((row) => row.map(csvCell).join(';'))
      .join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="planstock-${fileStamp()}.csv"`,
    );
    // BOM UTF-8 : sans lui, Excel en français affiche mal les accents.
    res.send(`﻿${lines}\r\n`);
  });

  router.get(
    '/xlsx',
    asyncRoute(async (req, res) => {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'PlanStock';
      const sheet = workbook.addWorksheet('Articles');

      sheet.addRow(HEADERS);
      sheet.getRow(1).font = { bold: true };
      for (const row of exportRows(db, readSiteId(req))) sheet.addRow(row);

      sheet.columns = [
        { width: 18 },
        { width: 46 },
        { width: 10 },
        { width: 34 },
        { width: 16 },
        { width: 16 },
        { width: 16 },
        { width: 10 },
      ];
      sheet.autoFilter = { from: 'A1', to: 'H1' };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="planstock-${fileStamp()}.xlsx"`,
      );
      res.send(Buffer.from(buffer));
    }),
  );

  return router;
}

export { HEADERS, KIND_LABELS };
