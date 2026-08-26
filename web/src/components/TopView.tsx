import { useEffect, useRef, useState } from 'react';
import type { RackHighlight } from '../lib/picklist';
import type { Rack } from '../types';
import styles from './TopView.module.css';

export interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TopViewProps {
  racks: Rack[];
  planWidth?: number;
  planHeight?: number;
  selectedRackId?: number | null;
  /** Rayonnages et zones concernés par la liste : identifiant → compteurs. */
  highlight?: Map<number, RackHighlight>;
  onSelectRack?: (rack: Rack) => void;
  /** Autorise le déplacement et le redimensionnement des rectangles. */
  editable?: boolean;
  onGeometryCommit?: (rackId: number, geometry: Geometry) => void;
}

const MIN_SIZE = 3;
const HANDLE_SIZE = 2.6;
/** Distance en unités de plan sous laquelle deux bords se collent. */
const SNAP_DISTANCE = 1.2;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;

interface DragState {
  rackId: number;
  mode: 'move' | 'resize';
  originX: number;
  originY: number;
  start: Geometry;
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Colle un bord au bord voisin le plus proche (rayonnages dos à dos, alignement
 * sur une allée). `candidates` liste les positions de référence.
 */
function snap(value: number, candidates: number[]): number {
  let best = value;
  let distance = SNAP_DISTANCE;
  for (const candidate of candidates) {
    const gap = Math.abs(candidate - value);
    if (gap < distance) {
      distance = gap;
      best = candidate;
    }
  }
  return best;
}

export function TopView({
  racks,
  planWidth = 100,
  planHeight = 100,
  selectedRackId = null,
  highlight,
  onSelectRack,
  editable = false,
  onGeometryCommit,
}: TopViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<(Geometry & { rackId: number }) | null>(null);
  const [hovered, setHovered] = useState<{ rack: Rack; x: number; y: number } | null>(null);

  const base: ViewBox = { x: -1, y: -1, width: planWidth + 2, height: planHeight + 2 };
  const [view, setView] = useState<ViewBox>(base);
  const [panning, setPanning] = useState<{ x: number; y: number; view: ViewBox } | null>(null);

  // Un changement de proportions du local remet la vue à plat.
  useEffect(() => {
    setView({ x: -1, y: -1, width: planWidth + 2, height: planHeight + 2 });
  }, [planWidth, planHeight]);

  /** Convertit les coordonnées écran en unités du plan (0-100). */
  function toPlanUnits(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function geometryOf(rack: Rack): Geometry {
    if (draft && draft.rackId === rack.id) {
      return { x: draft.x, y: draft.y, width: draft.width, height: draft.height };
    }
    return { x: rack.x, y: rack.y, width: rack.width, height: rack.height };
  }

  function startDrag(event: React.PointerEvent<SVGElement>, rack: Rack, mode: DragState['mode']) {
    if (!editable) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = toPlanUnits(event.clientX, event.clientY);
    setDrag({ rackId: rack.id, mode, originX: origin.x, originY: origin.y, start: geometryOf(rack) });
    setHovered(null);
  }

  function onPointerMove(event: React.PointerEvent<SVGElement>) {
    if (panning) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const scaleX = panning.view.width / rect.width;
      const scaleY = panning.view.height / rect.height;
      setView({
        ...panning.view,
        x: panning.view.x - (event.clientX - panning.x) * scaleX,
        y: panning.view.y - (event.clientY - panning.y) * scaleY,
      });
      return;
    }

    if (!drag) return;
    const current = toPlanUnits(event.clientX, event.clientY);
    const dx = current.x - drag.originX;
    const dy = current.y - drag.originY;

    // Bords des autres rectangles, pour le magnétisme.
    const others = racks.filter((rack) => rack.id !== drag.rackId);
    const xEdges = [0, planWidth, ...others.flatMap((rack) => [rack.x, rack.x + rack.width])];
    const yEdges = [0, planHeight, ...others.flatMap((rack) => [rack.y, rack.y + rack.height])];

    let next: Geometry;
    if (drag.mode === 'move') {
      const rawX = clamp(drag.start.x + dx, 0, planWidth - drag.start.width);
      const rawY = clamp(drag.start.y + dy, 0, planHeight - drag.start.height);
      // On colle soit le bord gauche, soit le bord droit, selon le plus proche.
      const snappedLeft = snap(rawX, xEdges);
      const snappedRight = snap(rawX + drag.start.width, xEdges) - drag.start.width;
      const snappedTop = snap(rawY, yEdges);
      const snappedBottom = snap(rawY + drag.start.height, yEdges) - drag.start.height;

      next = {
        x: Math.abs(snappedLeft - rawX) <= Math.abs(snappedRight - rawX) ? snappedLeft : snappedRight,
        y: Math.abs(snappedTop - rawY) <= Math.abs(snappedBottom - rawY) ? snappedTop : snappedBottom,
        width: drag.start.width,
        height: drag.start.height,
      };
      next.x = clamp(next.x, 0, planWidth - next.width);
      next.y = clamp(next.y, 0, planHeight - next.height);
    } else {
      const right = snap(clamp(drag.start.x + drag.start.width + dx, drag.start.x + MIN_SIZE, planWidth), xEdges);
      const bottom = snap(clamp(drag.start.y + drag.start.height + dy, drag.start.y + MIN_SIZE, planHeight), yEdges);
      next = {
        x: drag.start.x,
        y: drag.start.y,
        width: Math.max(MIN_SIZE, right - drag.start.x),
        height: Math.max(MIN_SIZE, bottom - drag.start.y),
      };
    }

    setDraft({ rackId: drag.rackId, ...next });
  }

  function endDrag(event: React.PointerEvent<SVGElement>) {
    if (panning) setPanning(null);
    if (!drag) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (draft && draft.rackId === drag.rackId) {
      onGeometryCommit?.(drag.rackId, {
        x: round(draft.x),
        y: round(draft.y),
        width: round(draft.width),
        height: round(draft.height),
      });
    }
    setDrag(null);
    setDraft(null);
  }

  /** Zoom molette centré sur le curseur. */
  function onWheel(event: React.WheelEvent<SVGSVGElement>) {
    if (racks.length === 0) return;
    const pointer = toPlanUnits(event.clientX, event.clientY);
    const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;

    const width = clamp(view.width * factor, base.width / MAX_ZOOM, base.width / MIN_ZOOM);
    const height = width * (base.height / base.width);

    setView({
      width,
      height,
      x: pointer.x - ((pointer.x - view.x) * width) / view.width,
      y: pointer.y - ((pointer.y - view.y) * height) / view.height,
    });
  }

  const zoomed =
    Math.abs(view.width - base.width) > 0.01 ||
    Math.abs(view.x - base.x) > 0.01 ||
    Math.abs(view.y - base.y) > 0.01;

  /** Déplacement au clavier : flèches (1 %), Maj + flèches (5 %). */
  function onKeyDown(event: React.KeyboardEvent<SVGGElement>, rack: Rack) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectRack?.(rack);
      return;
    }
    if (!editable) return;

    const step = event.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    const geometry = geometryOf(rack);
    onGeometryCommit?.(rack.id, {
      ...geometry,
      x: round(clamp(geometry.x + move[0], 0, planWidth - geometry.width)),
      y: round(clamp(geometry.y + move[1], 0, planHeight - geometry.height)),
    });
  }

  if (racks.length === 0) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.empty}>
          <span>Aucun emplacement sur le plan.</span>
          <span>Ajoutez un rayonnage ou une zone depuis Paramètres → Plan.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <svg
        ref={svgRef}
        className={`${styles.svg} ${panning ? styles.svgPanning : ''}`}
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Vue de dessus du local"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={() => setPanning(null)}
        onWheel={onWheel}
      >
        {/* Le fond de la pièce sert aussi de poignée de déplacement de la vue. */}
        <rect
          className={styles.room}
          x={0}
          y={0}
          width={planWidth}
          height={planHeight}
          rx={1.5}
          onPointerDown={(event) => {
            setPanning({ x: event.clientX, y: event.clientY, view });
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={() => setPanning(null)}
        />

        {racks.map((rack) => {
          const geometry = geometryOf(rack);
          const marks = highlight?.get(rack.id);
          const pending = marks?.pending ?? 0;
          const done = marks?.done ?? 0;
          const badgeCount = pending > 0 ? pending : done;
          const centerX = geometry.x + geometry.width / 2;
          const centerY = geometry.y + geometry.height / 2;

          const classes = [
            styles.rack,
            rack.is_zone ? styles.zone : '',
            editable ? styles.rackEditable : '',
            drag?.rackId === rack.id ? styles.rackDragging : '',
            selectedRackId === rack.id ? styles.rackSelected : '',
            pending > 0 ? styles.rackLit : '',
            pending === 0 && done > 0 ? styles.rackDone : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <g
              key={rack.id}
              className={classes}
              transform={rack.rotation === 90 ? `rotate(90 ${centerX} ${centerY})` : undefined}
              tabIndex={0}
              role="button"
              aria-label={`${rack.rack_code} ${rack.label || 'sans libellé'}${
                rack.aisle ? `, ${rack.aisle}` : ''
              }${pending > 0 ? `, ${pending} article(s) à préparer` : ''}${
                pending === 0 && done > 0 ? `, ${done} article(s) validé(s)` : ''
              }`}
              onKeyDown={(event) => onKeyDown(event, rack)}
              onPointerDown={(event) => startDrag(event, rack, 'move')}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => !drag && onSelectRack?.(rack)}
              onPointerEnter={(event) =>
                !drag && !panning && setHovered({ rack, x: event.clientX, y: event.clientY })
              }
              onPointerLeave={() => setHovered(null)}
            >
              <clipPath id={`rack-clip-${rack.id}`}>
                <rect
                  x={geometry.x}
                  y={geometry.y}
                  width={geometry.width}
                  height={geometry.height}
                  rx={1}
                />
              </clipPath>

              <rect
                className={styles.rackBody}
                x={geometry.x}
                y={geometry.y}
                width={geometry.width}
                height={geometry.height}
                rx={1}
              />

              <g clipPath={`url(#rack-clip-${rack.id})`}>
                {/* L'allée est alignée à droite, sur la ligne du code : elle ne
                    croise ni le code, ni le libellé, ni le badge en haut. */}
                {rack.aisle ? (
                  <text
                    className={styles.rackAisle}
                    x={geometry.x + geometry.width - 1.2}
                    y={geometry.y + geometry.height - 1.4}
                  >
                    {rack.aisle}
                  </text>
                ) : null}
                <text
                  className={styles.rackCode}
                  x={geometry.x + 1.2}
                  y={geometry.y + geometry.height / 2 - 1.2}
                >
                  {rack.rack_code}
                </text>
                {rack.label ? (
                  <text
                    className={styles.rackLabel}
                    x={geometry.x + 1.2}
                    y={geometry.y + geometry.height / 2 + 1.9}
                  >
                    {rack.label}
                  </text>
                ) : null}
              </g>

              {badgeCount > 0 ? (
                <>
                  <circle
                    className={`${styles.badge} ${pending === 0 ? styles.badgeDone : ''}`}
                    cx={geometry.x + geometry.width - 2.4}
                    cy={geometry.y + 2.4}
                    r={1.9}
                  />
                  <text
                    className={styles.badgeText}
                    x={geometry.x + geometry.width - 2.4}
                    y={geometry.y + 2.4}
                  >
                    {badgeCount}
                  </text>
                </>
              ) : null}

              {editable ? (
                <rect
                  className={styles.handle}
                  x={geometry.x + geometry.width - HANDLE_SIZE / 2}
                  y={geometry.y + geometry.height - HANDLE_SIZE / 2}
                  width={HANDLE_SIZE}
                  height={HANDLE_SIZE}
                  rx={0.6}
                  onPointerDown={(event) => startDrag(event, rack, 'resize')}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      {zoomed ? (
        <button type="button" className={styles.resetView} onClick={() => setView(base)}>
          Réinitialiser la vue
        </button>
      ) : null}

      {hovered && !editable ? (
        <div
          className={styles.tooltip}
          style={{
            left: hovered.x - (svgRef.current?.getBoundingClientRect().left ?? 0),
            top: hovered.y - (svgRef.current?.getBoundingClientRect().top ?? 0),
          }}
        >
          <span className={styles.tooltipCode}>{hovered.rack.rack_code}</span>{' '}
          {hovered.rack.label || <span className={styles.tooltipMuted}>sans libellé</span>}
          <br />
          <span className={styles.tooltipMuted}>
            {hovered.rack.aisle ? `${hovered.rack.aisle} — ` : ''}
            {hovered.rack.is_zone
              ? 'zone (pas d’étagère)'
              : `${hovered.rack.shelves_count} étagères`}{' '}
            — {hovered.rack.items_count} article(s)
          </span>
        </div>
      ) : null}
    </div>
  );
}
