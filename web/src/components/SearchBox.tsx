import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { PREFIX_MIN_LENGTH, normalizeReference } from '../lib/reference';
import type { Item } from '../types';
import styles from './SearchBox.module.css';

interface SearchBoxProps {
  /** Ajoute la référence trouvée à la liste de préparation. */
  onPick: (item: Item) => void;
  /** Ouvre le formulaire de création pré-rempli (étape 6). */
  onCreateRequest: (reference: string) => void;
  canCreate: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

const DEBOUNCE_MS = 120;

export function SearchBox({ onPick, onCreateRequest, canCreate, inputRef }: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Item[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [unknownReference, setUnknownReference] = useState<string | null>(null);

  const localRef = useRef<HTMLInputElement>(null);
  const input = inputRef ?? localRef;
  const normalized = normalizeReference(query);

  const reset = useCallback(() => {
    setQuery('');
    setMatches([]);
    setActiveIndex(-1);
    setUnknownReference(null);
    input.current?.focus();
  }, [input]);

  // Suggestions par préfixe, à partir de 3 caractères.
  useEffect(() => {
    if (normalized.length < PREFIX_MIN_LENGTH) {
      setMatches([]);
      setActiveIndex(-1);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void api.items
        .search(normalized)
        .then((result) => {
          if (cancelled) return;
          setMatches(result.matches);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) setMatches([]);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalized]);

  function pick(item: Item) {
    onPick(item);
    reset();
  }

  /** Entrée : correspondance exacte, sinon suggestion sélectionnée, sinon inconnue. */
  async function submit() {
    if (!normalized) return;

    if (activeIndex >= 0 && matches[activeIndex]) {
      pick(matches[activeIndex]);
      return;
    }

    try {
      const result = await api.items.search(normalized);
      if (result.exact) {
        pick(result.exact);
        return;
      }
      if (result.matches.length === 1) {
        pick(result.matches[0]);
        return;
      }
      setMatches(result.matches);
      setUnknownReference(result.matches.length === 0 ? query.trim() : null);
      if (result.matches.length > 0) setActiveIndex(0);
    } catch {
      setUnknownReference(null);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? matches.length - 1 : current - 1));
    }
  }

  return (
    <div className={styles.box}>
      <input
        ref={input}
        className={styles.input}
        type="search"
        value={query}
        placeholder="Référence du bon de préparation…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Référence à rechercher"
        aria-expanded={matches.length > 0}
        onChange={(event) => {
          setQuery(event.target.value);
          setUnknownReference(null);
        }}
        onKeyDown={onKeyDown}
      />

      {matches.length > 0 ? (
        <ul className={styles.suggestions} role="listbox" aria-label="Références proposées">
          {matches.map((item, index) => (
            <li key={item.id} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                className={`${styles.suggestion} ${
                  index === activeIndex ? styles.suggestionActive : ''
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => pick(item)}
              >
                <span className={styles.suggestionRef}>{item.reference_display}</span>
                <span className={styles.suggestionLabel}>{item.designation}</span>
                <span className={styles.suggestionCode}>
                  {item.kind === 'physical'
                    ? (item.locations[0]?.code ?? 'sans emplacement')
                    : item.kind === 'service'
                      ? 'service'
                      : 'autre site'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {unknownReference ? (
        <div className={styles.unknown} role="alert">
          <span className={styles.unknownText}>
            Référence inconnue : <span className={styles.unknownRef}>{unknownReference}</span>
          </span>
          <button
            type="button"
            className={styles.addButton}
            disabled={!canCreate}
            title={canCreate ? undefined : 'Sélectionnez d’abord votre prénom.'}
            onClick={() => onCreateRequest(unknownReference)}
          >
            Ajouter cet article
          </button>
        </div>
      ) : (
        <p className={styles.hint}>
          Entrée pour ajouter à la liste · ↑ ↓ pour choisir · Échap pour effacer
        </p>
      )}
    </div>
  );
}
