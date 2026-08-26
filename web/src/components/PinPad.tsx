import { useEffect, useRef, useState } from 'react';
import styles from './PinPad.module.css';

/**
 * Saisie d'un code à 4 chiffres.
 *
 * Le magasin se sert de PlanStock debout, parfois avec des gants : le pavé est
 * dessiné en gros et cliquable, et le clavier marche en même temps pour ceux
 * qui sont assis. Le code part tout seul au quatrième chiffre — il n'y a rien
 * à valider quand la longueur est connue d'avance.
 */

const LENGTH = 4;

interface PinPadProps {
  title: string;
  hint?: string;
  error?: string | null;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

export function PinPad({
  title,
  hint,
  error = null,
  busy = false,
  submitLabel,
  onSubmit,
  onCancel,
}: PinPadProps) {
  const [pin, setPin] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);

  // Le clavier doit fonctionner sans avoir à viser quoi que ce soit d'abord.
  useEffect(() => {
    frameRef.current?.focus();
  }, []);

  // Un code refusé s'efface : on retape, on ne corrige pas.
  useEffect(() => {
    if (error) setPin('');
  }, [error]);

  function push(digit: string) {
    if (busy || pin.length >= LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === LENGTH) onSubmit(next);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      push(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      setPin((current) => current.slice(0, -1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div
      className={styles.pad}
      ref={frameRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={title}
    >
      <p className={styles.title}>{title}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}

      <div className={styles.dots} aria-label={`${pin.length} chiffre(s) sur ${LENGTH}`}>
        {Array.from({ length: LENGTH }, (_, index) => (
          <span
            key={index}
            className={`${styles.dot} ${index < pin.length ? styles.dotFilled : ''}`}
          />
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            className={styles.key}
            disabled={busy}
            onClick={() => push(digit)}
          >
            {digit}
          </button>
        ))}
        <button type="button" className={styles.keyGhost} onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button type="button" className={styles.key} disabled={busy} onClick={() => push('0')}>
          0
        </button>
        <button
          type="button"
          className={styles.keyGhost}
          disabled={busy || pin.length === 0}
          onClick={() => setPin((current) => current.slice(0, -1))}
          aria-label="Effacer le dernier chiffre"
        >
          ←
        </button>
      </div>

      {submitLabel ? <p className={styles.submitNote}>{submitLabel}</p> : null}
    </div>
  );
}
