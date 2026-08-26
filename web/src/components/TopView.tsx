import { useRef, useState } from 'react';
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
  /** Rayonnages « allumés » : identifiant → nombre d'articles à préparer. */
  highlight?: Map<number, number>;
  onSelectRack?: (rack: Rack) => void;
  /** Autorise le déplacement et le redimensionnement des rectangles. */
  editable?: boolean;
  onGeometryCommit?: (rackId: number, geometry: Geometry) => void;
}

const MIN_SIZE = 4;
const HANDLE_SIZE = 2.6;

interface DragState {
  rackId: number;
  mode: 'move' | 'resize';
  originX: number;
  originY: number;
  start: Geometry;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const round = (value: number) => Math.round(value * 100) / 100;

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
    if (!drag) return;
    const current = toPlanUnits(event.clientX, event.clientY);
    const dx = current.x - drag.originX;
    const dy = current.y - drag.originY;

    const next =
      drag.mode === 'move'
        ? {
            x: clamp(drag.start.x + dx, 0, planWidth - drag.start.width),
            y: clamp(drag.start.y + dy, 0, planHeight - drag.start.height),
            width: drag.start.width,
            height: drag.start.height,
          }
        : {
            x: drag.start.x,
            y: drag.start.y,
            width: clamp(drag.start.width + dx, MIN_SIZE, planWidth - drag.start.x),
            height: clamp(drag.start.height + dy, MIN_SIZE, planHeight - drag.start.y),
          };

    setDraft({ rackId: drag.rackId, ...next });
  }

  function endDrag(event: React.PointerEvent<SVGElement>) {
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
          <span>Aucun rayonnage sur le plan.</span>
          <span>Ajoutez-en un depuis Paramètres → Plan.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <svg
        ref={svgRef}
        className={styles.svg}
        viewBox={`-1 -1 ${planWidth + 2} ${planHeight + 2}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="Vue de dessus du local"
        onPointerMove={onPointerMove}
      >
        <rect
          className={styles.room}
          x={0}
          y={0}
          width={planWidth}
          height={planHeight}
          rx={1.5}
        />

        {racks.map((rack) => {
          const geometry = geometryOf(rack);
          const litCount = highlight?.get(rack.id) ?? 0;
          const centerX = geometry.x + geometry.width / 2;
          const centerY = geometry.y + geometry.height / 2;

          const classes = [
            styles.rack,
            editable ? styles.rackEditable : '',
            drag?.rackId === rack.id ? styles.rackDragging : '',
            selectedRackId === rack.id ? styles.rackSelected : '',
            litCount > 0 ? styles.rackLit : '',
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
                litCount > 0 ? `, ${litCount} article(s) à préparer` : ''
              }`}
              onKeyDown={(event) => onKeyDown(event, rack)}
              onPointerDown={(event) => startDrag(event, rack, 'move')}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClick={() => !drag && onSelectRack?.(rack)}
              onPointerEnter={(event) =>
                !drag && setHovered({ rack, x: event.clientX, y: event.clientY })
              }
              onPointerLeave={() => setHovered(null)}
            >
              {/* Le libellé ne doit jamais déborder du rectangle du rayonnage. */}
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
                <text
                  className={styles.rackCode}
                  x={geometry.x + 1.4}
                  y={geometry.y + geometry.height / 2 - 1.4}
                >
                  {rack.rack_code}
                </text>
                {rack.label ? (
                  <text
                    className={styles.rackLabel}
                    x={geometry.x + 1.4}
                    y={geometry.y + geometry.height / 2 + 1.8}
                  >
                    {rack.label}
                  </text>
                ) : null}
              </g>

              {litCount > 0 ? (
                <>
                  <circle
                    className={styles.badge}
                    cx={geometry.x + geometry.width - 2.4}
                    cy={geometry.y + 2.4}
                    r={1.9}
                  />
                  <text
                    className={styles.badgeText}
                    x={geometry.x + geometry.width - 2.4}
                    y={geometry.y + 2.4}
                  >
                    {litCount}
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
            {hovered.rack.shelves_count} étagères × {hovered.rack.slots_per_shelf} cases —{' '}
            {hovered.rack.items_count} article(s)
          </span>
        </div>
      ) : null}
    </div>
  );
}
