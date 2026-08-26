import type { Side } from '../types';
import { SIDE_LABELS, SIDE_POSITION } from '../lib/labels';
import styles from './RackElevation.module.css';

/**
 * Rayonnage vu de face, dessiné comme le vrai meuble : deux montants perforés,
 * des tablettes épaisses, des pieds posés au sol.
 *
 * Le dessin ne compte pas les articles et n'en montre aucun : il répond à une
 * seule question, « où est celui que je cherche ». L'étagère visée reste nette,
 * les autres s'estompent, et la graduation gauche / centre / droite précise
 * l'endroit quand l'information a été saisie.
 */

const WIDTH = 100;
/** Place réservée à gauche du meuble pour les numéros d'étagère. */
const LABEL_GUTTER = 11;
const TOP = 10;
const SLOT = 17;
const FEET = 9;
const BOARD = 3.4;
const UPRIGHT_LEFT = 3;
const UPRIGHT_RIGHT = 91.5;
const UPRIGHT_WIDTH = 5.5;
const INNER_LEFT = UPRIGHT_LEFT + UPRIGHT_WIDTH;
const INNER_RIGHT = UPRIGHT_RIGHT;
const INNER_WIDTH = INNER_RIGHT - INNER_LEFT;

export type ShelfMark = 'lit' | 'done';

interface RackElevationProps {
  shelvesCount: number;
  /** Étagère mise en avant (1 = celle du haut), ou `null`. */
  target?: number | null;
  /** Côté de l'étagère visée, quand il a été renseigné. */
  targetSide?: Side | null;
  /** Estompe les étagères qui ne sont pas la cible. */
  dimOthers?: boolean;
  /** Étagère dépliée dans la vue complète du rayonnage. */
  selected?: number | null;
  /** Rend chaque étagère cliquable. */
  onSelectShelf?: (shelfIndex: number) => void;
  /** Étagères concernées par la liste de préparation. */
  marks?: Map<number, ShelfMark>;
  /** Hauteur d'affichage en pixels ; le dessin s'y adapte. */
  height?: number;
}

/** Bornes verticales d'une étagère (1 = celle du haut). */
function slotBox(shelfIndex: number) {
  const top = TOP + (shelfIndex - 1) * SLOT;
  return { top, bottom: top + SLOT, boardTop: top + SLOT - BOARD };
}

export function RackElevation({
  shelvesCount,
  target = null,
  targetSide = null,
  dimOthers = false,
  selected = null,
  onSelectShelf,
  marks,
  height = 340,
}: RackElevationProps) {
  const count = Math.max(1, shelvesCount);
  const totalHeight = TOP + count * SLOT + FEET;
  const shelves = Array.from({ length: count }, (_, index) => index + 1);

  return (
    // Le cadre déborde à gauche pour contenir les numéros d'étagère, posés
    // hors du meuble.
    <svg
      className={styles.svg}
      viewBox={`${-LABEL_GUTTER} 0 ${WIDTH + LABEL_GUTTER} ${totalHeight}`}
      style={{ height, maxHeight: '100%' }}
      role="img"
      aria-label={
        target
          ? `Rayonnage de ${count} étagères, article sur l’étagère ${target}`
          : `Rayonnage de ${count} étagères`
      }
    >
      {/* Sol */}
      <line
        className={styles.ground}
        x1="0"
        y1={totalHeight - 1.4}
        x2={WIDTH}
        y2={totalHeight - 1.4}
      />

      {/* Fond du meuble, entre les montants */}
      <rect
        className={styles.back}
        x={INNER_LEFT}
        y={TOP - 2}
        width={INNER_WIDTH}
        height={count * SLOT + 2}
      />

      {shelves.map((index) => {
        const box = slotBox(index);
        const isTarget = target === index;
        const isSelected = selected === index;
        const mark = marks?.get(index);
        const faded = dimOthers && target !== null && !isTarget;

        return (
          <g
            key={index}
            className={[
              styles.shelf,
              faded ? styles.shelfFaded : '',
              isTarget ? styles.shelfTarget : '',
              isSelected ? styles.shelfSelected : '',
              mark === 'lit' ? styles.shelfLit : '',
              mark === 'done' ? styles.shelfDone : '',
              onSelectShelf ? styles.shelfClickable : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onSelectShelf ? () => onSelectShelf(index) : undefined}
            role={onSelectShelf ? 'button' : undefined}
            tabIndex={onSelectShelf ? 0 : undefined}
            aria-label={onSelectShelf ? `Étagère ${index}` : undefined}
            onKeyDown={
              onSelectShelf
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectShelf(index);
                    }
                  }
                : undefined
            }
          >
            {/* Espace de rangement de l'étagère */}
            <rect
              className={styles.slot}
              x={INNER_LEFT}
              y={box.top}
              width={INNER_WIDTH}
              height={SLOT - BOARD}
            />

            {/* Tablette : dessus clair, chant plus sombre — l'épaisseur se voit */}
            <rect
              className={styles.board}
              x={INNER_LEFT - 1.6}
              y={box.boardTop}
              width={INNER_WIDTH + 3.2}
              height={BOARD}
              rx="0.7"
            />
            <rect
              className={styles.boardEdge}
              x={INNER_LEFT - 1.6}
              y={box.boardTop + BOARD - 1.1}
              width={INNER_WIDTH + 3.2}
              height="1.1"
            />

            {/* Numéro d'étagère, hors du meuble */}
            <text className={styles.shelfCode} x={UPRIGHT_LEFT - 1} y={box.top + SLOT / 2}>
              {`E${index}`}
            </text>
          </g>
        );
      })}

      {/* Montants perforés */}
      <Upright x={UPRIGHT_LEFT} height={count * SLOT + TOP - 2} />
      <Upright x={UPRIGHT_RIGHT} height={count * SLOT + TOP - 2} />

      {/* Pieds */}
      <rect
        className={styles.foot}
        x={UPRIGHT_LEFT - 1.5}
        y={TOP + count * SLOT - 2}
        width={UPRIGHT_WIDTH + 3}
        height="2.6"
        rx="1"
      />
      <rect
        className={styles.foot}
        x={UPRIGHT_RIGHT - 1.5}
        y={TOP + count * SLOT - 2}
        width={UPRIGHT_WIDTH + 3}
        height="2.6"
        rx="1"
      />

      {target !== null && target >= 1 && target <= count ? (
        <TargetMarker shelfIndex={target} side={targetSide} />
      ) : null}
    </svg>
  );
}

function Upright({ x, height }: { x: number; height: number }) {
  // Les perforations d'un montant de rayonnage : c'est ce détail qui fait
  // reconnaître le meuble d'un coup d'œil.
  const holes = [];
  for (let y = TOP - 4; y < height - 2; y += 5) {
    holes.push(<rect key={y} className={styles.hole} x={x + 1.9} y={y} width="1.7" height="2.4" rx="0.5" />);
  }

  return (
    <g>
      <rect className={styles.upright} x={x} y="2" width={UPRIGHT_WIDTH} height={height} rx="1.2" />
      <rect className={styles.uprightShine} x={x} y="2" width="1.7" height={height} rx="0.8" />
      {holes}
    </g>
  );
}

/** Repère de l'étagère visée : un chevron à gauche, la graduation si connue. */
function TargetMarker({ shelfIndex, side }: { shelfIndex: number; side: Side | null }) {
  const box = slotBox(shelfIndex);
  const middle = box.top + (SLOT - BOARD) / 2;

  return (
    <g className={styles.marker}>
      <rect
        className={styles.markerHalo}
        x={INNER_LEFT - 2.4}
        y={box.top - 1}
        width={INNER_WIDTH + 4.8}
        height={SLOT + 1}
        rx="1.6"
      />

      {side ? (
        <>
          {/* Graduation en trois tiers, sur la tablette visée */}
          {[1 / 3, 2 / 3].map((fraction) => (
            <line
              key={fraction}
              className={styles.tick}
              x1={INNER_LEFT + INNER_WIDTH * fraction}
              y1={box.boardTop - 3}
              x2={INNER_LEFT + INNER_WIDTH * fraction}
              y2={box.boardTop}
            />
          ))}
          <g
            transform={`translate(${INNER_LEFT + INNER_WIDTH * SIDE_POSITION[side]}, ${middle})`}
          >
            <circle className={styles.spot} r="5.2" />
            <circle className={styles.spotPulse} r="5.2" />
          </g>
          {/* Au-dessus de l'étagère : dans la case, l'étiquette passerait sous
              le repère rond. */}
          <text
            className={styles.markerText}
            x={INNER_LEFT + INNER_WIDTH * SIDE_POSITION[side]}
            y={box.top - 2.4}
          >
            {SIDE_LABELS[side]}
          </text>
        </>
      ) : (
        <g transform={`translate(${INNER_LEFT + INNER_WIDTH / 2}, ${middle})`}>
          <circle className={styles.spot} r="5.6" />
          <circle className={styles.spotPulse} r="5.6" />
        </g>
      )}
    </g>
  );
}

interface ZoneDrawingProps {
  /** Nombre d'articles posés, pour doser la pile (jamais écrit à l'écran). */
  load?: number;
  highlighted?: boolean;
  height?: number;
}

/**
 * Zone au sol : une palette et des cartons empilés. Le dessin doit se
 * distinguer d'un rayonnage au premier regard — il n'y a pas d'étagère à
 * chercher, on prend au sol.
 */
export function ZoneDrawing({ load = 3, highlighted = false, height = 200 }: ZoneDrawingProps) {
  const boxes = Math.min(4, Math.max(1, load));

  return (
    <svg
      className={`${styles.svg} ${highlighted ? styles.zoneLit : ''}`}
      viewBox="0 0 100 76"
      style={{ height, maxHeight: '100%' }}
      role="img"
      aria-label="Zone au sol : articles posés sur une palette"
    >
      <line className={styles.ground} x1="0" y1="74.6" x2="100" y2="74.6" />

      {/* Cartons empilés, décalés comme une vraie pile */}
      {boxes >= 3 ? <Carton x={30} y={12} w={26} h={17} tone="light" /> : null}
      {boxes >= 4 ? <Carton x={57} y={16} w={20} h={13} tone="dark" /> : null}
      <Carton x={22} y={29} w={30} h={19} tone="dark" />
      {boxes >= 2 ? <Carton x={53} y={31} w={27} h={17} tone="light" /> : null}

      {/* Palette : deux plateaux et trois dés */}
      <rect className={styles.pallet} x="12" y="48" width="76" height="4.6" rx="1" />
      <rect className={styles.palletBlock} x="15" y="52.6" width="9" height="7" rx="1" />
      <rect className={styles.palletBlock} x="45.5" y="52.6" width="9" height="7" rx="1" />
      <rect className={styles.palletBlock} x="76" y="52.6" width="9" height="7" rx="1" />
      <rect className={styles.pallet} x="12" y="59.6" width="76" height="4.6" rx="1" />

      {highlighted ? (
        <g transform="translate(50, 8)">
          <path className={styles.arrow} d="M0 9 L-6.4 -1 L6.4 -1 Z" />
        </g>
      ) : null}
    </svg>
  );
}

function Carton({
  x,
  y,
  w,
  h,
  tone,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  tone: 'light' | 'dark';
}) {
  return (
    <g>
      <rect
        className={tone === 'light' ? styles.cartonLight : styles.cartonDark}
        x={x}
        y={y}
        width={w}
        height={h}
        rx="1.4"
      />
      {/* Bande adhésive au milieu du carton */}
      <line className={styles.cartonTape} x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} />
    </g>
  );
}
