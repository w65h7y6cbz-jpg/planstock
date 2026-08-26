import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../../api';
import { Modal } from '../../components/Modal';
import { PinPad } from '../../components/PinPad';
import { useCustomers } from '../../hooks/useCustomers';
import type { SessionUser, Site, User } from '../../types';
import styles from './settings.module.css';

/**
 * L'équipe : les prénoms, leur code et leurs droits.
 *
 * Un prénom sans code fonctionne comme avant — c'est ce qui permet de mettre
 * cette version en ligne sans mettre personne dehors — mais il n'est alors
 * qu'une étiquette : n'importe qui peut le prendre. L'écran le dit franchement
 * plutôt que de laisser croire à une protection qui n'existe pas.
 */

interface UsersViewProps {
  site: Site;
  currentUser: SessionUser | null;
  onChanged: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

const PERMISSIONS = [
  { key: 'can_move', label: 'Déplacer', hint: 'Changer l’emplacement d’une référence' },
  { key: 'can_delete', label: 'Supprimer', hint: 'Effacer une référence de PlanStock' },
  { key: 'can_admin', label: 'Plan et réglages', hint: 'Meubles, murs, stocks, équipe' },
] as const;

export function UsersView({ site, currentUser, onChanged }: UsersViewProps) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Prénom dont on est en train de choisir le code. */
  const [pinFor, setPinFor] = useState<User | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState<string | null>(null);
  const { customers } = useCustomers(site.id);

  const reload = useCallback(async () => {
    try {
      setUsers(await api.users.list(true));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger la liste des prénoms.'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function guard(run: () => Promise<unknown>) {
    setBusy(true);
    try {
      await run();
      setError(null);
      await reload();
      await onChanged();
    } catch (cause) {
      setError(messageOf(cause, 'Opération impossible.'));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  /** Changer un code déjà posé demande l'ancien : deux passages au pavé. */
  async function submitPin(pin: string) {
    if (!pinFor) return;

    if (pinFor.has_pin && currentPin === null) {
      setCurrentPin(pin);
      setPinError(null);
      return;
    }

    setBusy(true);
    try {
      await api.session.setPin(pinFor.id, pin, currentPin ?? undefined);
      setPinFor(null);
      setCurrentPin(null);
      setPinError(null);
      setError(null);
      await reload();
      await onChanged();
    } catch (cause) {
      setPinError(messageOf(cause, 'Code refusé.'));
      // Ancien code refusé : on repart du début plutôt que de laisser croire
      // qu'il est passé.
      setCurrentPin(null);
    } finally {
      setBusy(false);
    }
  }

  const actifs = users?.filter((user) => user.active).length ?? 0;
  const sansCode = users?.filter((user) => user.active && !user.has_pin).length ?? 0;

  return (
    <div className={styles.view}>
      {error ? <p className={styles.error}>{error}</p> : null}

      {sansCode > 0 ? (
        <p className={styles.warning}>
          {sansCode === 1 ? 'Un prénom n’a' : `${sansCode} prénoms n’ont`} pas encore de code.{' '}
          {sansCode === 1 ? 'Il' : 'Ils'} fonctionne{sansCode === 1 ? '' : 'nt'} comme avant —{' '}
          <strong>n’importe qui peut {sansCode === 1 ? 'le' : 'les'} prendre</strong>. Les droits ne
          protègent vraiment qu’une fois le code posé.
        </p>
      ) : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Techniciens ({actifs} actif(s))</h3>
        <p className={styles.hint}>
          Un prénom désactivé disparaît du sélecteur mais reste lisible dans l’historique : les
          mouvements qu’il a enregistrés gardent son nom.
        </p>

        {users === null ? (
          <p className={styles.empty}>Chargement…</p>
        ) : (
          <ul className={`${styles.list} ${styles.listTall}`}>
            {users.map((user) => (
              <li
                key={user.id}
                className={`${styles.listRow} ${user.active ? '' : styles.listRowInactive}`}
              >
                <div className={styles.userBlock}>
                  <div className={styles.userHead}>
                    <input
                      className={styles.name}
                      type="text"
                      defaultValue={user.first_name}
                      aria-label={`Prénom de ${user.first_name}`}
                      disabled={busy}
                      onBlur={(event) => {
                        const next = event.target.value.trim();
                        if (next && next !== user.first_name) {
                          void guard(() => api.users.update(user.id, { first_name: next }));
                        }
                      }}
                      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
                    />
                    {currentUser?.id === user.id ? (
                      <span className={styles.badge}>vous</span>
                    ) : null}
                    <span className={styles.badge}>
                      {user.has_pin ? '🔒 code posé' : 'sans code'}
                    </span>
                    {user.active ? null : <span className={styles.badge}>désactivé</span>}
                  </div>

                  <div className={styles.permRow}>
                    {PERMISSIONS.map((permission) => (
                      <label key={permission.key} className={styles.check} title={permission.hint}>
                        <input
                          type="checkbox"
                          checked={user[permission.key]}
                          disabled={busy}
                          onChange={(event) =>
                            void guard(() =>
                              api.users.update(user.id, {
                                [permission.key]: event.target.checked,
                              }),
                            )
                          }
                        />
                        {permission.label}
                      </label>
                    ))}
                  </div>

                  {customers.length > 0 ? (
                    <div className={styles.permRow}>
                      <label className={styles.check} title="Limiter les stocks à part visibles">
                        <input
                          type="checkbox"
                          checked={user.restrict_customers}
                          disabled={busy}
                          onChange={(event) =>
                            void guard(() =>
                              api.users.update(user.id, {
                                restrict_customers: event.target.checked,
                              }),
                            )
                          }
                        />
                        Limiter ses stocks à part
                      </label>
                      {user.restrict_customers ? null : (
                        <span className={styles.hint}>
                          cherche dans tous les stocks à part du local
                        </span>
                      )}
                    </div>
                  ) : null}

                  {customers.length > 0 && user.restrict_customers ? (
                    <div className={styles.stockRow}>
                      {customers.map((customer) => {
                        const granted = user.customer_ids.includes(customer.id);
                        return (
                          <label key={customer.id} className={styles.check}>
                            <input
                              type="checkbox"
                              checked={granted}
                              disabled={busy}
                              onChange={() =>
                                void guard(() =>
                                  api.users.update(user.id, {
                                    customer_ids: granted
                                      ? user.customer_ids.filter((id) => id !== customer.id)
                                      : [...user.customer_ids, customer.id],
                                  }),
                                )
                              }
                            />
                            {customer.name}
                          </label>
                        );
                      })}
                      {user.customer_ids.length === 0 ? (
                        <span className={styles.hint}>
                          aucun stock coché : ce prénom ne cherche que dans le stock général
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={styles.button}
                  disabled={busy}
                  onClick={() => {
                    setPinFor(user);
                    setCurrentPin(null);
                    setPinError(null);
                  }}
                >
                  {user.has_pin ? 'Changer le code' : 'Choisir un code'}
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${user.active ? styles.danger : ''}`}
                  disabled={busy}
                  onClick={() => void guard(() => api.users.update(user.id, { active: !user.active }))}
                >
                  {user.active ? 'Désactiver' : 'Réactiver'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className={styles.section}
        onSubmit={(event) => {
          event.preventDefault();
          if (!firstName.trim()) return;
          void guard(async () => {
            await api.users.create(firstName.trim());
            setFirstName('');
          });
        }}
      >
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
        <p className={styles.hint}>
          Un prénom ajouté démarre avec tous les droits, comme ceux déjà en place. C’est à toi de
          restreindre : l’inverse surprendrait quelqu’un en plein travail.
        </p>
      </form>

      {pinFor ? (
        <Modal
          title={pinFor.first_name}
          width={360}
          onClose={() => {
            setPinFor(null);
            setCurrentPin(null);
            setPinError(null);
          }}
        >
          <PinPad
            title={
              pinFor.has_pin && currentPin === null
                ? `Code actuel de ${pinFor.first_name}`
                : `Nouveau code de ${pinFor.first_name}`
            }
            hint={
              pinFor.has_pin && currentPin === null
                ? 'Changer un code demande d’abord l’ancien.'
                : 'Quatre chiffres. Évite une date de naissance ou 1234.'
            }
            error={pinError}
            busy={busy}
            onSubmit={(pin) => void submitPin(pin)}
            onCancel={() => {
              setPinFor(null);
              setCurrentPin(null);
              setPinError(null);
            }}
          />
        </Modal>
      ) : null}
    </div>
  );
}
