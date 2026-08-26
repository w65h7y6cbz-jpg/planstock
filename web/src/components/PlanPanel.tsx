import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { LocationState, RackHighlight } from '../lib/picklist';
import type { Rack, RackDetail, ShelfItem } from '../types';
import { RackView, type LocationSelection, type MoveTarget } from './RackView';
import { TopView } from './TopView';
import styles from './PlanPanel.module.css';

const AUTO_OPEN_KEY = 'planstock.auto_open_rack';

/**
 * Demande d'ouverture d'un emplacement.
 * `force` distingue une action explicite (clic sur un emplacement, dépôt) d'un
 * ajout à la liste, soumis au réglage « Ouvrir automatiquement ».
 * `nonce` permet de redemander deux fois de suite le même emplacement.
 */
export interface PlanFocus {
  rackId: number;
  /** Code de l'emplacement à mettre en évidence (`R03-E2`, `Z02`). */
  code: string | null;
  /** Référence normalisée de l'article à mettre en avant. */
  reference: string | null;
  force: boolean;
  nonce: number;
}

interface PlanPanelProps {
  racks: Rack[];
  planWidth: number;
  planHeight: number;
  locationStates: Map<string, LocationState>;
  highlight: Map<number, RackHighlight>;
  focus: PlanFocus | null;
  loading: boolean;
  canEdit: boolean;
  selection: LocationSelection | null;
  /** Incrémenté après chaque modification d'article pour recharger l'emplacement. */
  refreshToken: number;
  onMoveItem: (item: ShelfItem, target: MoveTarget, code: string) => void;
  onEditItem: (item: ShelfItem) => void;
  onDeleteItem: (item: ShelfItem) => void;
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
  locationStates,
  highlight,
  focus,
  loading,
  canEdit,
  selection,
  refreshToken,
  onMoveItem,
  onEditItem,
  onDeleteItem,
}: PlanPanelProps) {
  const [openRackId, setOpenRackId] = useState<number | null>(null);
  const [rackDetail, setRackDetail] = useState<RackDetail | null>(null);
  const [focusCode, setFocusCode] = useState<string | null>(null);
  const [focusReference, setFocusReference] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(readAutoOpen);

  useEffect(() => {
    try {
      localStorage.setItem(AUTO_OPEN_KEY, autoOpen ? '1' : '0');
    } catch {
      // Sans stockage local, le réglage vaut pour la session.
    }
  }, [autoOpen]);

  const openRack = useCallback(
    (rackId: number, code: string | null = null, reference: string | null = null) => {
      setOpenRackId(rackId);
      setFocusCode(code);
      setFocusReference(reference);
    },
    [],
  );

  useEffect(() => {
    if (!focus || (!focus.force && !autoOpen)) return;
    openRack(focus.rackId, focus.code, focus.reference);
  }, [focus, autoOpen, openRack]);

  // Détail de l'emplacement ouvert ; rechargé après chaque modification du stock.
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

  const ordered = [...racks].sort((a, b) =>
    a.kind === b.kind ? a.code - b.code : a.kind === 'rack' ? -1 : 1,
  );
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
          {racks.filter((rack) => !rack.is_zone).length} rayonnage(s) ·{' '}
          {racks.filter((rack) => rack.is_zone).length} zone(s)
          {pending > 0 ? ` · ${pending} à prélever` : ''}
        </span>
      </div>

      {loading ? (
        <p className={styles.loading}>Chargement du plan…</p>
      ) : rackDetail ? (
        <RackView
          rack={rackDetail}
          racks={ordered}
          locationStates={locationStates}
          focusCode={focusCode}
          focusReference={focusReference}
          canEdit={canEdit}
          selection={selection}
          onBack={() => setOpenRackId(null)}
          onPrevious={previous ? () => openRack(previous.id) : undefined}
          onNext={next ? () => openRack(next.id) : undefined}
          onOpenRack={(rackId) => openRack(rackId)}
          onMoveItem={onMoveItem}
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
          onSelectRack={(rack) => {
            // Une zone peut être choisie directement depuis la vue de dessus.
            if (rack.is_zone && selection?.onSelectZone) selection.onSelectZone(rack);
            else openRack(rack.id);
          }}
        />
      )}
    </div>
  );
}
