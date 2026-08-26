import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { LocationState } from '../lib/picklist';
import type { Rack, RackDetail, Shelf, ShelfItem } from '../types';
import styles from './RackView.module.css';

/** Cible d'un déplacement : une étagère ou une zone. */
export type MoveTarget = { shelf_id: number } | { zone_id: number };

/** Demande de choix d'un emplacement (formulaire ouvert, ou déplacement en cours). */
export interface LocationSelection {
  label: string;
  onSelectShelf: (shelf: Shelf) => void;
  onSelectZone?: (zone: Rack) => void;
  onCancel?: () => void;
}

interface RackViewProps {
  rack: RackDetail;
  racks: Rack[];
  /** États par code d'emplacement (`R03-E2`, `Z02`). */
  locationStates: Map<string, LocationState>;
  /** Emplacement à mettre en évidence brièvement (dernière référence ajoutée). */
  focusCode?: string | null;
  /** Référence à mettre en avant dans la bande. */
  focusReference?: string | null;
  canEdit: boolean;
  selection: LocationSelection | null;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenRack: (rackId: number) => void;
  onMoveItem: (item: ShelfItem, target: MoveTarget, code: string) => void;
  onEditItem: (item: ShelfItem) => void;
  onDeleteItem: (item: ShelfItem) => void;
}

function Pellet({
  item,
  state,
  highlighted,
  draggable,
  onEdit,
  onDelete,
}: {
  item: ShelfItem;
  state: LocationState | undefined;
  highlighted: boolean;
  draggable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
    disabled: !draggable,
  });

  const classes = [
    styles.pellet,
    state === 'lit' ? styles.pelletLit : '',
    state === 'done' ? styles.pelletDone : '',
    highlighted ? styles.pelletHighlighted : '',
    isDragging ? styles.pelletDragging : '',
    draggable ? styles.pelletDraggable : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={styles.pelletWrapper}>
      <span
        ref={setNodeRef}
        className={classes}
        title={`${item.reference_display} — ${item.designation}`}
        onContextMenu={(event) => {
          if (!draggable) return;
          event.preventDefault();
          setMenuOpen((open) => !open);
        }}
        {...listeners}
        {...attributes}
      >
        <span className={styles.pelletRef}>{item.reference_display}</span>
        {item.designation ? (
          <span className={styles.pelletDesignation}>{item.designation}</span>
        ) : null}
      </span>

      {draggable ? (
        <button
          type="button"
          className={styles.pelletMenuButton}
          aria-label={`Actions sur ${item.reference_display}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          ⋯
        </button>
      ) : null}

      {menuOpen ? (
        <span className={styles.pelletMenu}>
          <button
            type="button"
            className={styles.pelletMenuItem}
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
          >
            Modifier
          </button>
          <button
            type="button"
            className={`${styles.pelletMenuItem} ${styles.pelletMenuDanger}`}
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
          >
            Supprimer
          </button>
        </span>
      ) : null}
    </span>
  );
}

/** Bande horizontale d'une étagère : elle s'étire selon le nombre de pastilles. */
function ShelfBand({
  shelf,
  state,
  isFocus,
  selectable,
  droppable,
  children,
  onSelect,
  focusRef,
}: {
  shelf: Shelf;
  state: LocationState | undefined;
  isFocus: boolean;
  selectable: boolean;
  droppable: boolean;
  children: React.ReactNode;
  onSelect: () => void;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `shelf-${shelf.id}`, disabled: !droppable });

  const classes = [
    styles.band,
    state === 'lit' ? styles.bandLit : '',
    state === 'done' ? styles.bandDone : '',
    isFocus ? styles.bandFocus : '',
    isOver ? styles.bandOver : '',
    selectable ? styles.bandSelectable : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (isFocus) focusRef.current = node;
      }}
      className={classes}
      aria-label={`${shelf.code} — ${
        shelf.items.length > 0
          ? shelf.items.map((item) => item.reference_display).join(', ')
          : 'vide'
      }`}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <span className={styles.bandLabel}>
        <span className={styles.bandCode}>{shelf.short_code}</span>
        <span className={styles.bandCount}>{shelf.items.length}</span>
      </span>
      <span className={styles.pellets}>
        {shelf.items.length === 0 ? <span className={styles.bandEmpty}>vide</span> : children}
      </span>
    </div>
  );
}

/** Contenu d'une zone : pas d'étagère, une simple liste d'articles posés dessus. */
function ZoneItems({
  rack,
  state,
  focusReference,
  droppable,
  selectable,
  onSelect,
  onEditItem,
  onDeleteItem,
}: {
  rack: RackDetail;
  state: LocationState | undefined;
  focusReference: string | null;
  droppable: boolean;
  selectable: boolean;
  onSelect: () => void;
  onEditItem: (item: ShelfItem) => void;
  onDeleteItem: (item: ShelfItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `rack-${rack.id}`, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      className={`${styles.zoneItems} ${isOver ? styles.bandOver : ''} ${
        state === 'lit' ? styles.bandLit : ''
      } ${state === 'done' ? styles.bandDone : ''} ${selectable ? styles.bandSelectable : ''}`}
      role={selectable ? 'button' : undefined}
      tabIndex={selectable ? 0 : undefined}
      aria-label={`${rack.rack_code} — ${
        rack.items.length > 0
          ? rack.items.map((item) => item.reference_display).join(', ')
          : 'vide'
      }`}
      onClick={selectable ? onSelect : undefined}
      onKeyDown={
        selectable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      {rack.items.length === 0 ? (
        <p className={styles.zoneEmpty}>Aucun article posé sur cette zone.</p>
      ) : (
        rack.items.map((item) => (
          <Pellet
            key={item.id}
            item={item}
            state={state}
            highlighted={focusReference === item.reference}
            draggable={droppable && !selectable}
            onEdit={() => onEditItem(item)}
            onDelete={() => onDeleteItem(item)}
          />
        ))
      )}
    </div>
  );
}

/** Chip d'un autre emplacement : cible de dépôt et raccourci de navigation. */
function RackTarget({
  rack,
  dragging,
  onOpen,
}: {
  rack: Rack;
  dragging: boolean;
  onOpen: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `rack-${rack.id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.rackChip} ${rack.is_zone ? styles.rackChipZone : ''} ${
        isOver ? styles.rackChipOver : ''
      }`}
      title={
        rack.is_zone && dragging
          ? `Poser sur ${rack.rack_code} ${rack.label}`
          : `${rack.rack_code} ${rack.label}`
      }
      onClick={onOpen}
    >
      {rack.rack_code}
    </button>
  );
}

export function RackView({
  rack,
  racks,
  locationStates,
  focusCode = null,
  focusReference = null,
  canEdit,
  selection,
  onBack,
  onPrevious,
  onNext,
  onOpenRack,
  onMoveItem,
  onEditItem,
  onDeleteItem,
}: RackViewProps) {
  const focusRef = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<ShelfItem | null>(null);

  // Une distance minimale évite qu'un simple clic déclenche un déplacement.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (focusCode) focusRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focusCode, rack.id]);

  function handleDragStart(event: DragStartEvent) {
    setDragged((event.active.data.current?.item as ShelfItem | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as ShelfItem | undefined;
    setDragged(null);
    if (!item || !event.over) return;

    const overId = String(event.over.id);
    if (overId.startsWith('shelf-')) {
      const shelf = rack.shelves.find((candidate) => candidate.id === Number(overId.slice(6)));
      if (shelf && !shelf.items.some((existing) => existing.id === item.id)) {
        onMoveItem(item, { shelf_id: shelf.id }, shelf.code);
      }
      return;
    }
    if (overId.startsWith('rack-')) {
      const target = racks.find((candidate) => candidate.id === Number(overId.slice(5)));
      if (!target) return;
      // Une zone n'a pas d'étagère : le dépôt y range directement l'article.
      if (target.is_zone) onMoveItem(item, { zone_id: target.id }, target.rack_code);
      else onOpenRack(target.id);
    }
  }

  // Étagère 1 en haut : la vue de face les liste dans l'ordre naturel.
  const shelves = [...rack.shelves].sort((a, b) => a.shelf_index - b.shelf_index);
  const others = racks.filter((candidate) => candidate.id !== rack.id);

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={styles.view}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.button} onClick={onBack}>
            ← Plan
          </button>
          <h3 className={styles.title}>
            <span className={styles.code}>{rack.rack_code}</span>
            <span className={styles.label}>{rack.label || 'sans libellé'}</span>
            {rack.aisle ? <span className={styles.aisle}>{rack.aisle}</span> : null}
          </h3>
          <button
            type="button"
            className={styles.button}
            onClick={onPrevious}
            disabled={!onPrevious}
            aria-label="Emplacement précédent"
            title="Emplacement précédent"
          >
            ◀
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onNext}
            disabled={!onNext}
            aria-label="Emplacement suivant"
            title="Emplacement suivant"
          >
            ▶
          </button>
        </div>

        {selection ? (
          <p className={styles.selectionBanner}>
            <span>{selection.label}</span>
            {selection.onCancel ? (
              <button type="button" className={styles.button} onClick={selection.onCancel}>
                Annuler
              </button>
            ) : null}
          </p>
        ) : null}

        {others.length > 0 ? (
          <p className={`${styles.rackStrip} ${dragged ? styles.rackStripActive : ''}`}>
            <span className={styles.rackStripLabel}>
              {dragged ? 'Déposer sur :' : 'Autres emplacements :'}
            </span>
            {others.map((candidate) => (
              <RackTarget
                key={candidate.id}
                rack={candidate}
                dragging={dragged !== null}
                onOpen={() => onOpenRack(candidate.id)}
              />
            ))}
          </p>
        ) : null}

        {rack.is_zone ? (
          <ZoneItems
            rack={rack}
            state={locationStates.get(rack.rack_code)}
            focusReference={focusReference}
            droppable={canEdit}
            selectable={selection !== null}
            onSelect={() => selection?.onSelectZone?.(rack)}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
          />
        ) : (
        <div className={styles.bands}>
          {shelves.map((shelf) => (
            <ShelfBand
              key={shelf.id}
              shelf={shelf}
              state={locationStates.get(shelf.code)}
              isFocus={focusCode === shelf.code}
              selectable={selection !== null}
              droppable={canEdit}
              focusRef={focusRef}
              onSelect={() => selection?.onSelectShelf(shelf)}
            >
              {shelf.items.map((item) => (
                <Pellet
                  key={item.id}
                  item={item}
                  state={locationStates.get(shelf.code)}
                  highlighted={focusReference === item.reference}
                  draggable={canEdit && selection === null}
                  onEdit={() => onEditItem(item)}
                  onDelete={() => onDeleteItem(item)}
                />
              ))}
            </ShelfBand>
          ))}
        </div>
        )}

        <p className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchLit}`} /> à prélever
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchDone}`} /> validé
          </span>
          <span className={styles.legendItem}>Étagère 1 = en haut</span>
          {canEdit ? (
            <span className={styles.legendItem}>
              Glissez une pastille vers une autre étagère ou une zone
            </span>
          ) : null}
        </p>
      </div>

      <DragOverlay>
        {dragged ? (
          <span className={`${styles.pellet} ${styles.pelletOverlay}`}>
            <span className={styles.pelletRef}>{dragged.reference_display}</span>
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
