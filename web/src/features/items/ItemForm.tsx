import { useEffect, useRef, useState } from 'react';
import { api, type ItemPayload } from '../../api';
import type { Item, ItemKind, Rack, SlotContent } from '../../types';
import styles from './ItemForm.module.css';

const KIND_LABELS: { value: ItemKind; label: string }[] = [
  { value: 'physical', label: 'Physique' },
  { value: 'service', label: 'Service' },
  { value: 'other_site', label: 'Autre site' },
];

interface ItemFormProps {
  /** Article à modifier, ou référence pré-remplie pour une création. */
  item: Item | null;
  presetReference?: string;
  racks: Rack[];
  /** Case choisie en cliquant directement sur le plan. */
  pickedSlot: SlotContent | null;
  /** Active la sélection d'une case sur le plan pendant que le formulaire est ouvert. */
  onSlotPickingChange: (active: boolean) => void;
  onSubmit: (payload: ItemPayload) => Promise<boolean>;
  onCancel: () => void;
  error: string | null;
}

export function ItemForm({
  item,
  presetReference = '',
  racks,
  pickedSlot,
  onSlotPickingChange,
  onSubmit,
  onCancel,
  error,
}: ItemFormProps) {
  const current = item?.locations[0] ?? null;

  const [reference, setReference] = useState(item?.reference_display ?? presetReference);
  const [designation, setDesignation] = useState(item?.designation ?? '');
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? 'physical');
  const [familyCode, setFamilyCode] = useState(item?.family_code ?? '');
  const [familyLabel, setFamilyLabel] = useState(item?.family_label ?? '');
  const [rackId, setRackId] = useState<number | null>(current?.rack_id ?? racks[0]?.id ?? null);
  const [slotId, setSlotId] = useState<number | null>(current?.slot_id ?? null);
  const [slots, setSlots] = useState<SlotContent[]>([]);
  const [busy, setBusy] = useState(false);

  const referenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    referenceRef.current?.focus();
    referenceRef.current?.select();
  }, []);

  // Le clic sur le plan ne vaut que pour un article physique.
  useEffect(() => {
    onSlotPickingChange(kind === 'physical');
    return () => onSlotPickingChange(false);
  }, [kind, onSlotPickingChange]);

  useEffect(() => {
    if (!pickedSlot) return;
    setRackId(pickedSlot.rack_id);
    setSlotId(pickedSlot.id);
  }, [pickedSlot]);

  useEffect(() => {
    if (rackId === null) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    void api.racks
      .slots(rackId)
      .then((list) => {
        if (cancelled) return;
        setSlots(list);
        // Si la case sélectionnée appartient à un autre rayonnage, on la libère.
        setSlotId((currentSlot) =>
          currentSlot !== null && list.some((slot) => slot.id === currentSlot)
            ? currentSlot
            : null,
        );
      })
      .catch(() => !cancelled && setSlots([]));
    return () => {
      cancelled = true;
    };
  }, [rackId]);

  const chosenSlot = slots.find((slot) => slot.id === slotId) ?? null;

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
      slot_id: kind === 'physical' ? slotId : null,
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
            <span className={`${styles.chosen} ${chosenSlot ? '' : styles.chosenEmpty}`}>
              {chosenSlot?.code ?? 'à choisir'}
            </span>
          </div>

          <div className={styles.row}>
            <label className={styles.field}>
              Rayonnage
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
              Case
              <select
                value={slotId ?? ''}
                onChange={(event) =>
                  setSlotId(event.target.value === '' ? null : Number(event.target.value))
                }
              >
                <option value="">—</option>
                {slots.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.short_code}
                    {slot.items.length > 0 ? ` (${slot.items.length})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className={`${styles.pickHint} ${styles.pickActive}`}>
            Vous pouvez aussi cliquer directement une case sur le plan à droite.
          </p>
        </div>
      ) : (
        <p className={styles.pickHint}>
          Un article {kind === 'service' ? 'de type service' : 'd’un autre site'} n’a pas
          d’emplacement dans ce local : il apparaîtra dans « Sans stock physique ».
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
