import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { api } from '../api';
import { aisleColor } from '../lib/labels';
import type { RouteStop } from '../lib/picklist';
import type { Landmark, Rack, RackDetail, ShelfItem, Site } from '../types';
import { PlanView } from './PlanView';
import { RackElevation, ZoneDrawing, type ShelfMark } from './RackElevation';
import styles from './PlanScreen.module.css';

/**
 * Plan du local en plein écran.
 *
 * Cliquer un meuble l'ouvre dans un panneau à droite : le dessin, et les
 * références de l'étagère qu'on déplie. De là, une référence se glisse sur un
 * autre meuble du plan. Un rayonnage ayant plusieurs étagères, le dépôt
 * demande sur laquelle poser l'article — une zone, elle, reçoit directement.
 */

interface PlanScreenProps {
  site: Site;
  racks: Rack[];
  landmarks: Landmark[];
  focusRackId: number | null;
  route: RouteStop[];
  locationStates: Map<string, 'lit' | 'done'>;
  canEdit: boolean;
  /** Incrémenté après chaque modification du stock, pour recharger le panneau. */
  refreshToken: number;
  onClose: () => void;
  onMoveItem: (item: ShelfItem, target: { shelf_id?: number; zone_id?: number }, code: string) => void;
}

export function PlanScreen({
  site,
  racks,
  landmarks,
  focusRackId,
  route,
  locationStates,
  canEdit,
  refreshToken,
  onClose,
  onMoveItem,
}: PlanScreenProps) {
  const [openRackId, setOpenRackId] = useState<number | null>(focusRackId);
  const [detail, setDetail] = useState<RackDetail | null>(null);
  const [openShelf, setOpenShelf] = useState<number | null>(null);
  const [dragged, setDragged] = useState<ShelfItem | null>(null);
  const [pending, setPending] = useState<{ item: ShelfItem; rack: Rack } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (openRackId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void api.racks
      .get(openRackId)
      .then((loaded) => !cancelled && setDetail(loaded))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [openRackId, refreshToken]);

  // L'étagère dépliée par défaut : la première qui porte quelque chose.
  useEffect(() => {
    if (!detail || detail.is_zone) return;
    setOpenShelf((current) => {
      if (current !== null && detail.shelves.some((shelf) => shelf.shelf_index === current)) {
        return current;
      }
      return detail.shelves.find((shelf) => shelf.items.length > 0)?.shelf_index ?? null;
    });
  }, [detail]);

  const openRack = useCallback((rack: Rack) => {
    setOpenRackId(rack.id);
  }, []);

  function onDragStart(event: DragStartEvent) {
    setDragged((event.active.data.current as { item?: ShelfItem } | undefined)?.item ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const item = dragged;
    setDragged(null);
    if (!item || !event.over) return;

    const target = (event.over.data.current as { rack?: Rack } | undefined)?.rack;
    if (!target) return;

    if (target.is_zone) {
      onMoveItem(item, { zone_id: target.id }, target.rack_code);
      return;
    }
    // Un rayonnage a plusieurs étagères : il faut dire laquelle.
    setOpenRackId(target.id);
    setPending({ item, rack: target });
  }

  function chooseShelf(shelfIndex: number) {
    if (!pending || !detail) {
      setOpenShelf(shelfIndex);
      return;
    }
    const shelf = detail.shelves.find((candidate) => candidate.shelf_index === shelfIndex);
    if (!shelf) return;
    onMoveItem(pending.item, { shelf_id: shelf.id }, shelf.code);
    setPending(null);
    setOpenShelf(shelfIndex);
  }

  const marks = new Map<number, ShelfMark>();
  if (detail && !detail.is_zone) {
    for (const shelf of detail.shelves) {
      const state = locationStates.get(shelf.code);
      if (state) marks.set(shelf.shelf_index, state);
    }
  }

  const shelfItems =
    detail && !detail.is_zone
      ? (detail.shelves.find((shelf) => shelf.shelf_index === openShelf)?.items ?? [])
      : (detail?.items ?? []);

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className={styles.screen}>
        <div className={styles.header}>
          <h1 className={styles.title}>Plan de {site.name}</h1>
          <div className={styles.headerActions}>
            {openRackId ? (
              <button
                type="button"
                className={styles.ghost}
                onClick={() => {
                  setOpenRackId(null);
                  setPending(null);
                }}
              >
                Voir tout le local
              </button>
            ) : null}
            <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer le plan">
              ×<span className={styles.closeHint}>Échap</span>
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <div className={styles.plan} data-tour="planLocal">
            {racks.length === 0 ? (
              <p className={styles.empty}>
                Ce local n’a encore aucun rayonnage. Ouvre « Rayonnages et zones » pour le dessiner.
              </p>
            ) : (
              <PlanView
                racks={racks}
                landmarks={landmarks}
                planWidth={site.plan_width}
                planHeight={site.plan_height}
                outline={site.outline}
                // Le cadrage suit le meuble ouvert : « Voir tout le local »
                // le remet à zéro et la vue revient sur le local entier.
                focusRackId={openRackId}
                selectedRackId={openRackId}
                route={route}
                dropEnabled={canEdit}
                onSelectRack={openRack}
              />
            )}
          </div>

          {detail ? (
            <aside className={styles.panel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelCode}>{detail.rack_code}</span>
                <span className={styles.panelLabel}>{detail.label || 'Sans nom'}</span>
                {detail.aisle ? (
                  <span className={styles.panelAisle} style={{ color: aisleColor(detail.aisle) }}>
                    {detail.aisle}
                  </span>
                ) : null}
              </div>

              {pending ? (
                <p className={styles.pending}>
                  Sur quelle étagère poser <strong>{pending.item.reference_display}</strong> ?
                  <button type="button" className={styles.pendingCancel} onClick={() => setPending(null)}>
                    Annuler
                  </button>
                </p>
              ) : null}

              <div className={styles.drawing}>
                {detail.is_zone ? (
                  <ZoneDrawing load={detail.items.length} height={190} />
                ) : (
                  <RackElevation
                    shelvesCount={detail.shelves_count}
                    selected={openShelf}
                    marks={marks}
                    onSelectShelf={chooseShelf}
                    height={300}
                  />
                )}
              </div>

              <p className={styles.panelHint}>
                {detail.is_zone
                  ? `${detail.items.length} article(s) posé(s)`
                  : pending
                    ? 'Clique l’étagère de destination.'
                    : 'Clique une étagère pour voir ses références.'}
              </p>

              <div className={styles.items}>
                {shelfItems.length === 0 ? (
                  <p className={styles.itemsEmpty}>
                    {detail.is_zone ? 'Rien de posé ici.' : 'Étagère vide.'}
                  </p>
                ) : (
                  shelfItems.map((item) => (
                    <ReferenceChip key={item.id} item={item} draggable={canEdit} />
                  ))
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragged ? <span className={styles.chipOverlay}>{dragged.reference_display}</span> : null}
      </DragOverlay>
    </DndContext>
  );
}

function ReferenceChip({ item, draggable }: { item: ShelfItem; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
    disabled: !draggable,
  });

  return (
    <span
      ref={setNodeRef}
      className={`${styles.chip} ${draggable ? styles.chipDraggable : ''} ${
        isDragging ? styles.chipDragging : ''
      }`}
      title={item.designation}
      {...listeners}
      {...attributes}
    >
      <span className={styles.chipRef}>{item.reference_display}</span>
      {item.designation ? <span className={styles.chipLabel}>{item.designation}</span> : null}
    </span>
  );
}
