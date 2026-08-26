import { Router } from 'express';
import ExcelJS from 'exceljs';
import { asyncRoute } from '../lib/http.js';
import { listItems } from '../lib/store.js';

const HEADERS = ['Référence', 'Désignation', 'Type', 'Emplacement'];

const KIND_LABELS = {
  physical: 'Physique',
  service: 'Service',
  other_site: 'Autre site',
};

/** Une ligne par article ; les emplacements multiples sont joints par « + ». */
function exportRows(db) {
  return listItems(db).map((item) => [
    item.reference_display,
    item.designation,
    KIND_LABELS[item.kind] ?? item.kind,
    item.locations.map((location) => location.code).join(' + '),
  ]);
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
    const lines = [HEADERS, ...exportRows(db)]
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
      for (const row of exportRows(db)) sheet.addRow(row);

      sheet.columns = [{ width: 18 }, { width: 46 }, { width: 14 }, { width: 16 }];
      sheet.autoFilter = { from: 'A1', to: 'D1' };

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
