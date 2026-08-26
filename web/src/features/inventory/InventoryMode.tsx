import { useCallback, useMemo, useRef, useState } from 'react';
import { ApiError, api, type RackPayload } from '../../api';
import { PlanPanel } from '../../components/PlanPanel';
import type { SlotSelection } from '../../components/RackView';
import type { Item, Rack, SlotContent, User } from '../../types';
import { RackWizard } from './RackWizard';
import styles from './InventoryMode.module.css';

interface InventoryModeProps {
  currentUser: User | null;
  /** Le mode couvre tout l'écran : le choix du prénom doit rester accessible ici. */
  users: User[];
  onSelectUser: (id: number | null) => void;
  racks: Rack[];
  racksLoading: boolean;
  planWidth: number;
  planHeight: number;
  onCreateRacks: (racks: RackPayload[]) => Promise<void>;
  /** Prévient l'écran principal qu'un article a été enregistré. */
  onItemSaved: () => void;
  onClose: () => void;
}

interface SavedEntry {
  reference: string;
  designation: string;
  code: string | null;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

/**
 * Mode Inventaire initial : saisir réf → désignation → cliquer la case → suivant.
 * La dernière case reste sélectionnée pour enchaîner les articles d'une même case.
 */
export function InventoryMode({
  currentUser,
  users,
  onSelectUser,
  racks,
  racksLoading,
  planWidth,
  planHeight,
  onCreateRacks,
  onItemSaved,
  onClose,
}: InventoryModeProps) {
  const [reference, setReference] = useState('');
  const [designation, setDesignation] = useState('');
  const [targetSlot, setTargetSlot] = useState<SlotContent | null>(null);
  const [awaitingSlot, setAwaitingSlot] = useState(false);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const referenceRef = useRef<HTMLInputElement>(null);

  const emptySlotStates = useMemo(() => new Map(), []);
  const emptyHighlight = useMemo(() => new Map(), []);

  const userPicker = (
    <label className={styles.userPicker}>
      Technicien
      <select
        value={currentUser?.id ?? ''}
        aria-label="Technicien qui saisit l’inventaire"
        onChange={(event) =>
          onSelectUser(event.target.value === '' ? null : Number(event.target.value))
        }
      >
        <option value="">— Choisir un prénom —</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.first_name}
          </option>
        ))}
      </select>
    </label>
  );

  const backToReference = useCallback(() => {
    setReference('');
    setDesignation('');
    setError(null);
    referenceRef.current?.focus();
  }, []);

  /** Enregistrement effectif. La case est passée explicitement : au moment du
   *  clic sur le plan, l'état `targetSlot` n'est pas encore à jour. */
  const persist = useCallback(
    async (kind: 'physical' | 'service', slot: SlotContent | null) => {
      if (!currentUser) {
        setError('Sélectionnez votre prénom avant de saisir l’inventaire.');
        return;
      }
      try {
        const item: Item = await api.items.create(currentUser.id, {
          reference: reference.trim().toUpperCase(),
          designation: designation.trim(),
          kind,
          slot_id: kind === 'physical' ? (slot?.id ?? null) : null,
        });

        setSaved((current) => [
          {
            reference: item.reference_display,
            designation: item.designation,
            code: item.locations[0]?.code ?? null,
          },
          ...current,
        ]);
        setAwaitingSlot(false);
        setRefreshToken((token) => token + 1);
        onItemSaved();
        backToReference();
      } catch (cause) {
        setError(messageOf(cause, 'Enregistrement impossible.'));
        referenceRef.current?.focus();
      }
    },
    [currentUser, reference, designation, onItemSaved, backToReference],
  );

  const save = useCallback(
    async (kind: 'physical' | 'service') => {
      if (!reference.trim()) {
        setError('La référence est obligatoire.');
        referenceRef.current?.focus();
        return;
      }
      if (kind === 'physical' && !targetSlot) {
        // Aucune case encore choisie : on attend un clic sur le plan.
        setAwaitingSlot(true);
        setError(null);
        return;
      }
      await persist(kind, targetSlot);
    },
    [reference, targetSlot, persist],
  );

  /** Un clic sur une case la sélectionne, et enregistre si on l'attendait. */
  const selectSlot = useCallback(
    (slot: SlotContent) => {
      setTargetSlot(slot);
      setError(null);

      if (awaitingSlot && reference.trim()) {
        void persist('physical', slot);
        return;
      }
      setAwaitingSlot(false);
      // Le clic a déplacé le focus sur la case : on le rend au champ Référence
      // pour que la frappe suivante ne se perde pas dans le plan.
      referenceRef.current?.focus();
    },
    [awaitingSlot, reference, persist],
  );

  const selection: SlotSelection = useMemo(
    () => ({
      label: awaitingSlot
        ? `Cliquez la case où ranger ${reference.trim().toUpperCase() || 'cet article'}.`
        : 'Cliquez une case pour changer la destination.',
      onSelect: selectSlot,
    }),
    [awaitingSlot, reference, selectSlot],
  );

  async function createRacks(payloads: RackPayload[]) {
    setError(null);
    try {
      await onCreateRacks(payloads);
    } catch (cause) {
      setError(messageOf(cause, 'Création du plan impossible.'));
    }
  }

  if (!racksLoading && racks.length === 0) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            PlanStock
            <span className={styles.subtitle}>Inventaire initial</span>
          </h1>
          <span className={styles.headerSpacer} />
          {userPicker}
          <button type="button" className={styles.button} onClick={onClose}>
            Terminer
          </button>
        </header>
        <RackWizard onCreate={createRacks} onSkip={onClose} error={error} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          PlanStock
          <span className={styles.subtitle}>Inventaire initial</span>
        </h1>
        <span className={styles.counter}>
          {saved.length} article{saved.length > 1 ? 's' : ''} enregistré
          {saved.length > 1 ? 's' : ''} cette session
        </span>
        {userPicker}
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
          Terminer
        </button>
      </header>

      <main className={styles.main}>
        <section className={styles.column} aria-label="Saisie des articles">
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Article à enregistrer</h2>

            {!currentUser ? (
              <p className={styles.warning}>
                Choisissez votre prénom en haut à droite : l’inventaire trace qui enregistre quoi.
              </p>
            ) : null}
            {error ? <p className={styles.error}>{error}</p> : null}

            <label className={`${styles.field} ${styles.reference}`}>
              Référence
              <input
                ref={referenceRef}
                type="text"
                value={reference}
                placeholder="ARB123"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                onChange={(event) => setReference(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    backToReference();
                  }
                }}
              />
            </label>

            <label className={styles.field}>
              Désignation
              <input
                type="text"
                value={designation}
                placeholder="Imprimante A3 couleur"
                autoComplete="off"
                onChange={(event) => setDesignation(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void save('physical');
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    backToReference();
                  }
                }}
              />
            </label>

            <div className={styles.target}>
              <span className={styles.targetLabel}>
                {awaitingSlot ? 'En attente d’un clic sur le plan' : 'Case de destination'}
              </span>
              <span
                className={`${styles.targetCode} ${targetSlot ? '' : styles.targetEmpty} ${
                  awaitingSlot ? styles.awaiting : ''
                }`}
              >
                {targetSlot?.code ?? 'à choisir'}
              </span>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.button}
                disabled={!currentUser}
                onClick={() => void save('service')}
              >
                Marquer comme service
              </button>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                disabled={!currentUser}
                onClick={() => void save('physical')}
              >
                Enregistrer
              </button>
            </div>

            <p className={styles.hint}>
              <span className={styles.kbd}>Tab</span> pour passer à la désignation,{' '}
              <span className={styles.kbd}>Entrée</span> pour enregistrer. La dernière case reste
              sélectionnée : <span className={styles.kbd}>Entrée</span> seul range l’article suivant
              au même endroit. Cliquez une autre case du plan pour changer de destination.
            </p>
          </div>

          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <h2 className={styles.panelTitle}>Enregistrés cette session</h2>
            {saved.length === 0 ? (
              <p className={styles.empty}>Aucun article pour l’instant.</p>
            ) : (
              <ul className={styles.recent}>
                {saved.map((entry, index) => (
                  <li key={`${entry.reference}-${index}`} className={styles.recentRow}>
                    <span className={styles.recentRef}>{entry.reference}</span>
                    <span className={styles.recentDesignation}>{entry.designation || '—'}</span>
                    {entry.code ? (
                      <span className={styles.recentCode}>{entry.code}</span>
                    ) : (
                      <span className={styles.recentService}>service</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className={styles.column} aria-label="Plan du local">
          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <PlanPanel
              racks={racks}
              planWidth={planWidth}
              planHeight={planHeight}
              slotStates={emptySlotStates}
              highlight={emptyHighlight}
              focus={null}
              loading={racksLoading}
              canEdit={false}
              selection={selection}
              refreshToken={refreshToken}
              onMoveItem={() => undefined}
              onDropOnRack={() => undefined}
              onEditItem={() => undefined}
              onDeleteItem={() => undefined}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
