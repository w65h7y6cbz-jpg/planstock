import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api';
import type { User } from '../../types';
import styles from './settings.module.css';

interface UsersViewProps {
  currentUser: User | null;
  onChanged: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

/** Liste des prénoms des techniciens. Pas de mot de passe, pas de rôle. */
export function UsersView({ currentUser, onChanged }: UsersViewProps) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      // `all=1` inclut les prénoms désactivés, invisibles dans le sélecteur.
      setUsers(await api.users.list(true));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger la liste des prénoms.'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !firstName.trim()) return;
    setBusy(true);
    try {
      await api.users.create(firstName.trim());
      setFirstName('');
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Ajout impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function setActive(user: User, active: boolean) {
    setBusy(true);
    try {
      await api.users.update(user.id, { active });
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Modification impossible.'));
    } finally {
      setBusy(false);
    }
  }

  async function rename(user: User, next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === user.first_name) return;
    setBusy(true);
    try {
      await api.users.update(user.id, { first_name: trimmed });
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Renommage impossible.'));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const actifs = users?.filter((user) => user.active).length ?? 0;

  return (
    <div className={styles.view}>
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Techniciens ({actifs} actif(s))</h3>
        <p className={styles.hint}>
          Un prénom désactivé disparaît du sélecteur mais reste lisible dans l’historique : les
          mouvements qu’il a enregistrés gardent son nom.
        </p>

        {users === null ? (
          <p className={styles.empty}>Chargement…</p>
        ) : users.length === 0 ? (
          <p className={styles.empty}>Aucun prénom enregistré.</p>
        ) : (
          <ul className={styles.list}>
            {users.map((user) => (
              <li
                key={user.id}
                className={`${styles.listRow} ${user.active ? '' : styles.listRowInactive}`}
              >
                <input
                  className={styles.name}
                  type="text"
                  defaultValue={user.first_name}
                  aria-label={`Prénom de ${user.first_name}`}
                  disabled={busy}
                  onBlur={(event) => void rename(user, event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                />
                {currentUser?.id === user.id ? <span className={styles.badge}>vous</span> : null}
                {user.active ? null : <span className={styles.badge}>désactivé</span>}
                <button
                  type="button"
                  className={`${styles.button} ${user.active ? styles.danger : ''}`}
                  disabled={busy}
                  onClick={() => void setActive(user, !user.active)}
                >
                  {user.active ? 'Désactiver' : 'Réactiver'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form className={styles.section} onSubmit={add}>
        <h3 className={styles.sectionTitle}>Ajouter un prénom</h3>
        <div className={styles.row}>
          <label className={styles.field}>
            Prénom
            <input
              type="text"
              value={firstName}
              placeholder="Marc"
              maxLength={40}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </label>
          <button
            type="submit"
            className={`${styles.button} ${styles.primary}`}
            disabled={busy || !firstName.trim()}
          >
            Ajouter
          </button>
        </div>
      </form>
    </div>
  );
}
