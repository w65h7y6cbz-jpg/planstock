import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type RackPayload } from '../../api';
import { Logo } from '../../components/Logo';
import { RackElevation, ZoneDrawing } from '../../components/RackElevation';
import { useCustomers } from '../../hooks/useCustomers';
import { FACES, SIDES, aisleColor, isPegboard, sideShort } from '../../lib/labels';
import type { Rack, Shelf, Side, Site, User } from '../../types';
import { RackWizard } from './RackWizard';
import styles from './InventoryMode.module.css';

/**
 * Inventaire initial, une question à la fois.
 *
 * 1. Devant quel meuble es-tu ?
 * 2. Quelle étagère ?
 * 3. Tape les références : chaque Entrée range l'article et laisse le curseur
 *    prêt pour la suivante, au même endroit — on vide un carton sans lever les
 *    yeux. Deux boutons suffisent pour changer d'étagère ou de meuble.
 */

type Step = 'rack' | 'shelf' | 'items';

interface InventoryModeProps {
  site: Site;
  currentUser: User | null;
  /** Le mode couvre tout l'écran : le choix du prénom doit rester accessible ici. */
  users: User[];
  onSelectUser: (id: number | null) => void;
  racks: Rack[];
  racksLoading: boolean;
  onCreateRacks: (racks: RackPayload[]) => Promise<void>;
  /** Prévient l'écran principal qu'un article a été enregistré. */
  onItemSaved: () => void;
  onClose: () => void;
}

interface SavedEntry {
  reference: string;
  designation: string;
  code: string;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function InventoryMode({
  site,
  currentUser,
  users,
  onSelectUser,
  racks,
  racksLoading,
  onCreateRacks,
  onItemSaved,
  onClose,
}: InventoryModeProps) {
  const [step, setStep] = useState<Step>('rack');
  const [rack, setRack] = useState<Rack | null>(null);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [shelfIndex, setShelfIndex] = useState<number | null>(null);
  const [side, setSide] = useState<Side | ''>('');
  // Ici le stock **reste** choisi d'une référence à l'autre : on vide un carton
  // entier qui appartient au même stock. C'est l'inverse de la recherche, où
  // chaque référence repart du stock général.
  const [customerId, setCustomerId] = useState<number | null>(null);
  const { customers } = useCustomers(site.id);
  const [reference, setReference] = useState('');
  const [designation, setDesignation] = useState('');
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const referenceRef = useRef<HTMLInputElement>(null);

  // Les étagères du meuble choisi, pour connaître leur identifiant réel.
  useEffect(() => {
    if (!rack || rack.is_zone) {
      setShelves([]);
      return;
    }
    let cancelled = false;
    void api.racks
      .shelves(rack.id)
      .then((list) => !cancelled && setShelves(list))
      .catch(() => !cancelled && setShelves([]));
    return () => {
      cancelled = true;
    };
  }, [rack]);

  useEffect(() => {
    if (step === 'items') referenceRef.current?.focus();
  }, [step]);

  const currentShelf = shelves.find((shelf) => shelf.shelf_index === shelfIndex) ?? null;
  const targetCode = rack?.is_zone ? rack.rack_code : (currentShelf?.code ?? '');

  const save = useCallback(async () => {
    if (!currentUser) {
      setError('Choisis ton prénom en haut à droite : l’inventaire trace qui range quoi.');
      return;
    }
    if (!reference.trim()) {
      setError('La référence est obligatoire.');
      return;
    }
    if (!rack || (!rack.is_zone && !currentShelf)) {
      setError('Choisis d’abord une étagère.');
      return;
    }

    setBusy(true);
    try {
      const item = await api.items.create(currentUser.id, {
        reference: reference.trim().toUpperCase(),
        designation: designation.trim(),
        kind: 'physical',
        shelf_id: rack.is_zone ? null : currentShelf!.id,
        zone_id: rack.is_zone ? rack.id : null,
        side: rack.is_zone || !side ? null : side,
        customer_id: customerId,
      });

      setSaved((current) => [
        {
          reference: item.reference_display,
          designation: item.designation,
          code: item.locations[0]?.code ?? targetCode,
        },
        ...current,
      ]);
      setReference('');
      setDesignation('');
      setError(null);
      onItemSaved();
    } catch (cause) {
      setError(messageOf(cause, 'Enregistrement impossible.'));
    } finally {
      setBusy(false);
      referenceRef.current?.focus();
    }
  }, [
    currentUser,
    reference,
    designation,
    rack,
    currentShelf,
    side,
    customerId,
    targetCode,
    onItemSaved,
  ]);

  const header = (
    <header className={styles.header}>
      <span className={styles.brand}>
        <Logo site={site} size={30} />
        <span className={styles.brandName}>{site.name}</span>
      </span>
      <span className={styles.stepTag}>Inventaire initial</span>
      <span className={styles.headerSpacer} />
      <span className={styles.counter}>
        {saved.length} article{saved.length > 1 ? 's' : ''} rangé{saved.length > 1 ? 's' : ''}
      </span>
      <label className={styles.userPicker}>
        Qui range ?
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
      <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onClose}>
        Terminer
      </button>
    </header>
  );

  // Aucun meuble encore dessiné : on commence par le plan.
  if (!racksLoading && racks.length === 0) {
    return (
      <div className={styles.screen}>
        {header}
        <RackWizard
          onCreate={async (payloads) => {
            setError(null);
            try {
              await onCreateRacks(payloads);
            } catch (cause) {
              setError(messageOf(cause, 'Création du plan impossible.'));
            }
          }}
          onSkip={onClose}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      {header}

      <main className={styles.stage}>
        {!currentUser ? (
          <p className={styles.warning}>
            Choisis ton prénom en haut à droite avant de commencer.
          </p>
        ) : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        {step === 'rack' ? (
          <section className={styles.question}>
            <h1 className={styles.ask}>Devant quel meuble es-tu ?</h1>
            <div className={styles.choices}>
              {racks.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  className={styles.choice}
                  onClick={() => {
                    setRack(candidate);
                    setShelfIndex(null);
                    setSide('');
                    setError(null);
                    setStep(candidate.is_zone ? 'items' : 'shelf');
                  }}
                >
                  <span className={styles.choiceCode}>{candidate.rack_code}</span>
                  <span className={styles.choiceLabel}>{candidate.label || 'Sans nom'}</span>
                  {candidate.aisle ? (
                    <span
                      className={styles.choiceAisle}
                      style={{ color: aisleColor(candidate.aisle) }}
                    >
                      {candidate.aisle}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {step === 'shelf' && rack ? (
          <section className={styles.question}>
            <h1 className={styles.ask}>
              Quelle étagère de <span className={styles.askCode}>{rack.rack_code}</span> ?
            </h1>
            <p className={styles.askHint}>Clique la tablette devant toi. E1 est celle du haut.</p>
            <RackElevation
              shelvesCount={rack.shelves_count}
              selected={shelfIndex}
              onSelectShelf={(index) => {
                setShelfIndex(index);
                setError(null);
                setStep('items');
              }}
              height={360}
            />
            <button type="button" className={styles.link} onClick={() => setStep('rack')}>
              ← Changer de meuble
            </button>
          </section>
        ) : null}

        {step === 'items' && rack ? (
          <section className={styles.entry}>
            <div className={styles.entryDrawing}>
              {rack.is_zone ? (
                <ZoneDrawing load={saved.length} highlighted height={170} />
              ) : (
                <RackElevation
                  shelvesCount={rack.shelves_count}
                  target={shelfIndex}
                  targetSide={side || null}
                  dimOthers
                  height={260}
                />
              )}
              <p className={styles.entryTarget}>{targetCode}</p>
              <div className={styles.entryLinks}>
                {rack.is_zone ? null : (
                  <button type="button" className={styles.link} onClick={() => setStep('shelf')}>
                    Changer d’étagère
                  </button>
                )}
                <button type="button" className={styles.link} onClick={() => setStep('rack')}>
                  Changer de meuble
                </button>
              </div>
            </div>

            <div className={styles.entryForm}>
              <h1 className={styles.ask}>Tape les références rangées ici</h1>

              <label className={`${styles.field} ${styles.reference}`}>
                Référence
                <input
                  ref={referenceRef}
                  type="text"
                  value={reference}
                  placeholder="UK707E/L"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setReference(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void save();
                    }
                  }}
                />
              </label>

              <label className={styles.field}>
                Désignation <span className={styles.optional}>facultatif</span>
                <input
                  type="text"
                  value={designation}
                  placeholder="Toner noir UK707"
                  autoComplete="off"
                  onChange={(event) => setDesignation(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void save();
                    }
                  }}
                />
              </label>

              {rack.is_zone ? null : (
                <div className={styles.field}>
                  {isPegboard(rack.style) ? 'Face' : 'Côté'}{' '}
                  <span className={styles.optional}>facultatif</span>
                  <div className={styles.sides}>
                    <button
                      type="button"
                      className={`${styles.sideButton} ${side === '' ? styles.sideOn : ''}`}
                      onClick={() => setSide('')}
                    >
                      Non précisé
                    </button>
                    {(isPegboard(rack.style) ? FACES : SIDES).map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`${styles.sideButton} ${side === option ? styles.sideOn : ''}`}
                        onClick={() => setSide(option)}
                      >
                        {sideShort(option, rack.style)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {customers.length > 0 ? (
                <div className={styles.field}>
                  Stock
                  <select
                    className={styles.stockSelect}
                    value={customerId ?? ''}
                    onChange={(event) =>
                      setCustomerId(event.target.value === '' ? null : Number(event.target.value))
                    }
                  >
                    <option value="">Stock général</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <span className={styles.optional}>
                    {customerId
                      ? 'Tout ce qui suit part dans ce stock, jusqu’à ce que tu en changes.'
                      : 'Le stock de tout le monde.'}
                  </span>
                </div>
              ) : null}

              <button
                type="button"
                className={`${styles.button} ${styles.primary} ${styles.wide}`}
                disabled={!currentUser || busy}
                onClick={() => void save()}
              >
                Ranger ici · Entrée
              </button>

              {saved.length > 0 ? (
                <ul className={styles.recent}>
                  {saved.slice(0, 8).map((entry, index) => (
                    <li key={`${entry.reference}-${index}`} className={styles.recentRow}>
                      <span className={styles.recentRef}>{entry.reference}</span>
                      <span className={styles.recentDesignation}>{entry.designation || '—'}</span>
                      <span className={styles.recentCode}>{entry.code}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
