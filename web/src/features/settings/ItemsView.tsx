import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type ItemPayload } from '../../api';
import { KIND_LABELS, sideShort } from '../../lib/labels';
import type { Item, Rack, Site, User } from '../../types';
import { useCustomers } from '../../hooks/useCustomers';
import { ItemForm } from '../items/ItemForm';
import styles from './ItemsView.module.css';
import shared from './settings.module.css';

/**
 * Liste des articles du local : c'est ici qu'on corrige une référence, qu'on
 * change un emplacement à la main ou qu'on supprime une ligne. La recherche de
 * l'écran d'accueil sert à trouver ; cet écran sert à ranger.
 */

interface ItemsViewProps {
  site: Site;
  racks: Rack[];
  currentUser: User | null;
  onChanged: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function ItemsView({ site, racks, currentUser, onChanged }: ItemsViewProps) {
  const { customers } = useCustomers(site.id);
  const [items, setItems] = useState<Item[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await api.items.list(undefined, site.id));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger les articles.'));
    }
  }, [site.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = (items ?? []).filter((item) => {
    const needle = query.trim().toUpperCase();
    if (!needle) return true;
    return (
      item.reference.includes(needle.replace(/[\s\-/.]/g, '')) ||
      item.designation.toUpperCase().includes(needle)
    );
  });

  async function submit(payload: ItemPayload): Promise<boolean> {
    if (!currentUser) {
      setError('Choisis ton prénom en haut à droite avant de modifier le stock.');
      return false;
    }
    try {
      if (editing && editing !== 'new') {
        await api.items.update(currentUser.id, editing.id, payload);
      } else {
        await api.items.create(currentUser.id, payload);
      }
      setEditing(null);
      setError(null);
      await reload();
      await onChanged();
      return true;
    } catch (cause) {
      setError(messageOf(cause, 'Enregistrement impossible.'));
      return false;
    }
  }

  async function remove(item: Item) {
    if (!currentUser) return;
    if (!window.confirm(`Supprimer définitivement ${item.reference_display} ?`)) return;
    try {
      await api.items.remove(currentUser.id, item.id);
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Suppression impossible.'));
    }
  }

  if (editing) {
    return (
      <div className={styles.formPane}>
        <h2 className={shared.sectionTitle}>
          {editing === 'new' ? 'Nouvel article' : `Modifier ${editing.reference_display}`}
        </h2>
        <ItemForm
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          racks={racks}
          customers={customers}
          onSubmit={submit}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className={styles.pane}>
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrer par référence ou désignation…"
          aria-label="Filtrer les articles"
        />
        <button
          type="button"
          className={shared.primary}
          disabled={!currentUser}
          onClick={() => setEditing('new')}
        >
          + Nouvel article
        </button>
      </div>

      {error ? <p className={shared.error}>{error}</p> : null}
      {!currentUser ? (
        <p className={shared.warning}>
          Choisis ton prénom en haut à droite pour ajouter ou modifier un article.
        </p>
      ) : null}

      {items === null ? (
        <p className={shared.hint}>Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className={shared.empty}>Aucun article ne correspond.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Référence</th>
              <th>Désignation</th>
              <th>Emplacement</th>
              <th>Côté</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const location = item.locations[0] ?? null;
              return (
                <tr key={item.id}>
                  <td className={styles.ref}>{item.reference_display}</td>
                  <td className={styles.designation}>{item.designation || '—'}</td>
                  <td className={styles.code}>
                    {location ? location.code : KIND_LABELS[item.kind]}
                  </td>
                  <td className={styles.side}>{location?.side ? sideShort(location.side, location.rack_style) : '—'}</td>
                  <td className={styles.rowActions}>
                    <button
                      type="button"
                      className={shared.button}
                      disabled={!currentUser}
                      onClick={() => setEditing(item)}
                    >
                      Modifier
                    </button>
                    <button
                      type="button"
                      className={shared.danger}
                      disabled={!currentUser}
                      onClick={() => void remove(item)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
