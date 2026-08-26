import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Site } from '../types';

const STORAGE_KEY = 'planstock.site_id';

function readStoredSiteId(): number | null {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

export interface SitesState {
  sites: Site[];
  /** Local courant, ou `null` tant que l'écran de choix n'a pas été passé. */
  site: Site | null;
  loading: boolean;
  error: string | null;
  selectSite: (id: number | null) => void;
  reloadSites: () => Promise<void>;
}

/**
 * Local sélectionné (Optimium ou Sharp Center). Le choix se fait une fois au
 * démarrage puis reste mémorisé sur ce poste ; la couleur d'accent de toute
 * l'application suit le local, en écrasant `--accent` à la racine du document.
 */
export function useSites(): SitesState {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<number | null>(readStoredSiteId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadSites = useCallback(async () => {
    try {
      const list = await api.sites.list();
      setSites(list);
      setError(null);
      // Un local disparu entre deux sessions ne doit pas rester sélectionné.
      setSiteId((current) =>
        current !== null && list.some((site) => site.id === current) ? current : null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger les locaux.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSites();
  }, [reloadSites]);

  useEffect(() => {
    try {
      if (siteId === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(siteId));
    } catch {
      // Sans stockage local, le choix vaut pour la session en cours.
    }
  }, [siteId]);

  const site = sites.find((candidate) => candidate.id === siteId) ?? null;

  useEffect(() => {
    const root = document.documentElement;
    if (site) {
      root.style.setProperty('--accent', site.accent);
      // Blanc ou noir sur la couleur du local, selon sa luminosité perçue.
      root.style.setProperty('--accent-contrast', readableOn(site.accent));
    } else {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-contrast');
    }
  }, [site]);

  return { sites, site, loading, error, selectSite: setSiteId, reloadSites };
}

/** Texte lisible sur une couleur de fond : luminance relative simplifiée. */
export function readableOn(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#14171e' : '#ffffff';
}
