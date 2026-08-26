import { useEffect, useRef, useState } from 'react';
import { api, type ItemPayload } from '../../api';
import { SIDE_SHORT, SIDES } from '../../lib/labels';
import type { Customer, Item, ItemKind, Rack, Shelf, Side } from '../../types';
import styles from './ItemForm.module.css';

const KIND_LABELS: { value: ItemKind; label: string }[] = [
  { value: 'physical', label: 'Physique' },
  { value: 'service', label: 'Service' },
  { value: 'other_site', label: 'Hors PlanStock' },
];

interface ItemFormProps {
  /** Article à modifier, ou référence pré-remplie pour une création. */
  item: Item | null;
  presetReference?: string;
  racks: Rack[];
  /** Stocks à part du local. Vide : le formulaire n'en parle pas. */
  customers: Customer[];
  onSubmit: (payload: ItemPayload) => Promise<boolean>;
  onCancel: () => void;
  error: string | null;
}

export function ItemForm({
  item,
  presetReference = '',
  racks,
  customers,
  onSubmit,
  onCancel,
  error,
}: ItemFormProps) {
  // Un article peut être rangé au stock général et dans plusieurs stocks à
  // part. Le formulaire n'en modifie qu'un à la fois : celui choisi ici.
  const [customerId, setCustomerId] = useState<number | null>(null);
  const current =
    item?.locations.find((row) => (row.customer_id ?? null) === customerId) ?? null;

  const [reference, setReference] = useState(item?.reference_display ?? presetReference);
  const [designation, setDesignation] = useState(item?.designation ?? '');
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'physical');
  const [familyCode, setFamilyCode] = useState(item?.family_code ?? '');
  const [familyLabel, setFamilyLabel] = useState(item?.family_label ?? '');
  const [rackId, setRackId] = useState<number | null>(current?.rack_id ?? racks[0]?.id ?? null);
  const [shelfId, setShelfId] = useState<number | null>(current?.shelf_id ?? null);
  const [side, setSide] = useState<Side | ''>(current?.side ?? '');
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [busy, setBusy] = useState(false);

  const selectedRack = racks.find((rack) => rack.id === rackId) ?? null;
  const isZone = selectedRack?.is_zone ?? false;

  const referenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    referenceRef.current?.focus();
    referenceRef.current?.select();
  }, []);

  // Changer de stock, c'est regarder un autre rangement du même article : les
  // champs doivent suivre. Sans ça, valider écraserait la position d'un stock
  // avec celle d'un autre.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const location = item?.locations.find((row) => (row.customer_id ?? null) === customerId) ?? null;
    setRackId(location?.rack_id ?? racks[0]?.id ?? null);
    setShelfId(location?.shelf_id ?? null);
    setSide(location?.side ?? '');
  }, [customerId, item, racks]);

  useEffect(() => {
    if (rackId === null || isZone) {
      setShelves([]);
      setShelfId(null);
      return;
    }
    let cancelled = false;
    void api.racks
      .shelves(rackId)
      .then((list) => {
        if (cancelled) return;
        setShelves(list);
        // Si l'étagère sélectionnée appartient à un autre rayonnage, on la libère.
        setShelfId((currentShelf) =>
          currentShelf !== null && list.some((shelf) => shelf.id === currentShelf)
            ? currentShelf
            : null,
        );
      })
      .catch(() => !cancelled && setShelves([]));
    return () => {
      cancelled = true;
    };
  }, [rackId, isZone]);

  const chosenShelf = shelves.find((shelf) => shelf.id === shelfId) ?? null;
  const chosenCode = isZone ? (selectedRack?.rack_code ?? null) : (chosenShelf?.code ?? null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const success = await onSubmit({
      reference,
      designation,
      kind,
      family_code: familyCode.trim() || null,
      family_label: familyLabel.trim() || null,
      shelf_id: kind === 'physical' && !isZone ? shelfId : null,
      zone_id: kind === 'physical' && isZone ? rackId : null,
      side: kind === 'physical' && !isZone && side ? side : null,
      customer_id: kind === 'physical' ? customerId : null,
    });
    setBusy(false);
    if (!success) referenceRef.current?.focus();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <label className={`${styles.field} ${styles.reference}`}>
        Référence
        <input
          ref={referenceRef}
          type="text"
          value={reference}
          placeholder="UK707E/L"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setReference(event.target.value)}
        />
      </label>

      <label className={styles.field}>
        Désignation
        <input
          type="text"
          value={designation}
          placeholder="Toner noir UK707"
          onChange={(event) => setDesignation(event.target.value)}
        />
      </label>

      <div className={styles.field}>
        Type
        <div className={styles.kinds} role="radiogroup" aria-label="Type d’article">
          {KIND_LABELS.map((option) => (
            <label
              key={option.value}
              className={`${styles.kind} ${kind === option.value ? styles.kindActive : ''}`}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <div className={styles.row}>
        <label className={styles.field}>
          Famille
          <input
            type="text"
            value={familyCode}
            placeholder="0310"
            onChange={(event) => setFamilyCode(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Libellé de famille
          <input
            type="text"
            value={familyLabel}
            placeholder="IMPRIMANTE LASER N/B TGC22"
            onChange={(event) => setFamilyLabel(event.target.value)}
          />
        </label>
      </div>

      {kind === 'physical' ? (
        <div className={styles.location}>
          <div className={styles.locationHeader}>
            <span className={styles.locationTitle}>Emplacement</span>
            <span className={`${styles.chosen} ${chosenCode ? '' : styles.chosenEmpty}`}>
              {chosenCode ?? 'à choisir'}
            </span>
          </div>

          {customers.length > 0 ? (
            <label className={styles.field}>
              Stock
              <select
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
                  ? 'Ce rangement appartient à ce stock ; les autres ne bougent pas.'
                  : 'Le stock de tout le monde. Change ici pour ranger dans un stock à part.'}
              </span>
            </label>
          ) : null}

          <div className={styles.row}>
            <label className={styles.field}>
              Rayonnage ou zone
              <select
                value={rackId ?? ''}
                onChange={(event) =>
                  setRackId(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">—</option>
                {racks.map((rack) => (
                  <option key={rack.id} value={rack.id}>
                    {rack.rack_code} {rack.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Étagère
              <select
                value={shelfId ?? ''}
                disabled={isZone}
                onChange={(event) =>
                  setShelfId(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">{isZone ? 'aucune (zone)' : '—'}</option>
                {shelves.map((shelf) => (
                  <option key={shelf.id} value={shelf.id}>
                    {shelf.short_code}
                    {shelf.items.length > 0 ? ` (${shelf.items.length})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isZone ? null : (
            <div className={styles.field}>
              Côté de l’étagère <span className={styles.optional}>facultatif</span>
              <div className={styles.kinds} role="radiogroup" aria-label="Côté de l’étagère">
                <label className={`${styles.kind} ${side === '' ? styles.kindActive : ''}`}>
                  <input
                    type="radio"
                    name="side"
                    checked={side === ''}
                    onChange={() => setSide('')}
                  />
                  Non précisé
                </label>
                {SIDES.map((option) => (
                  <label
                    key={option}
                    className={`${styles.kind} ${side === option ? styles.kindActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="side"
                      checked={side === option}
                      onChange={() => setSide(option)}
                    />
                    {SIDE_SHORT[option]}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className={styles.pickHint}>
          Un article {kind === 'service' ? 'de type service' : 'hors PlanStock'} n’a pas
          d’emplacement : la recherche le trouvera depuis les deux locaux, avec un message à la
          place du code.
        </p>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>
          {item ? 'Enregistrer' : 'Ajouter l’article'}
        </button>
      </div>
    </form>
  );
}
