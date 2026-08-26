import { useEffect, useRef } from 'react';
import type { SlotState } from '../lib/picklist';
import type { RackDetail, SlotContent } from '../types';
import styles from './RackView.module.css';

interface RackViewProps {
  rack: RackDetail;
  /** Cases concernées par la liste de préparation. */
  slotStates: Map<number, SlotState>;
  /** Case à mettre en évidence brièvement (dernière référence ajoutée). */
  focusSlotId?: number | null;
  onBack: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
}

export function RackView({
  rack,
  slotStates,
  focusSlotId = null,
  onBack,
  onPrevious,
  onNext,
}: RackViewProps) {
  const focusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSlotId !== null) {
      focusRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, [focusSlotId, rack.id]);

  // Étagère 1 en bas : on affiche donc la plus haute en premier.
  const shelves: SlotContent[][] = [];
  for (let shelf = rack.shelves_count; shelf >= 1; shelf -= 1) {
    shelves.push(
      rack.slots
        .filter((slot) => slot.shelf_index === shelf)
        .sort((a, b) => a.slot_index - b.slot_index),
    );
  }

  return (
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

      <div className={styles.shelves}>
        {shelves.map((slots, index) => (
          <div
            key={rack.shelves_count - index}
            className={styles.shelf}
            style={{ gridTemplateColumns: `34px repeat(${rack.slots_per_shelf}, minmax(0, 1fr))` }}
          >
            <span className={styles.shelfLabel}>E{rack.shelves_count - index}</span>
            {slots.map((slot) => {
              const state = slotStates.get(slot.id);
              const isFocus = focusSlotId === slot.id;

              return (
                <div
                  key={slot.id}
                  ref={isFocus ? focusRef : undefined}
                  className={[
                    styles.slot,
                    state === 'lit' ? styles.slotLit : '',
                    state === 'done' ? styles.slotDone : '',
                    isFocus ? styles.slotFocus : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={`${slot.code}${
                    slot.items.length > 0
                      ? ` — ${slot.items.map((item) => item.reference_display).join(', ')}`
                      : ' — vide'
                  }`}
                >
                  <span className={styles.slotCode}>{slot.short_code}</span>
                  <span className={styles.pellets}>
                    {slot.items.map((item) => (
                      <span
                        key={item.id}
                        className={[
                          styles.pellet,
                          state === 'lit' ? styles.pelletLit : '',
                          state === 'done' ? styles.pelletDone : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        title={`${item.reference_display} — ${item.designation}`}
                      >
                        {item.reference_display}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
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
      </p>
    </div>
  );
}
