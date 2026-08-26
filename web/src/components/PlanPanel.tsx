import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { RackHighlight, SlotState } from '../lib/picklist';
import type { Location, Rack, RackDetail } from '../types';
import { RackView } from './RackView';
import { TopView } from './TopView';
import styles from './PlanPanel.module.css';

const AUTO_OPEN_KEY = 'planstock.auto_open_rack';

/**
 * Demande d'ouverture de la vue de face.
 * `force` distingue un clic explicite sur un emplacement (qui ouvre toujours)
 * d'un ajout à la liste (soumis au réglage « Ouvrir automatiquement »).
 * `nonce` permet de redemander la même case deux fois de suite.
 */
export interface PlanFocus {
  location: Location;
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

  // Une référence physique ajoutée ouvre son rayonnage sur la bonne case.
  useEffect(() => {
    if (!focus || (!focus.force && !autoOpen)) return;
    openRack(focus.location.rack_id, focus.location.slot_id);
  }, [focus, autoOpen, openRack]);

  // Détail du rayonnage ouvert ; rechargé quand le stock change.
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
  }, [openRackId, racks]);

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
          slotStates={slotStates}
          focusSlotId={focusSlotId}
          onBack={() => setOpenRackId(null)}
          onPrevious={previous ? () => openRack(previous.id) : undefined}
          onNext={next ? () => openRack(next.id) : undefined}
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
