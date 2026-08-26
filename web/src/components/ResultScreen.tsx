import { useEffect, useState } from 'react';
import { KIND_LABELS, KIND_MESSAGES, SIDE_LABELS, aisleColor } from '../lib/labels';
import type { Item } from '../types';
import { RackElevation, ZoneDrawing } from './RackElevation';
import styles from './ResultScreen.module.css';

/**
 * Écran de résultat : l'écran bascule en entier dessus.
 *
 * Il répond à une seule question — où aller — dans cet ordre : le code
 * d'emplacement en énorme, le rayonnage dessiné à côté, puis seulement les
 * détails (désignation, allée, nom du rayonnage). Un article sans emplacement
 * physique reçoit un grand message coloré à la place du code : on ne le cherche
 * pas dans le local.
 */

export type SearchOutcome =
  | { status: 'searching'; query: string }
  | { status: 'found'; item: Item }
  | { status: 'unknown'; query: string }
  | { status: 'error'; query: string; message: string };

interface ResultScreenProps {
  outcome: SearchOutcome;
  /** Nombre d'étagères du rayonnage porteur, pour dessiner le bon meuble. */
  shelvesCount: number | null;
  onOpenPlan: () => void;
  onNext: () => void;
}

export function ResultScreen({ outcome, shelvesCount, onOpenPlan, onNext }: ResultScreenProps) {
  // Flash bref à l'affichage : on ne rate pas le résultat, et ça se calme.
  const [flash, setFlash] = useState(true);
  const key = outcome.status === 'found' ? outcome.item.id : outcome.status;

  useEffect(() => {
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 260);
    return () => clearTimeout(timer);
  }, [key]);

  if (outcome.status === 'searching') {
    return (
      <main className={styles.screen}>
        <p className={styles.searching}>Recherche de {outcome.query}…</p>
      </main>
    );
  }

  if (outcome.status === 'unknown' || outcome.status === 'error') {
    return (
      <main className={styles.screen}>
        <div className={`${styles.card} ${styles.cardMuted}`}>
          <p className={styles.unknownRef}>{outcome.query}</p>
          <p className={styles.unknownText}>
            {outcome.status === 'error' ? outcome.message : 'Référence inconnue dans ce local.'}
          </p>
          <button type="button" className={styles.primary} onClick={onNext}>
            Suivante
          </button>
        </div>
      </main>
    );
  }

  const { item } = outcome;
  const location = item.locations[0] ?? null;

  // Service ou hors PlanStock : rien à aller chercher dans le local.
  if (item.kind !== 'physical' || !location) {
    const message =
      item.kind === 'physical'
        ? 'Aucun emplacement enregistré'
        : KIND_MESSAGES[item.kind as 'service' | 'other_site'];

    return (
      <main className={styles.screen}>
        <div className={`${styles.card} ${styles.cardWarning} ${flash ? styles.flash : ''}`}>
          <p className={styles.reference}>{item.reference_display}</p>
          <p className={styles.bigMessage}>{message}</p>
          {item.designation ? <p className={styles.designation}>{item.designation}</p> : null}
          <p className={styles.kindTag}>
            {item.kind === 'physical' ? 'À ranger' : KIND_LABELS[item.kind]}
          </p>
          <button type="button" className={styles.primary} onClick={onNext}>
            Suivante
          </button>
        </div>
      </main>
    );
  }

  const isShelf = location.kind === 'shelf';

  return (
    <main className={styles.screen}>
      <div className={`${styles.result} ${flash ? styles.flash : ''}`}>
        <div className={styles.left}>
          <p className={styles.reference}>{item.reference_display}</p>

          <p className={styles.code}>
            <span className={styles.codeRack}>{`R${String(location.rack_code).padStart(2, '0')}`}</span>
            {isShelf ? (
              <>
                {/* Point de séparation dessiné : le point médian manque dans
                    certaines polices à chasse fixe, où il sort en carré. */}
                <span className={styles.codeSep} aria-hidden="true" />
                <span className={styles.codeShelf}>{location.short_code}</span>
              </>
            ) : null}
          </p>
          {!isShelf ? <p className={styles.zoneNote}>Posé au sol, pas d’étagère</p> : null}
          {location.side ? (
            <p className={styles.side}>{`Sur l’étagère, ${SIDE_LABELS[location.side]}`}</p>
          ) : null}

          <dl className={styles.details}>
            {location.rack_aisle ? (
              <div className={styles.detail}>
                <dt>Allée</dt>
                <dd>
                  <span
                    className={styles.aisleDot}
                    style={{ background: aisleColor(location.rack_aisle) }}
                    aria-hidden="true"
                  />
                  {location.rack_aisle}
                </dd>
              </div>
            ) : null}
            {location.rack_label ? (
              <div className={styles.detail}>
                <dt>{isShelf ? 'Rayonnage' : 'Zone'}</dt>
                <dd>{location.rack_label}</dd>
              </div>
            ) : null}
            {item.designation ? (
              <div className={styles.detail}>
                <dt>Article</dt>
                <dd>{item.designation}</dd>
              </div>
            ) : null}
          </dl>

          <div className={styles.buttons}>
            <button type="button" className={styles.primary} onClick={onOpenPlan}>
              Voir sur le plan
            </button>
            <button type="button" className={styles.secondary} onClick={onNext}>
              Suivante
            </button>
          </div>
        </div>

        <div className={styles.right}>
          {isShelf ? (
            <RackElevation
              shelvesCount={shelvesCount ?? location.shelf_index ?? 1}
              target={location.shelf_index}
              targetSide={location.side}
              dimOthers
              height={420}
            />
          ) : (
            <ZoneDrawing highlighted height={300} />
          )}
        </div>
      </div>
    </main>
  );
}
