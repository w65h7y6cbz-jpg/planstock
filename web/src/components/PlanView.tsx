import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { aisleColor } from '../lib/labels';
import type { RouteStop } from '../lib/picklist';
import type { Landmark, Rack } from '../types';
import styles from './PlanView.module.css';

/**
 * Plan du local, vu de dessus avec un peu d'épaisseur : chaque meuble a une
 * face avant et une ombre portée, ce qui le fait lire comme un objet posé au
 * sol plutôt que comme un rectangle abstrait.
 *
 * Le plan est fixe : ni molette ni glisser du fond, rien à recadrer. Quand un
 * emplacement est visé, la vue se déplace et zoome dessus toute seule ; un
 * bouton ramène le local entier.
 */

/** Épaisseur apparente d'un meuble, en unités de plan. */
const RACK_DEPTH = 3;
const ZONE_DEPTH = 1.8;
const MARGIN = 3;
/**
 * Marge laissée autour du meuble visé. Un cadrage proportionnel ne zoomerait
 * presque pas sur un rayonnage déjà large ; une marge fixe donne le même
 * rapprochement visible quelle que soit la taille du meuble.
 */
const FOCUS_MARGIN = 15;
const FOCUS_MIN_WIDTH = 38;
const TWEEN_MS = 200;

/** Géométrie d'un objet posé au sol : un rectangle, et son orientation. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Orientation en degrés. Le rectangle reste stocké non pivoté. */
  angle: number;
}

/**
 * Cadrage de la vue. C'est un rectangle d'écran, jamais pivoté — d'où un type
 * distinct de `Box` : confondre les deux ferait croire qu'on peut incliner la
 * caméra, ce que le plan ne fait pas.
 */
interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Rotation d'un point autour d'un pivot, en degrés.
 *
 * Les meubles sont stockés en rectangles droits, et pivotés à l'affichage
 * autour de leur centre. SVG s'occupe du dessin et des clics tout seul ; c'est
 * le redimensionnement qui a besoin de ce calcul, pour ramener le pointeur dans
 * le repère du meuble avant d'en déduire des cotes.
 */
function rotatePoint(px: number, py: number, cx: number, cy: number, degrees: number) {
  if (!degrees) return { x: px, y: py };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/** Centre d'une boîte : c'est autour de lui que tout pivote. */
const centreOf = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/** Attribut `transform` d'un meuble pivoté, ou rien s'il est droit. */
function rotationTransform(box: Box) {
  if (!box.angle) return undefined;
  const centre = centreOf(box);
  return `rotate(${box.angle} ${centre.x} ${centre.y})`;
}

interface PlanViewProps {
  racks: Rack[];
  landmarks: Landmark[];
  planWidth: number;
  planHeight: number;
  /** Meuble sur lequel la vue se centre, ou `null` pour le local entier. */
  focusRackId?: number | null;
  /** Meuble ouvert dans le panneau latéral. */
  selectedRackId?: number | null;
  /** Parcours numéroté de la préparation en cours. */
  route?: RouteStop[];
  /** Meubles acceptant un dépôt d'article pendant un glisser. */
  dropEnabled?: boolean;
  /** Mode éditeur : meubles et repères se déplacent et se redimensionnent. */
  editable?: boolean;
  onSelectRack?: (rack: Rack) => void;
  onGeometryChange?: (rack: Rack, geometry: Box) => void;
  onLandmarkChange?: (landmark: Landmark, geometry: Box) => void;
}

/** Position d'un élément pendant qu'on le fait glisser, avant enregistrement. */
type Ghost = Box & { kind: 'rack' | 'landmark'; id: number };

/** Ce qu'on est en train de faire au meuble attrapé. */
type DragMode = 'move' | 'resize' | 'rotate';

export function PlanView({
  racks,
  landmarks,
  planWidth,
  planHeight,
  focusRackId = null,
  selectedRackId = null,
  route = [],
  dropEnabled = false,
  editable = false,
  onSelectRack,
  onGeometryChange,
  onLandmarkChange,
}: PlanViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const dragRef = useRef<{
    kind: 'rack' | 'landmark';
    id: number;
    box: Box;
    mode: DragMode;
    grabX: number;
    grabY: number;
  } | null>(null);

  const full = useMemo<ViewBox>(
    () => ({
      x: -MARGIN,
      y: -MARGIN,
      width: planWidth + MARGIN * 2,
      height: planHeight + MARGIN * 2 + RACK_DEPTH,
    }),
    [planWidth, planHeight],
  );

  const focused = useMemo<ViewBox | null>(() => {
    const rack = racks.find((candidate) => candidate.id === focusRackId);
    if (!rack) return null;

    // Cadrage sur le meuble, sans jamais sortir des murs du local.
    const width = Math.min(
      full.width,
      Math.max(FOCUS_MIN_WIDTH, rack.width + FOCUS_MARGIN * 2),
    );
    const height = width * (full.height / full.width);
    const centerX = rack.x + rack.width / 2;
    const centerY = rack.y + rack.height / 2;

    return {
      x: clamp(centerX - width / 2, full.x, full.x + full.width - width),
      y: clamp(centerY - height / 2, full.y, full.y + full.height - height),
      width,
      height,
    };
  }, [racks, focusRackId, full]);

  // En mode éditeur, le cadrage reste fixe : la vue ne doit pas bouger sous la
  // main pendant qu'on déplace un meuble.
  const viewBox = useTweenedBox(editable ? full : (focused ?? full));
  const routeByRack = new Map(route.map((stop) => [stop.rackId, stop]));

  /** Coordonnées du plan sous le pointeur, quelle que soit la taille de l'écran. */
  function toPlanPoint(event: ReactPointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  }

  function startDrag(
    event: ReactPointerEvent,
    kind: 'rack' | 'landmark',
    id: number,
    box: Box,
    mode: DragMode,
  ) {
    if (!editable) return;
    const point = toPlanPoint(event);
    if (!point) return;

    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    dragRef.current = {
      kind,
      id,
      box,
      mode,
      // Seul le déplacement a besoin de mémoriser où le doigt a pris le meuble.
      // Le redimensionnement et la rotation se calculent depuis un point figé.
      grabX: point.x - box.x,
      grabY: point.y - box.y,
    };
    setGhost({ kind, id, ...box });
  }

  function onPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    const point = drag ? toPlanPoint(event) : null;
    if (!drag || !point) return;

    const { box } = drag;
    const head = { kind: drag.kind, id: drag.id };

    if (drag.mode === 'move') {
      setGhost({
        ...head,
        width: box.width,
        height: box.height,
        angle: box.angle,
        x: clamp(point.x - drag.grabX, 0, planWidth - box.width),
        y: clamp(point.y - drag.grabY, 0, planHeight - box.height),
      });
      return;
    }

    if (drag.mode === 'rotate') {
      // L'angle suit le doigt autour du centre. Le zéro pointe vers le haut,
      // sens des aiguilles, comme la poignée que l'on voit.
      const centre = centreOf(box);
      const degrees = (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI + 90;
      const wrapped = ((degrees % 360) + 360) % 360;
      // Aimant sur les quarts et les diagonales : poser un meuble d'équerre ne
      // doit pas demander de la dextérité.
      const snapped = Math.abs(wrapped % 45) < 4 ? Math.round(wrapped / 45) * 45 : wrapped;
      setGhost({ ...head, ...box, angle: Math.round(snapped * 10) / 10 % 360 });
      return;
    }

    // Redimensionnement. Le coin opposé reste figé à l'écran ; le pointeur est
    // ramené dans le repère du meuble, et l'écart au coin figé donne les cotes.
    const centre = centreOf(box);
    const anchor = rotatePoint(box.x, box.y, centre.x, centre.y, box.angle);
    const local = rotatePoint(point.x, point.y, anchor.x, anchor.y, -box.angle);
    const width = Math.max(3, local.x - anchor.x);
    const height = Math.max(2, local.y - anchor.y);
    // Le coin figé impose où repart le rectangle non pivoté.
    const nextCentre = rotatePoint(
      anchor.x + width / 2,
      anchor.y + height / 2,
      anchor.x,
      anchor.y,
      box.angle,
    );

    setGhost({
      ...head,
      angle: box.angle,
      width,
      height,
      x: nextCentre.x - width / 2,
      y: nextCentre.y - height / 2,
    });
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && ghost) {
      const round = (value: number) => Math.round(value * 100) / 100;
      const box = {
        x: round(ghost.x),
        y: round(ghost.y),
        width: round(ghost.width),
        height: round(ghost.height),
        angle: round(ghost.angle),
      };
      if (drag.kind === 'rack') {
        const rack = racks.find((candidate) => candidate.id === drag.id);
        if (rack) onGeometryChange?.(rack, box);
      } else {
        const landmark = landmarks.find((candidate) => candidate.id === drag.id);
        if (landmark) onLandmarkChange?.(landmark, box);
      }
    }
    setGhost(null);
  }

  // Le tracé relie les centres ; la pastille chiffrée se pose au coin haut
  // droit du meuble, où elle ne recouvre ni le code ni le libellé.
  const stops = route
    .map((stop) => {
      const rack = racks.find((candidate) => candidate.id === stop.rackId);
      return rack
        ? {
            stop,
            x: rack.x + rack.width / 2,
            y: rack.y + rack.height / 2,
            badgeX: rack.x + rack.width - 2,
            badgeY: rack.y - 1,
          }
        : null;
    })
    .filter(
      (entry): entry is { stop: RouteStop; x: number; y: number; badgeX: number; badgeY: number } =>
        entry !== null,
    );

  return (
    <svg
      ref={svgRef}
      className={styles.svg}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label="Plan du local"
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={editable ? onPointerMove : undefined}
      onPointerUp={editable ? endDrag : undefined}
      onPointerCancel={editable ? endDrag : undefined}
    >
      <defs>
        <pattern id="plan-floor-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path className={styles.gridLine} d="M10 0 L0 0 0 10" fill="none" />
        </pattern>
      </defs>

      {/* Sol et murs */}
      <rect className={styles.floor} x="0" y="0" width={planWidth} height={planHeight} />
      <rect
        x="0"
        y="0"
        width={planWidth}
        height={planHeight}
        fill="url(#plan-floor-grid)"
        pointerEvents="none"
      />
      <rect
        className={styles.wall}
        x="0"
        y="0"
        width={planWidth}
        height={planHeight}
        fill="none"
      />

      {landmarks.map((landmark) => (
        <LandmarkShape
          key={landmark.id}
          landmark={
            ghost?.kind === 'landmark' && ghost.id === landmark.id
              ? { ...landmark, x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height }
              : landmark
          }
          editable={editable}
          onGrab={startDrag}
        />
      ))}

      <AisleLabels racks={racks} />

      {/* Tracé du parcours : il passe sous les meubles pour ne rien masquer. */}
      {stops.length > 1 ? (
        <polyline
          className={styles.routeLine}
          points={stops.map((entry) => `${entry.x},${entry.y}`).join(' ')}
          fill="none"
        />
      ) : null}

      {racks.map((rack) => (
        <RackShape
          key={rack.id}
          rack={
            ghost?.kind === 'rack' && ghost.id === rack.id
              ? { ...rack, x: ghost.x, y: ghost.y, width: ghost.width, height: ghost.height }
              : rack
          }
          selected={selectedRackId === rack.id}
          focused={focusRackId === rack.id}
          stop={routeByRack.get(rack.id) ?? null}
          dropEnabled={dropEnabled}
          editable={editable}
          dragging={ghost?.kind === 'rack' && ghost.id === rack.id}
          onSelect={onSelectRack}
          onGrab={startDrag}
        />
      ))}

      {stops.map((entry) => (
        <g key={entry.stop.rackId} transform={`translate(${entry.badgeX}, ${entry.badgeY})`}>
          <circle className={styles.stepHalo} r="4.4" />
          <circle className={entry.stop.pending === 0 ? styles.stepDone : styles.step} r="3.4" />
          <text className={styles.stepText} y="0.2">
            {entry.stop.pending === 0 ? '✓' : entry.stop.position}
          </text>
        </g>
      ))}
    </svg>
  );
}

function RackShape({
  rack,
  selected,
  focused,
  stop,
  dropEnabled,
  editable,
  dragging,
  onSelect,
  onGrab,
}: {
  rack: Rack;
  selected: boolean;
  focused: boolean;
  stop: RouteStop | null;
  dropEnabled: boolean;
  editable?: boolean;
  dragging?: boolean;
  onSelect?: (rack: Rack) => void;
  onGrab?: (
    event: ReactPointerEvent,
    kind: 'rack' | 'landmark',
    id: number,
    box: Box,
    mode: DragMode,
  ) => void;
}) {
  const box: Box = {
    x: rack.x,
    y: rack.y,
    width: rack.width,
    height: rack.height,
    angle: rack.angle ?? 0,
  };
  const { setNodeRef, isOver } = useDroppable({
    id: `rack-${rack.id}`,
    data: { rack },
    disabled: !dropEnabled,
  });
  // @dnd-kit type sa référence pour HTMLElement ; la cible de dépôt est ici un
  // groupe SVG, ce qui convient à l'exécution (l'API n'utilise que la mesure).
  const dropRef = setNodeRef as unknown as (element: SVGGElement | null) => void;

  const depth = rack.is_zone ? ZONE_DEPTH : RACK_DEPTH;
  const tone = aisleColor(rack.aisle, 'transparent');
  const classes = [
    styles.rack,
    rack.is_zone ? styles.zone : '',
    selected ? styles.rackSelected : '',
    focused ? styles.rackFocused : '',
    isOver ? styles.rackOver : '',
    stop && stop.pending > 0 ? styles.rackLit : '',
    stop && stop.pending === 0 ? styles.rackDone : '',
    editable ? styles.rackEditable : '',
    dragging ? styles.rackDragging : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Le code tient toujours ; le libellé n'apparaît que si le meuble est assez grand.
  const showLabel = rack.label && rack.width >= 16 && rack.height >= 7;

  return (
    <g
      ref={dropRef}
      className={classes}
      transform={rotationTransform(box)}
      onClick={onSelect ? () => onSelect(rack) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={`${rack.rack_code}${rack.label ? ` ${rack.label}` : ''}`}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(rack);
              }
            }
          : undefined
      }
      onPointerDown={
        editable && onGrab ? (event) => onGrab(event, 'rack', rack.id, box, 'move') : undefined
      }
    >
      {/* Ombre portée : le meuble est posé au sol, pas dessiné dessus. */}
      <rect
        className={styles.shadow}
        x={rack.x + 0.8}
        y={rack.y + 1.2}
        width={rack.width}
        height={rack.height + depth}
        rx="1.2"
      />

      {/* Face avant : c'est elle qui donne l'épaisseur. */}
      <rect
        className={styles.side}
        x={rack.x}
        y={rack.y + rack.height - 1}
        width={rack.width}
        height={depth + 1}
        rx="1"
      />

      {/* Dessus du meuble */}
      <rect
        className={styles.top}
        x={rack.x}
        y={rack.y}
        width={rack.width}
        height={rack.height}
        rx="1.2"
      />

      {/* Gondole : deux faces adossées. Le trait central dit qu'on la sert des
          deux côtés, contrairement à un rayonnage plaqué contre un mur. */}
      {rack.style === 'gondola' ? (
        <line
          className={styles.gondolaSpine}
          x1={rack.x + 1}
          y1={rack.y + rack.height / 2}
          x2={rack.x + rack.width - 1}
          y2={rack.y + rack.height / 2}
        />
      ) : null}

      {/* Liseré d'allée : la direction avant même d'avoir lu le code. */}
      {!rack.is_zone && tone !== 'transparent' ? (
        <rect
          className={styles.aisleEdge}
          x={rack.x}
          y={rack.y}
          width={rack.width}
          height="1.4"
          rx="0.7"
          fill={tone}
        />
      ) : null}

      <text
        className={styles.code}
        x={rack.x + rack.width / 2}
        y={rack.y + rack.height / 2 + (showLabel ? -1.4 : 0)}
      >
        {rack.rack_code}
      </text>
      {showLabel ? (
        <text className={styles.label} x={rack.x + rack.width / 2} y={rack.y + rack.height / 2 + 3.2}>
          {rack.label}
        </text>
      ) : null}

      {/* Poignées d'édition, sur le meuble sélectionné seulement : les afficher
          sur les dix meubles à la fois rendait le plan illisible. */}
      {editable && onGrab && selected ? (
        <EditHandles box={box} kind="rack" id={rack.id} onGrab={onGrab} />
      ) : null}
    </g>
  );
}

/** Une étiquette par allée, posée au-dessus du groupe de rayonnages. */
function AisleLabels({ racks }: { racks: Rack[] }) {
  const groups = new Map<string, { left: number; top: number }>();

  for (const rack of racks) {
    const aisle = rack.aisle?.trim();
    if (!aisle || rack.is_zone) continue;
    const current = groups.get(aisle);
    if (!current || rack.y < current.top) {
      groups.set(aisle, { left: current ? Math.min(current.left, rack.x) : rack.x, top: rack.y });
    } else {
      groups.set(aisle, { left: Math.min(current.left, rack.x), top: current.top });
    }
  }

  return (
    <g>
      {[...groups.entries()].map(([aisle, position]) => (
        <text
          key={aisle}
          className={styles.aisleLabel}
          x={position.left}
          y={position.top - 1.8}
          fill={aisleColor(aisle)}
        >
          {aisle.toUpperCase()}
        </text>
      ))}
    </g>
  );
}

/** Porte d'entrée (avec son arc d'ouverture) ou établi. */
function LandmarkShape({
  landmark,
  editable,
  onGrab,
}: {
  landmark: Landmark;
  editable?: boolean;
  onGrab?: (
    event: ReactPointerEvent,
    kind: 'rack' | 'landmark',
    id: number,
    box: Box,
    mode: DragMode,
  ) => void;
}) {
  const box = {
    x: landmark.x,
    y: landmark.y,
    width: landmark.width,
    height: landmark.height,
    angle: landmark.angle ?? 0,
  };
  const grab =
    editable && onGrab
      ? (event: ReactPointerEvent) => onGrab(event, 'landmark', landmark.id, box, 'move')
      : undefined;

  if (landmark.kind === 'door') {
    const { x, y, width } = landmark;
    return (
      <g
        className={`${styles.door} ${editable ? styles.landmarkEditable : ''}`}
        transform={rotationTransform(box)}
        onPointerDown={grab}
      >
        <rect className={styles.doorGap} x={x} y={y - 0.6} width={width} height="1.6" />
        <path
          className={styles.doorArc}
          d={`M ${x} ${y + 1} A ${width} ${width} 0 0 1 ${x + width} ${y + 1}`}
          fill="none"
        />
        <text className={styles.landmarkText} x={x + width / 2} y={y + width * 0.55}>
          {landmark.label || 'Entrée'}
        </text>
        {editable && onGrab ? (
          <EditHandles box={box} kind="landmark" id={landmark.id} onGrab={onGrab} />
        ) : null}
      </g>
    );
  }

  return (
    <g
      className={`${styles.bench} ${editable ? styles.landmarkEditable : ''}`}
      transform={rotationTransform(box)}
      onPointerDown={grab}
    >
      <rect
        className={styles.benchBody}
        x={landmark.x}
        y={landmark.y}
        width={landmark.width}
        height={landmark.height}
        rx="1.2"
      />
      <text
        className={styles.landmarkText}
        x={landmark.x + landmark.width / 2}
        y={landmark.y + landmark.height / 2}
      >
        {landmark.label || 'Établi'}
      </text>
      {editable && onGrab ? (
        <EditHandles box={box} kind="landmark" id={landmark.id} onGrab={onGrab} />
      ) : null}
    </g>
  );
}

/**
 * Les deux poignées d'un meuble en mode éditeur : redimensionner au coin
 * bas-droit, pivoter par la tige au-dessus. Elles vivent dans le groupe pivoté,
 * donc elles suivent le meuble sans calcul supplémentaire.
 */
function EditHandles({
  box,
  kind,
  id,
  onGrab,
}: {
  box: Box;
  kind: 'rack' | 'landmark';
  id: number;
  onGrab: (
    event: ReactPointerEvent,
    kind: 'rack' | 'landmark',
    id: number,
    box: Box,
    mode: DragMode,
  ) => void;
}) {
  const centreX = box.x + box.width / 2;

  return (
    <>
      <line
        className={styles.rotateStem}
        x1={centreX}
        y1={box.y}
        x2={centreX}
        y2={box.y - 5}
      />
      <circle
        className={styles.rotateHandle}
        cx={centreX}
        cy={box.y - 5}
        r="2.2"
        onPointerDown={(event) => onGrab(event, kind, id, box, 'rotate')}
      />
      <rect
        className={styles.handle}
        x={box.x + box.width - 2.2}
        y={box.y + box.height - 2.2}
        width="4.4"
        height="4.4"
        rx="1.2"
        onPointerDown={(event) => onGrab(event, kind, id, box, 'resize')}
      />
    </>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max <= min ? min : max);
}

/**
 * Le cadrage glisse vers sa cible en 200 ms. `viewBox` n'étant pas animable en
 * CSS, l'interpolation se fait à la main, une image à la fois.
 */
function useTweenedBox(target: ViewBox): ViewBox {
  const [box, setBox] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / TWEEN_MS);
      // Sortie douce : rapide au départ, posé à l'arrivée.
      const eased = 1 - (1 - progress) ** 3;
      const next = {
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        width: from.width + (target.width - from.width) * eased,
        height: from.height + (target.height - from.height) * eased,
      };
      setBox(next);
      fromRef.current = next;
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target]);

  return box;
}
