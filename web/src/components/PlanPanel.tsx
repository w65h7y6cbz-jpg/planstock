import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { RackHighlight, SlotState } from '../lib/picklist';
import type { Rack, RackDetail, SlotContent, SlotItem } from '../types';
import { RackView, type SlotSelection } from './RackView';
import { TopView } from './TopView';
import styles from './PlanPanel.module.css';

const AUTO_OPEN_KEY = 'planstock.auto_open_rack';

/**
 * Demande d'ouverture de la vue de face.
 * `force` distingue une action explicite (clic sur un emplacement, dépôt sur un
 * rayonnage) d'un ajout à la liste, soumis au réglage « Ouvrir automatiquement ».
 * `nonce` permet de redemander deux fois de suite la même case.
 */
export interface PlanFocus {
  rackId: number;
  slotId: number | null;
  force: boolean;
  nonce: number;
}

interface PlanPanelProps {
  racks: Rack[];
  planWidth: number;
  planHeight: number;
  slotStates: Map<number, SlotState>;
  highlight: Map<number, RackHighlight>;
  focus: PlanFocus | null;
  loading: boolean;
  canEdit: boolean;
  selection: SlotSelection | null;
  /** Incrémenté après chaque modification d'article pour recharger le rayonnage. */
  refreshToken: number;
  onMoveItem: (item: SlotItem, slot: SlotContent) => void;
  onDropOnRack: (item: SlotItem, rackId: number) => void;
  onEditItem: (item: SlotItem) => void;
  onDeleteItem: (item: SlotItem) => void;
}

function readAutoOpen(): boolean {
  try {
    return localStorage.getItem(AUTO_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function PlanPanel({
  racks,
  planWidth,
  planHeight,
  slotStates,
  highlight,
  focus,
  loading,
  canEdit,
  selection,
  refreshToken,
  onMoveItem,
  onDropOnRack,
  onEditItem,
  onDeleteItem,
}: PlanPanelProps) {
  const [openRackId, setOpenRackId] = useState<number | null>(null);
  const [rackDetail, setRackDetail] = useState<RackDetail | null>(null);
  const [focusSlotId, setFocusSlotId] = useState<number | null>(null);
  const [autoOpen, setAutoOpen] = useState(readAutoOpen);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_OPEN_KEY, autoOpen ? '1' : '0');
    } catch {
      // Sans stockage local, le réglage vaut pour la session.
    }
  }, [autoOpen]);

  const openRack = useCallback((rackId: number, slotId: number | null = null) => {
    setOpenRackId(rackId);
    setFocusSlotId(slotId);
  }, []);

  useEffect(() => {
    if (!focus || (!focus.force && !autoOpen)) return;
    openRack(focus.rackId, focus.slotId);
  }, [focus, autoOpen, openRack]);

  // Détail du rayonnage ouvert ; rechargé après chaque modification du stock.
  useEffect(() => {
    if (openRackId === null) {
      setRackDetail(null);
      return;
    }
    let cancelled = false;
    void api.racks
      .get(openRackId)
      .then((detail) => !cancelled && setRackDetail(detail))
      .catch(() => !cancelled && setRackDetail(null));
    return () => {
      cancelled = true;
    };
  }, [openRackId, racks, refreshToken]);

  const ordered = [...racks].sort((a, b) => a.code - b.code);
  const currentIndex = ordered.findIndex((rack) => rack.id === openRackId);
  const previous = currentIndex > 0 ? ordered[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < ordered.length - 1 ? ordered[currentIndex + 1] : null;

  const pending = [...highlight.values()].reduce((total, marks) => total + marks.pending, 0);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Plan du local</h2>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={autoOpen}
            onChange={(event) => setAutoOpen(event.target.checked)}
          />
          Ouvrir automatiquement
        </label>
        <span className={styles.meta}>
          {racks.length} rayonnage(s)
          {pending > 0 ? ` · ${pending} à prélever` : ''}
        </span>
      </div>

      {loading ? (
        <p className={styles.loading}>Chargement du plan…</p>
      ) : rackDetail ? (
        <RackView
          rack={rackDetail}
          racks={ordered}
          slotStates={slotStates}
          focusSlotId={focusSlotId}
          canEdit={canEdit}
          selection={selection}
          onBack={() => setOpenRackId(null)}
          onPrevious={previous ? () => openRack(previous.id) : undefined}
          onNext={next ? () => openRack(next.id) : undefined}
          onOpenRack={(rackId) => openRack(rackId)}
          onMoveItem={onMoveItem}
          onDropOnRack={onDropOnRack}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteItem}
        />
      ) : (
        <TopView
          racks={ordered}
          planWidth={planWidth}
          planHeight={planHeight}
          selectedRackId={openRackId}
          highlight={highlight}
          onSelectRack={(rack) => openRack(rack.id)}
        />
      )}
    </div>
  );
}
