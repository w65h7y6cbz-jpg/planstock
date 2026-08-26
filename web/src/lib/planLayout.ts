/**
 * Placement automatique des rectangles de rayonnage sur la vue de dessus.
 *
 * Utilisé par l'assistant de l'inventaire initial : les rayonnages sont
 * disposés en grille, sans chevauchement et dans les limites du plan.
 * L'utilisateur les repositionne ensuite à leur vraie place par glisser-déposer.
 */

export interface RackGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MARGIN_X = 6;
const MARGIN_Y = 6;
const GAP_X = 4;
const GAP_Y = 6;
const MAX_COLUMNS = 4;
const MAX_HEIGHT = 18;

const round = (value: number) => Math.round(value * 100) / 100;

export function layoutRacks(count: number): RackGeometry[] {
  if (count <= 0) return [];

  const columns = Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / columns);

  const width = (100 - 2 * MARGIN_X - (columns - 1) * GAP_X) / columns;
  const height = Math.min((100 - 2 * MARGIN_Y - (rows - 1) * GAP_Y) / rows, MAX_HEIGHT);

  return Array.from({ length: count }, (_, index) => ({
    x: round(MARGIN_X + (index % columns) * (width + GAP_X)),
    y: round(MARGIN_Y + Math.floor(index / columns) * (height + GAP_Y)),
    width: round(width),
    height: round(height),
  }));
}
