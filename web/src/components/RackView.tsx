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
import type { SlotState } from '../lib/picklist';
import type { Rack, RackDetail, SlotContent, SlotItem } from '../types';
import styles from './RackView.module.css';

/** Demande de choix d'une case (formulaire ouvert, ou déplacement en cours). */
export interface SlotSelection {
  label: string;
  onSelect: (slot: SlotContent) => void;
  onCancel?: () => void;
}

interface RackViewProps {
  rack: RackDetail;
  racks: Rack[];
  slotStates: Map<number, SlotState>;
  focusSlotId?: number | null;
  canEdit: boolean;
  selection: SlotSelection | null;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenRack: (rackId: number) => void;
  onMoveItem: (item: SlotItem, slot: SlotContent) => void;
  /** Pastille lâchée sur un autre rayonnage : il s'ouvre pour choisir la case. */
  onDropOnRack: (item: SlotItem, rackId: number) => void;
  onEditItem: (item: SlotItem) => void;
  onDeleteItem: (item: SlotItem) => void;
}

function Pellet({
  item,
  state,
  draggable,
  onEdit,
  onDelete,
}: {
  item: SlotItem;
  state: SlotState | undefined;
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
        {item.reference_display}
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

function Slot({
  slot,
  state,
  isFocus,
  selectable,
  droppable,
  children,
  onSelect,
  focusRef,
}: {
  slot: SlotContent;
  state: SlotState | undefined;
  isFocus: boolean;
  selectable: boolean;
  droppable: boolean;
  children: React.ReactNode;
  onSelect: () => void;
  focusRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot-${slot.id}`, disabled: !droppable });

  const classes = [
    styles.slot,
    state === 'lit' ? styles.slotLit : '',
    state === 'done' ? styles.slotDone : '',
    isFocus ? styles.slotFocus : '',
    isOver ? styles.slotOver : '',
    selectable ? styles.slotSelectable : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = `${slot.code}${
    slot.items.length > 0
      ? ` — ${slot.items.map((item) => item.reference_display).join(', ')}`
      : ' — vide'
  }`;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (isFocus) focusRef.current = node;
      }}
      className={classes}
      aria-label={label}
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
      <span className={styles.slotCode}>{slot.short_code}</span>
      <span className={styles.pellets}>{children}</span>
    </div>
  );
}

/**
 * Chip d'un autre rayonnage : cible de dépôt pendant un glisser, et raccourci
 * de navigation le reste du temps. Rendu en permanence, car `@dnd-kit` mesure
 * les zones de dépôt au démarrage du glisser : une cible apparue en cours de
 * route ne serait jamais détectée.
 */
function RackTarget({ rack, onOpen }: { rack: Rack; onOpen: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `rack-${rack.id}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`${styles.rackChip} ${isOver ? styles.rackChipOver : ''}`}
      title={`${rack.rack_code} ${rack.label}`}
      onClick={onOpen}
    >
      {rack.rack_code}
    </button>
  );
}

export function RackView({
  rack,
  racks,
  slotStates,
  focusSlotId = null,
  canEdit,
  selection,
  onBack,
  onPrevious,
  onNext,
  onOpenRack,
  onMoveItem,
  onDropOnRack,
  onEditItem,
  onDeleteItem,
}: RackViewProps) {
  const focusRef = useRef<HTMLDivElement>(null);
  const [dragged, setDragged] = useState<SlotItem | null>(null);

  // Une distance minimale évite qu'un simple clic déclenche un déplacement.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (focusSlotId !== null) {
      focusRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [focusSlotId, rack.id]);

  function handleDragStart(event: DragStartEvent) {
    setDragged((event.active.data.current?.item as SlotItem | undefined) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const item = event.active.data.current?.item as SlotItem | undefined;
    setDragged(null);
    if (!item || !event.over) return;

    const overId = String(event.over.id);
    if (overId.startsWith('slot-')) {
      const slot = rack.slots.find((candidate) => candidate.id === Number(overId.slice(5)));
      if (slot && !slot.items.some((existing) => existing.id === item.id)) onMoveItem(item, slot);
      return;
    }
    if (overId.startsWith('rack-')) {
      onDropOnRack(item, Number(overId.slice(5)));
    }
  }

  // Étagère 1 en bas : on affiche donc la plus haute en premier.
  const shelves: SlotContent[][] = [];
  for (let shelf = rack.shelves_count; shelf >= 1; shelf -= 1) {
    shelves.push(
      rack.slots
        .filter((slot) => slot.shelf_index === shelf)
        .sort((a, b) => a.slot_index - b.slot_index),
    );
  }

  const otherRacks = racks.filter((candidate) => candidate.id !== rack.id);

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
          </h3>
          <button
            type="button"
            className={styles.button}
            onClick={onPrevious}
            disabled={!onPrevious}
            aria-label="Rayonnage précédent"
            title="Rayonnage précédent"
          >
            ◀
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={onNext}
            disabled={!onNext}
            aria-label="Rayonnage suivant"
            title="Rayonnage suivant"
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

        {otherRacks.length > 0 ? (
          <p className={`${styles.rackStrip} ${dragged ? styles.rackStripActive : ''}`}>
            <span className={styles.rackStripLabel}>
              {dragged ? 'Déposer sur un autre rayonnage :' : 'Autres rayonnages :'}
            </span>
            {otherRacks.map((candidate) => (
              <RackTarget
                key={candidate.id}
                rack={candidate}
                onOpen={() => onOpenRack(candidate.id)}
              />
            ))}
          </p>
        ) : null}

        <div className={styles.shelves}>
          {shelves.map((slots, index) => (
            <div
              key={rack.shelves_count - index}
              className={styles.shelf}
              style={{
                gridTemplateColumns: `34px repeat(${rack.slots_per_shelf}, minmax(0, 1fr))`,
              }}
            >
              <span className={styles.shelfLabel}>E{rack.shelves_count - index}</span>
              {slots.map((slot) => (
                <Slot
                  key={slot.id}
                  slot={slot}
                  state={slotStates.get(slot.id)}
                  isFocus={focusSlotId === slot.id}
                  selectable={selection !== null}
                  droppable={canEdit}
                  focusRef={focusRef}
                  onSelect={() => selection?.onSelect(slot)}
                >
                  {slot.items.map((item) => (
                    <Pellet
                      key={item.id}
                      item={item}
                      state={slotStates.get(slot.id)}
                      draggable={canEdit && selection === null}
                      onEdit={() => onEditItem(item)}
                      onDelete={() => onDeleteItem(item)}
                    />
                  ))}
                </Slot>
              ))}
            </div>
          ))}
        </div>

        <p className={styles.legend}>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchLit}`} /> à prélever
          </span>
          <span className={styles.legendItem}>
            <span className={`${styles.swatch} ${styles.swatchDone}`} /> validé
          </span>
          <span className={styles.legendItem}>Étagère 1 = en bas · case 1 = à gauche</span>
          {canEdit ? (
            <span className={styles.legendItem}>Glissez une pastille pour déplacer un article</span>
          ) : null}
        </p>
      </div>

      <DragOverlay>
        {dragged ? (
          <span className={`${styles.pellet} ${styles.pelletOverlay}`}>
            {dragged.reference_display}
          </span>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
