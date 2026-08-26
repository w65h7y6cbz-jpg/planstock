import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Site } from '../types';

const STORAGE_KEY = 'planstock.site_id';

/** Code du local de démonstration, masqué de l'écran de choix. */
export const DEMO_CODE = 'demo';

function readStoredSiteId(): number | null {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

/**
 * `planstock.lifepilot.win/?demo` ouvre le local de démonstration.
 *
 * L'adresse plutôt qu'une tuile de plus : l'équipe retrouve le matin l'écran
 * qu'elle connaît, à deux locaux, et la démonstration ne se lance que quand on
 * la demande. C'est aussi ce qui permet d'envoyer le lien à quelqu'un sans lui
 * expliquer où cliquer.
 */
export const wantsDemo = () =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');

export interface SitesState {
  sites: Site[];
  /** Local courant, ou `null` tant que l'écran de choix n'a pas été passé. */
  site: Site | null;
  loading: boolean;
  error: string | null;
  /** Le local courant est celui de démonstration : rien ici n'est réel. */
  isDemo: boolean;
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
    const demo = wantsDemo();
    try {
      const list = await api.sites.list(demo);
      setSites(list);
      setError(null);

      const demoSite = demo ? list.find((site) => site.code === DEMO_CODE) : undefined;
      setSiteId((current) => {
        // L'adresse `?demo` l'emporte sur le local mémorisé : on est venu pour
        // la démonstration, pas pour reprendre là où le poste s'était arrêté.
        if (demoSite) return demoSite.id;
        // Un local disparu entre deux sessions ne doit pas rester sélectionné.
        return current !== null && list.some((site) => site.id === current) ? current : null;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de charger les locaux.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadSites();
  }, [reloadSites]);

  const site = sites.find((candidate) => candidate.id === siteId) ?? null;
  const isDemo = site?.code === DEMO_CODE;

  useEffect(() => {
    try {
      // La démonstration ne se mémorise pas : sans elle, on reviendrait dessus
      // au prochain lancement sans avoir rien demandé.
      if (siteId === null || isDemo) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(siteId));
    } catch {
      // Sans stockage local, le choix vaut pour la session en cours.
    }
  }, [siteId, isDemo]);

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

  return { sites, site, loading, error, isDemo, selectSite: setSiteId, reloadSites };
}

/** Texte lisible sur une couleur de fond : luminance relative simplifiée. */
export function readableOn(hex: string): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#14171e' : '#ffffff';
}
