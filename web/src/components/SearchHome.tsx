import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { api } from '../api';
import { PREFIX_MIN_LENGTH, isSearchable } from '../lib/reference';
import type { Customer, Item, Site } from '../types';
import { Logo } from './Logo';
import styles from './SearchHome.module.css';

/**
 * Écran d'accueil : rien que la recherche, au centre.
 *
 * On ne cherche qu'une chose ici, et c'est la seule chose qu'on tape dans
 * PlanStock : une référence d'article. Rien d'autre n'ouvre de recherche — ni
 * numéro de bon, ni nom de préparation.
 *
 * La saisie passe en majuscules — c'est ainsi que les références figurent sur
 * le papier — mais la recherche reste tolérante : uk-707-e-l trouve
 * UK707E/L. Les suggestions s'affichent sous le champ à partir de trois
 * caractères ; celles de référence d'abord, celles de désignation ensuite et
 * clairement séparées, pour qu'on ne confonde jamais les deux.
 *
 * Entrée valide : l'emplacement s'affiche ET la référence part dans la liste.
 *
 * Le menu des stocks, quand le local en a, se choisit **référence par
 * référence** et revient au stock général après chaque validation. Une même
 * commande mélange couramment des lignes AOCCI et des lignes du stock général :
 * un mode qui resterait allumé ferait chercher au mauvais endroit sans que
 * personne s'en aperçoive.
 */

export interface SearchHandle {
  focus: () => void;
  clear: () => void;
}

interface SearchHomeProps {
  site: Site;
  /** Stocks à part du local. Vide : aucun menu ne s'affiche. */
  customers: Customer[];
  /** Affichage réduit : le champ passe en haut de l'écran de résultat. */
  compact?: boolean;
  onSubmit: (query: string, customerId: number | null) => void;
  onPick: (item: Item, customerId: number | null) => void;
}

interface Suggestions {
  byReference: Item[];
  byDesignation: Item[];
}

const EMPTY: Suggestions = { byReference: [], byDesignation: [] };

export const SearchHome = forwardRef<SearchHandle, SearchHomeProps>(function SearchHome(
  { site, customers, compact = false, onSubmit, onPick },
  ref,
) {
  const [query, setQuery] = useState('');
  // `null` = stock général. Remis à zéro après chaque référence validée.
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);
  const [highlighted, setHighlighted] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const stockId = useId();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    clear: () => {
      setQuery('');
      setCustomerId(null);
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
        .search(query, site.id, customerId)
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
  }, [query, site.id, customerId]);

  const flat = [...suggestions.byReference, ...suggestions.byDesignation];
  const open = flat.length > 0;

  function submit() {
    if (highlighted >= 0 && flat[highlighted]) {
      onPick(flat[highlighted], customerId);
      setCustomerId(null);
      return;
    }
    if (isSearchable(query)) {
      onSubmit(query, customerId);
      setCustomerId(null);
    }
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
        {customers.length > 0 ? (
          <div className={`${styles.stockRow} ${customerId ? styles.stockRowOn : ''}`}>
            <label className={styles.stockLabel} htmlFor={stockId}>
              Chercher dans
            </label>
            <select
              id={stockId}
              className={styles.stockSelect}
              value={customerId ?? ''}
              onChange={(event) =>
                setCustomerId(event.target.value ? Number(event.target.value) : null)
              }
            >
              <option value="">Stock général</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            {customerId ? (
              <span className={styles.stockNote}>revient au stock général après la référence</span>
            ) : null}
          </div>
        ) : null}

        <div className={`${styles.field} ${open ? styles.fieldOpen : ''}`}>
          <SearchIcon />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            // Les références sont écrites en majuscules sur le papier.
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
                onPick={() => {
                  onPick(item, customerId);
                  setCustomerId(null);
                }}
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
                  onPick={() => {
                    onPick(item, customerId);
                    setCustomerId(null);
                  }}
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
  /** Le stock visé est refermé par l'appelant : la suggestion l'ignore. */
  onPick: () => void;
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
        onClick={onPick}
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
