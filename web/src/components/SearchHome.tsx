import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api';
import { PREFIX_MIN_LENGTH, isSearchable } from '../lib/reference';
import type { Item, Site } from '../types';
import { Logo } from './Logo';
import styles from './SearchHome.module.css';

/**
 * Écran d'accueil : rien que la recherche, au centre.
 *
 * On ne cherche jamais qu'une chose ici : une référence d'article. Le numéro
 * du bon de préparation ne sert pas à chercher — il se saisit dans le tiroir,
 * pour nommer la liste en cours.
 *
 * La saisie passe en majuscules — c'est ainsi que les références figurent sur
 * le bon papier — mais la recherche reste tolérante : uk-707-e-l trouve
 * UK707E/L. Les suggestions s'affichent sous le champ à partir de trois
 * caractères ; celles de référence d'abord, celles de désignation ensuite et
 * clairement séparées, pour qu'on ne confonde jamais les deux.
 *
 * Entrée valide : l'emplacement s'affiche ET la référence part dans la liste.
 */

export interface SearchHandle {
  focus: () => void;
  clear: () => void;
}

interface SearchHomeProps {
  site: Site;
  /** Affichage réduit : le champ passe en haut de l'écran de résultat. */
  compact?: boolean;
  onSubmit: (query: string) => void;
  onPick: (item: Item) => void;
}

interface Suggestions {
  byReference: Item[];
  byDesignation: Item[];
}

const EMPTY: Suggestions = { byReference: [], byDesignation: [] };

export const SearchHome = forwardRef<SearchHandle, SearchHomeProps>(function SearchHome(
  { site, compact = false, onSubmit, onPick },
  ref,
) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      setQuery('');
      setSuggestions(EMPTY);
      setHighlighted(-1);
      inputRef.current?.focus();
    },
  }));

  // Suggestions : une requête par frappe, annulée si l'utilisateur continue.
  useEffect(() => {
    if (query.trim().length < PREFIX_MIN_LENGTH) {
      setSuggestions(EMPTY);
      setHighlighted(-1);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void api.items
        .search(query, site.id)
        .then((result) => {
          if (cancelled) return;
          setSuggestions({ byReference: result.matches, byDesignation: result.by_designation });
          setHighlighted(-1);
        })
        .catch(() => !cancelled && setSuggestions(EMPTY));
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, site.id]);

  const flat = [...suggestions.byReference, ...suggestions.byDesignation];
  const open = flat.length > 0;

  function submit() {
    if (highlighted >= 0 && flat[highlighted]) {
      onPick(flat[highlighted]);
      return;
    }
    if (isSearchable(query)) onSubmit(query);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % flat.length);
    } else if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? flat.length - 1 : current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    } else if (event.key === 'Escape') {
      // Champ rempli : on l'efface. Champ déjà vide : on le quitte, ce qui rend
      // les raccourcis d'écran (P pour le plan) disponibles au clavier.
      if (query) {
        event.stopPropagation();
        setQuery('');
        setSuggestions(EMPTY);
      } else {
        inputRef.current?.blur();
      }
    }
  }

  return (
    <div className={compact ? styles.compact : styles.screen}>
      {compact ? null : (
        <div className={styles.mark}>
          <Logo site={site} size={92} title={site.name} />
        </div>
      )}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        role="search"
      >
        <div className={`${styles.field} ${open ? styles.fieldOpen : ''}`}>
          <SearchIcon />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            // Les références sont écrites en majuscules sur le bon de préparation.
            onChange={(event) => setQuery(event.target.value.toUpperCase())}
            onKeyDown={onKeyDown}
            placeholder="Tapez une référence…"
            aria-label="Rechercher une référence"
            aria-autocomplete="list"
            aria-controls={open ? listId : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              aria-label="Effacer"
            >
              ×
            </button>
          ) : null}
        </div>

        {open ? (
          <ul className={styles.suggestions} id={listId} role="listbox">
            {suggestions.byReference.map((item, index) => (
              <Suggestion
                key={item.id}
                item={item}
                highlighted={highlighted === index}
                onPick={onPick}
                onHover={() => setHighlighted(index)}
              />
            ))}

            {suggestions.byDesignation.length > 0 ? (
              <li className={styles.separator} role="presentation">
                Trouvés par leur désignation
              </li>
            ) : null}

            {suggestions.byDesignation.map((item, index) => {
              const position = suggestions.byReference.length + index;
              return (
                <Suggestion
                  key={item.id}
                  item={item}
                  highlighted={highlighted === position}
                  onPick={onPick}
                  onHover={() => setHighlighted(position)}
                />
              );
            })}
          </ul>
        ) : null}
      </form>
    </div>
  );
});

function Suggestion({
  item,
  highlighted,
  onPick,
  onHover,
}: {
  item: Item;
  highlighted: boolean;
  onPick: (item: Item) => void;
  onHover: () => void;
}) {
  const location = item.locations[0];

  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={highlighted}
        className={`${styles.suggestion} ${highlighted ? styles.suggestionOn : ''}`}
        onMouseEnter={onHover}
        onClick={() => onPick(item)}
      >
        <span className={styles.suggestionRef}>{item.reference_display}</span>
        <span className={styles.suggestionLabel}>{item.designation || '—'}</span>
        <span className={styles.suggestionCode}>{location ? location.code : '—'}</span>
      </button>
    </li>
  );
}

function SearchIcon() {
  return (
    <svg
      className={styles.searchIcon}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.4 15.4 20 20" />
    </svg>
  );
}
