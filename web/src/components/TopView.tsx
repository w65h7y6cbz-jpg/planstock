import { useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Cadre la vue sur les emplacements plutôt que sur toute la pièce, pour
   * qu'ils occupent l'écran. L'éditeur montre la pièce entière.
   */
  fitToContent?: boolean;
}

const MIN_SIZE = 3;
const HANDLE_SIZE = 2.6;
/** Distance en unités de plan sous laquelle deux bords se collent. */
const SNAP_DISTANCE = 1.2;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 4;
/** Marge autour des emplacements quand la vue est cadrée sur eux. */
const FIT_PADDING = 5;
/** Au-delà, un local presque vide donnerait des rectangles démesurés. */
const MAX_FIT_SCALE = 2.4;

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

/** Marge intérieure d'un rectangle d'emplacement. */
const PADDING = 2.2;
/** Largeur du code (`R01`, toujours 3 caractères) en police mono à 3.1. */
const CODE_WIDTH = 6.4;
/** Largeur moyenne d'un caractère du libellé (police système à 2.2). */
const LABEL_CHAR_WIDTH = 1.12;

/**
 * Tronque un libellé à la place disponible. SVG ne sait pas couper un texte
 * avec des points de suspension : sans cela « Palette réception » est coupée
 * net au bord du rectangle.
 */
function fitLabel(label: string, available: number): string {
  const max = Math.floor(available / LABEL_CHAR_WIDTH);
  if (max <= 1) return '';
  return label.length <= max ? label : `${label.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Dispose le contenu d'un rectangle selon la place disponible : un rayonnage
 * fait souvent 9 unités de haut, ce qui ne suffit pas pour empiler code,
 * libellé et compteur. Dans ce cas le libellé passe à droite du code, et le
 * compteur disparaît si même deux lignes ne tiennent pas.
 */
function contentLayout(geometry: Geometry) {
  const roomy = geometry.height >= 11;
  const showMeta = geometry.height >= 7;
  const textX = geometry.x + PADDING;

  const metaY = geometry.y + geometry.height - 1.5;
  const gaugeY = metaY - 2.2;

  const codeY = roomy ? geometry.y + 4.4 : geometry.y + (showMeta ? 4.2 : geometry.height / 2);

  return {
    textX,
    codeY,
    labelX: roomy ? textX : textX + CODE_WIDTH + 1.2,
    labelY: roomy ? codeY + 3.2 : codeY,
    showLabel: roomy || geometry.width > CODE_WIDTH + 12,
    labelWidth:
      (roomy ? geometry.width - 2 * PADDING : geometry.width - CODE_WIDTH - 1.2 - 2 * PADDING) - 1,
    showMeta,
    metaY,
    gaugeY,
    // La jauge ne prend jamais plus de la moitié : le compteur reste lisible.
    gaugeWidth: Math.max(5, Math.min(16, (geometry.width - 2 * PADDING) * 0.45)),
  };
}

/** Bandes d'allée : rectangle englobant les rayonnages qui la composent. */
function aisleLanes(racks: Rack[]) {
  const groups = new Map<string, Rack[]>();
  for (const rack of racks) {
    if (rack.is_zone || !rack.aisle) continue;
    const group = groups.get(rack.aisle) ?? [];
    group.push(rack);
    groups.set(rack.aisle, group);
  }

  return [...groups.entries()].map(([aisle, members]) => {
    const minX = Math.min(...members.map((rack) => rack.x));
    const minY = Math.min(...members.map((rack) => rack.y));
    const maxX = Math.max(...members.map((rack) => rack.x + rack.width));
    const maxY = Math.max(...members.map((rack) => rack.y + rack.height));
    return { aisle, x: minX - 1.6, y: minY - 1.6, width: maxX - minX + 3.2, height: maxY - minY + 3.2 };
  });
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
  fitToContent = false,
}: TopViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<(Geometry & { rackId: number }) | null>(null);
  const [hovered, setHovered] = useState<{ rack: Rack; x: number; y: number } | null>(null);

  /** Cadrage de départ : la pièce entière, ou les emplacements s'ils sont groupés. */
  const base: ViewBox = useMemo(() => {
    const room = { x: -1, y: -1, width: planWidth + 2, height: planHeight + 2 };
    if (!fitToContent || racks.length === 0) return room;

    const minX = Math.min(...racks.map((rack) => rack.x)) - FIT_PADDING;
    const minY = Math.min(...racks.map((rack) => rack.y)) - FIT_PADDING;
    const maxX = Math.max(...racks.map((rack) => rack.x + rack.width)) + FIT_PADDING;
    const maxY = Math.max(...racks.map((rack) => rack.y + rack.height)) + FIT_PADDING;

    const width = Math.max(maxX - minX, room.width / MAX_FIT_SCALE);
    const height = Math.max(maxY - minY, room.height / MAX_FIT_SCALE);
    return {
      x: minX - (width - (maxX - minX)) / 2,
      y: minY - (height - (maxY - minY)) / 2,
      width,
      height,
    };
  }, [fitToContent, racks, planWidth, planHeight]);

  const [view, setView] = useState<ViewBox>(base);
  const [panning, setPanning] = useState<{ x: number; y: number; view: ViewBox } | null>(null);

  useEffect(() => {
    setView(base);
  }, [base]);

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
      setView({
        ...panning.view,
        x: panning.view.x - ((event.clientX - panning.x) * panning.view.width) / rect.width,
        y: panning.view.y - ((event.clientY - panning.y) * panning.view.height) / rect.height,
      });
      return;
    }

    if (!drag) return;
    const current = toPlanUnits(event.clientX, event.clientY);
    const dx = current.x - drag.originX;
    const dy = current.y - drag.originY;

    const others = racks.filter((rack) => rack.id !== drag.rackId);
    const xEdges = [0, planWidth, ...others.flatMap((rack) => [rack.x, rack.x + rack.width])];
    const yEdges = [0, planHeight, ...others.flatMap((rack) => [rack.y, rack.y + rack.height])];

    let next: Geometry;
    if (drag.mode === 'move') {
      const rawX = clamp(drag.start.x + dx, 0, planWidth - drag.start.width);
      const rawY = clamp(drag.start.y + dy, 0, planHeight - drag.start.height);
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
      const right = snap(
        clamp(drag.start.x + drag.start.width + dx, drag.start.x + MIN_SIZE, planWidth),
        xEdges,
      );
      const bottom = snap(
        clamp(drag.start.y + drag.start.height + dy, drag.start.y + MIN_SIZE, planHeight),
        yEdges,
      );
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

  const busiest = Math.max(1, ...racks.map((rack) => rack.items_count));
  const lanes = aisleLanes(racks);

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
        <defs>
          {/* Quadrillage du sol : donne l'échelle sans attirer l'œil. */}
          <pattern id="ps-floor" width="10" height="10" patternUnits="userSpaceOnUse">
            <path className={styles.floorLine} d="M 10 0 L 0 0 L 0 10" fill="none" />
          </pattern>
          {/* Hachures des zones : lecture immédiate « pas un rayonnage ». */}
          <pattern
            id="ps-hatch"
            width="2.6"
            height="2.6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line className={styles.hatchLine} x1="0" y1="0" x2="0" y2="2.6" />
          </pattern>
        </defs>

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
        <rect
          className={styles.floor}
          x={0}
          y={0}
          width={planWidth}
          height={planHeight}
          rx={1.5}
          fill="url(#ps-floor)"
          pointerEvents="none"
        />

        {lanes.map((lane) => (
          <g key={lane.aisle} pointerEvents="none">
            <rect
              className={styles.lane}
              x={lane.x}
              y={lane.y}
              width={lane.width}
              height={lane.height}
              rx={2}
            />
            <text className={styles.laneLabel} x={lane.x + 0.6} y={lane.y - 0.9}>
              {lane.aisle}
            </text>
          </g>
        ))}

        {racks.map((rack) => {
          const geometry = geometryOf(rack);
          const marks = highlight?.get(rack.id);
          const pending = marks?.pending ?? 0;
          const done = marks?.done ?? 0;
          const badgeCount = pending > 0 ? pending : done;
          const centerX = geometry.x + geometry.width / 2;
          const centerY = geometry.y + geometry.height / 2;
          const fill = Math.min(1, rack.items_count / busiest);
          const layout = contentLayout(geometry);

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
              }, ${rack.items_count} article(s)${
                pending > 0 ? `, ${pending} à préparer` : ''
              }${pending === 0 && done > 0 ? `, ${done} validé(s)` : ''}`}
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
                  rx={1.2}
                />
              </clipPath>

              {/* Ombre portée : donne du relief au meuble sur le sol. */}
              <rect
                className={styles.rackShadow}
                x={geometry.x + 0.5}
                y={geometry.y + 0.7}
                width={geometry.width}
                height={geometry.height}
                rx={1.2}
              />
              <rect
                className={styles.rackBody}
                x={geometry.x}
                y={geometry.y}
                width={geometry.width}
                height={geometry.height}
                rx={1.2}
              />
              {rack.is_zone ? (
                <rect
                  className={styles.zoneHatch}
                  x={geometry.x}
                  y={geometry.y}
                  width={geometry.width}
                  height={geometry.height}
                  rx={1.2}
                  fill="url(#ps-hatch)"
                  pointerEvents="none"
                />
              ) : (
                <rect
                  className={styles.rackEdge}
                  x={geometry.x}
                  y={geometry.y}
                  width={1}
                  height={geometry.height}
                  clipPath={`url(#rack-clip-${rack.id})`}
                  pointerEvents="none"
                />
              )}

              <g clipPath={`url(#rack-clip-${rack.id})`} pointerEvents="none">
                <text className={styles.rackCode} x={layout.textX} y={layout.codeY}>
                  {rack.rack_code}
                </text>
                {rack.label && layout.showLabel ? (
                  <text className={styles.rackLabel} x={layout.labelX} y={layout.labelY}>
                    {fitLabel(rack.label, layout.labelWidth)}
                  </text>
                ) : null}

                {layout.showMeta ? (
                  <>
                    {/* Remplissage relatif : où reste-t-il de la place ? */}
                    {rack.items_count > 0 ? (
                      <>
                        <rect
                          className={styles.gaugeTrack}
                          x={layout.textX}
                          y={layout.gaugeY}
                          width={layout.gaugeWidth}
                          height={0.9}
                          rx={0.45}
                        />
                        <rect
                          className={styles.gaugeFill}
                          x={layout.textX}
                          y={layout.gaugeY}
                          width={layout.gaugeWidth * fill}
                          height={0.9}
                          rx={0.45}
                        />
                      </>
                    ) : null}

                    <text
                      className={styles.rackCount}
                      x={geometry.x + geometry.width - PADDING}
                      y={layout.metaY}
                    >
                      {rack.items_count === 0
                        ? 'vide'
                        : `${rack.items_count} art.${
                            rack.is_zone ? '' : ` · ${rack.shelves_count} ét.`
                          }`}
                    </text>
                  </>
                ) : null}
              </g>

              {badgeCount > 0 ? (
                <>
                  <circle
                    className={`${styles.badge} ${pending === 0 ? styles.badgeDone : ''}`}
                    cx={geometry.x + geometry.width - 2.6}
                    cy={geometry.y + 2.6}
                    r={2.1}
                  />
                  <text
                    className={styles.badgeText}
                    x={geometry.x + geometry.width - 2.6}
                    y={geometry.y + 2.6}
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
