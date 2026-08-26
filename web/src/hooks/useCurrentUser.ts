import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { User } from '../types';

const STORAGE_KEY = 'planstock.user_id';

function readStoredUserId(): number | null {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export interface CurrentUserState {
  users: User[];
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  selectUser: (id: number | null) => void;
  reloadUsers: () => Promise<void>;
}

/**
 * Prénom du technicien courant. Pas d'authentification : un simple choix dans
 * une liste, mémorisé sur ce poste, exigé avant toute modification du stock.
 */
export function useCurrentUser(): CurrentUserState {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(readStoredUserId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.users.list();
      setUsers(list);
      setError(null);
      // Un prénom désactivé ou supprimé entre deux sessions ne doit pas rester actif.
      setCurrentUserId((current) =>
        current !== null && list.some((user) => user.id === current) ? current : null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger les prénoms.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadUsers();
  }, [reloadUsers]);

  useEffect(() => {
    try {
      if (currentUserId === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(currentUserId));
    } catch {
      // Sans stockage local, le choix vaut pour la session en cours.
    }
  }, [currentUserId]);

  return {
    users,
    currentUser: users.find((user) => user.id === currentUserId) ?? null,
    loading,
    error,
    selectUser: setCurrentUserId,
    reloadUsers,
  };
}
