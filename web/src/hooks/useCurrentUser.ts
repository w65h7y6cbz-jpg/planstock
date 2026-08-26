import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import type { SessionUser, User } from '../types';

/**
 * Technicien courant.
 *
 * Prendre un prénom ouvre une **session** : le cookie qu'elle pose identifie
 * ensuite toutes les requêtes, sans que l'interface ait à répéter qui elle est.
 *
 * Deux chemins, selon le prénom :
 * - **protégé par un code** : le pavé s'ouvre, et rien n'est sélectionné tant
 *   que le code n'est pas juste ;
 * - **sans code** : on entre directement, comme avant. C'est ce qui permet de
 *   mettre cette version en ligne sans mettre l'équipe dehors.
 *
 * Le prénom n'est plus mémorisé sur le poste : c'est la session qui fait foi,
 * et elle vit dans un cookie que le navigateur garde un mois. Mémoriser en
 * plus un identifiant laisserait croire qu'on est identifié alors que la
 * session a expiré.
 */

export interface CurrentUserState {
  users: User[];
  currentUser: SessionUser | null;
  loading: boolean;
  error: string | null;
  /** Prénom dont on attend le code, ou `null`. */
  pendingUser: User | null;
  pinError: string | null;
  pinBusy: boolean;
  /** Demande un prénom : ouvre le pavé si ce prénom a un code. */
  selectUser: (id: number | null) => void;
  submitPin: (pin: string) => Promise<void>;
  cancelPin: () => void;
  reloadUsers: () => Promise<void>;
  /** Après avoir choisi ou changé son code. */
  refreshSession: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function useCurrentUser(): CurrentUserState {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.users.list());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger les prénoms.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const { user } = await api.session.get();
      setCurrentUser(user);
    } catch {
      // Sans session lisible, on est simplement personne : la recherche marche.
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    void reloadUsers();
    void refreshSession();
  }, [reloadUsers, refreshSession]);

  const open = useCallback(
    async (userId: number, pin?: string) => {
      const { user } = await api.session.open(userId, pin);
      setCurrentUser(user);
      setPendingUser(null);
      setPinError(null);
    },
    [],
  );

  const selectUser = useCallback(
    (id: number | null) => {
      setPinError(null);

      if (id === null) {
        setPendingUser(null);
        setCurrentUser(null);
        void api.session.close().catch(() => undefined);
        return;
      }

      const user = users.find((candidate) => candidate.id === id);
      if (!user) return;

      if (user.has_pin) {
        setPendingUser(user);
        return;
      }
      void open(id).catch((cause) => setError(messageOf(cause, 'Impossible de vous identifier.')));
    },
    [users, open],
  );

  const submitPin = useCallback(
    async (pin: string) => {
      if (!pendingUser) return;
      setPinBusy(true);
      try {
        await open(pendingUser.id, pin);
      } catch (cause) {
        setPinError(messageOf(cause, 'Code refusé.'));
      } finally {
        setPinBusy(false);
      }
    },
    [pendingUser, open],
  );

  return {
    users,
    currentUser,
    loading,
    error,
    pendingUser,
    pinError,
    pinBusy,
    selectUser,
    submitPin,
    cancelPin: () => {
      setPendingUser(null);
      setPinError(null);
    },
    reloadUsers,
    refreshSession,
  };
}
