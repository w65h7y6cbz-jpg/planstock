import { useCallback, useEffect, useState } from 'react';
import { api, type RackPayload } from '../api';
import type { Rack } from '../types';

export interface RacksState {
  racks: Rack[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createRack: (payload: RackPayload) => Promise<void>;
  /** Création en série (assistant de plan) : un seul rechargement à la fin. */
  createRacks: (payloads: RackPayload[]) => Promise<void>;
  updateRack: (id: number, payload: RackPayload) => Promise<void>;
  removeRack: (id: number) => Promise<void>;
  clearError: () => void;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback;

/**
 * Rayonnages du local sélectionné : chargement, création, modification,
 * suppression. Tant qu'aucun local n'est choisi, la liste reste vide.
 */
export function useRacks(siteId: number | null): RacksState {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!siteId) {
      setRacks([]);
      setLoading(false);
      return;
    }
    try {
      setRacks(await api.racks.list(siteId));
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Impossible de charger le plan.'));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const createRack = useCallback(
    async (payload: RackPayload) => {
      try {
        await api.racks.create({ site_id: siteId ?? undefined, ...payload });
        setError(null);
        await reload();
      } catch (cause) {
        setError(messageOf(cause, 'Création du rayonnage impossible.'));
      }
    },
    [reload, siteId],
  );

  const createRacks = useCallback(
    async (payloads: RackPayload[]) => {
      try {
        for (const payload of payloads) {
          await api.racks.create({ site_id: siteId ?? undefined, ...payload });
        }
        setError(null);
      } finally {
        await reload();
      }
    },
    [reload, siteId],
  );

  const updateRack = useCallback(
    async (id: number, payload: RackPayload) => {
      // Mise à jour optimiste : le rectangle suit la souris sans attendre le serveur.
      setRacks((current) =>
        current.map((rack) => (rack.id === id ? { ...rack, ...payload } : rack)),
      );
      try {
        await api.racks.update(id, payload);
        setError(null);
        await reload();
      } catch (cause) {
        setError(messageOf(cause, 'Modification du rayonnage impossible.'));
        await reload();
      }
    },
    [reload],
  );

  const removeRack = useCallback(
    async (id: number) => {
      try {
        await api.racks.remove(id);
        setError(null);
        await reload();
      } catch (cause) {
        setError(messageOf(cause, 'Suppression du rayonnage impossible.'));
      }
    },
    [reload],
  );

  return {
    racks,
    loading,
    error,
    reload,
    createRack,
    createRacks,
    updateRack,
    removeRack,
    clearError: useCallback(() => setError(null), []),
  };
}
