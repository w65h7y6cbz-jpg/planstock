import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api';
import type { Customer, Site } from '../../types';
import styles from './settings.module.css';

/**
 * Stocks à part du local.
 *
 * Un stock à part, c'est celui d'un client qui achète à l'année : il porte les
 * mêmes références que le stock général et se range **au même endroit**, sur
 * les mêmes étagères. Seule son appartenance l'en distingue.
 *
 * C'est ici qu'on alimente le menu déroulant de la recherche.
 */

interface CustomersViewProps {
  site: Site;
  /** Rafraîchit le menu de la recherche après tout changement. */
  onChanged: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function CustomersView({ site, onChanged }: CustomersViewProps) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setCustomers(await api.customers.list(site.id));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger les stocks à part.'));
    }
  }, [site.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      await api.customers.create(site.id, name.trim());
      setName('');
      setError(null);
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Ajout impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function rename(customer: Customer, next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === customer.name) return;
    setBusy(true);
    try {
      await api.customers.rename(customer.id, trimmed);
      setError(null);
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Renommage impossible.'));
      // La ligne garde la valeur tapée à l'écran : on la remet d'aplomb.
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function remove(customer: Customer) {
    if (
      !window.confirm(
        `Supprimer le stock « ${customer.name} » ? Il disparaîtra du menu de la recherche.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await api.customers.remove(customer.id);
      setError(null);
      await reload();
      await onChanged();
    } catch (cause) {
      // Le serveur refuse tant qu'il reste des références rangées : son message
      // dit combien, et c'est l'information utile.
      setError(messageOf(cause, 'Suppression impossible.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.view}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Stocks à part de {site.name}</h3>
        <p className={styles.hint}>
          Un stock à part porte les mêmes références que le stock général et se range{' '}
          <strong>au même endroit</strong>, sur les mêmes étagères. C’est celui d’un client qui
          achète à l’année : la marchandise lui est réservée, même si elle voisine avec celle de
          tout le monde.
        </p>
        <p className={styles.hint}>
          Chaque nom ajouté ici apparaît dans le menu <strong>« Chercher dans »</strong> de la
          recherche. Ce menu revient au stock général après chaque référence : une commande peut
          mélanger des lignes réservées et des lignes ordinaires sans qu’on s’y perde.
        </p>

        {customers === null ? (
          <p className={styles.empty}>Chargement…</p>
        ) : customers.length === 0 ? (
          <p className={styles.empty}>
            Aucun stock à part. Tout ce qui est rangé dans {site.name} appartient au stock général.
          </p>
        ) : (
          <ul className={styles.list}>
            {customers.map((customer) => (
              <li key={customer.id} className={styles.listRow}>
                <input
                  className={styles.name}
                  type="text"
                  defaultValue={customer.name}
                  aria-label={`Nom du stock ${customer.name}`}
                  maxLength={60}
                  disabled={busy}
                  onBlur={(event) => void rename(customer, event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
                <span className={styles.badge}>
                  {customer.reserved_count === 0
                    ? 'vide'
                    : `${customer.reserved_count} rangement${customer.reserved_count > 1 ? 's' : ''}`}
                </span>
                <button
                  type="button"
                  className={`${styles.button} ${styles.danger}`}
                  disabled={busy}
                  onClick={() => void remove(customer)}
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className={styles.section} onSubmit={add}>
        <h3 className={styles.sectionTitle}>Ajouter un stock</h3>
        <div className={styles.row}>
          <label className={styles.field}>
            Nom
            <input
              type="text"
              value={name}
              placeholder="AOCCI"
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={busy || !name.trim()}
          >
            Ajouter
          </button>
        </div>
        <p className={styles.hint}>
          Un stock qui contient encore des références ne se supprime pas : reversez-les d’abord au
          stock général, pour qu’aucun rangement ne disparaisse sans qu’on l’ait voulu.
        </p>
      </form>
    </div>
  );
}
