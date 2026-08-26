import { useCallback, useMemo, useRef, useState } from 'react';
import { ApiError, api, type RackPayload } from '../../api';
import { PlanPanel } from '../../components/PlanPanel';
import type { LocationSelection } from '../../components/RackView';
import type { Item, Rack, Shelf, User } from '../../types';
import { RackWizard } from './RackWizard';
import styles from './InventoryMode.module.css';

/** Destination courante : une étagère de rayonnage, ou une zone. */
type Target = { kind: 'shelf'; shelf: Shelf } | { kind: 'zone'; zone: Rack } | null;

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

const targetCode = (target: Target) =>
  target === null ? null : target.kind === 'shelf' ? target.shelf.code : target.zone.rack_code;

/**
 * Mode Inventaire initial : réf → désignation → clic sur une étagère (ou une
 * zone) → suivant. Le dernier emplacement reste sélectionné pour vider un
 * carton entier d'affilée avec la seule touche Entrée.
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
  const [target, setTarget] = useState<Target>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const referenceRef = useRef<HTMLInputElement>(null);
  const emptyStates = useMemo(() => new Map(), []);
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

  /** Enregistrement effectif. L'emplacement est passé explicitement : au moment
   *  du clic sur le plan, l'état `target` n'est pas encore à jour. */
  const persist = useCallback(
    async (kind: 'physical' | 'service', where: Target) => {
      if (!currentUser) {
        setError('Sélectionnez votre prénom avant de saisir l’inventaire.');
        return;
      }
      try {
        const item: Item = await api.items.create(currentUser.id, {
          reference: reference.trim().toUpperCase(),
          designation: designation.trim(),
          kind,
          shelf_id: kind === 'physical' && where?.kind === 'shelf' ? where.shelf.id : null,
          zone_id: kind === 'physical' && where?.kind === 'zone' ? where.zone.id : null,
        });

        setSaved((current) => [
          {
            reference: item.reference_display,
            designation: item.designation,
            code: item.locations[0]?.code ?? null,
          },
          ...current,
        ]);
        setAwaiting(false);
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
      if (kind === 'physical' && !target) {
        // Aucun emplacement encore choisi : on attend un clic sur le plan.
        setAwaiting(true);
        setError(null);
        return;
      }
      await persist(kind, target);
    },
    [reference, target, persist],
  );

  /** Un clic sur une étagère ou une zone la sélectionne, et enregistre si on l'attendait. */
  const choose = useCallback(
    (next: Target) => {
      setTarget(next);
      setError(null);

      if (awaiting && reference.trim()) {
        void persist('physical', next);
        return;
      }
      setAwaiting(false);
      // Le clic a déplacé le focus sur le plan : on le rend au champ Référence
      // pour que la frappe suivante ne se perde pas.
      referenceRef.current?.focus();
    },
    [awaiting, reference, persist],
  );

  const selection: LocationSelection = useMemo(
    () => ({
      label: awaiting
        ? `Cliquez l’étagère ou la zone où ranger ${reference.trim().toUpperCase() || 'cet article'}.`
        : 'Cliquez une étagère ou une zone pour changer la destination.',
      onSelectShelf: (shelf) => choose({ kind: 'shelf', shelf }),
      onSelectZone: (zone) => choose({ kind: 'zone', zone }),
    }),
    [awaiting, reference, choose],
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
                {awaiting ? 'En attente d’un clic sur le plan' : 'Emplacement de destination'}
              </span>
              <span
                className={`${styles.targetCode} ${target ? '' : styles.targetEmpty} ${
                  awaiting ? styles.awaiting : ''
                }`}
              >
                {targetCode(target) ?? 'à choisir'}
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
              <span className={styles.kbd}>Entrée</span> pour enregistrer. Le dernier emplacement
              reste sélectionné : <span className={styles.kbd}>Entrée</span> seul range l’article
              suivant au même endroit — pratique pour vider un carton. Cliquez une autre étagère ou
              une zone pour changer de destination.
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
              locationStates={emptyStates}
              highlight={emptyHighlight}
              focus={null}
              loading={racksLoading}
              canEdit={false}
              selection={selection}
              refreshToken={refreshToken}
              onMoveItem={() => undefined}
              onEditItem={() => undefined}
              onDeleteItem={() => undefined}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
