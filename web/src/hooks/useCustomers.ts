import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Customer } from '../types';

export interface CustomersState {
  customers: Customer[];
  reloadCustomers: () => Promise<void>;
}

/**
 * Stocks à part du local : celui d'un client qui achète à l'année, rangé au
 * même endroit que le stock général et portant les mêmes références.
 *
 * Ce hook ne tient que la liste, jamais une sélection : le stock visé se
 * choisit référence par référence, et repart du stock général à chaque fois.
 * Une même commande mélange couramment des lignes AOCCI et des lignes du stock
 * général — un mode qui resterait allumé ferait chercher au mauvais endroit
 * sans que personne s'en aperçoive.
 */
export function useCustomers(siteId: number | null): CustomersState {
  const [customers, setCustomers] = useState<Customer[]>([]);

  const reloadCustomers = useCallback(async () => {
    if (siteId === null) {
      setCustomers([]);
      return;
    }
    try {
      setCustomers(await api.customers.list(siteId));
    } catch {
      // Sans la liste, le menu disparaît et la recherche se fait au stock
      // général : c'est dégradé, mais l'outil continue de servir.
      setCustomers([]);
    }
  }, [siteId]);

  useEffect(() => {
    void reloadCustomers();
  }, [reloadCustomers]);

  return { customers, reloadCustomers };
}
