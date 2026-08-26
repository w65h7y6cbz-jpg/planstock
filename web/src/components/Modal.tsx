import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Largeur maximale du dialogue (par défaut 560 px). */
  width?: number;
}

export function Modal({ title, onClose, children, width }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    // Le premier champ reçoit le focus : le flux reste utilisable au clavier.
    const focusable = dialogRef.current?.querySelector<HTMLElement>(
      'input, select, textarea, button',
    );
    focusable?.focus();
  }, []);

  return (
    <div
      className={styles.overlay}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        style={width ? ({ '--modal-width': `${width}px` } as React.CSSProperties) : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
