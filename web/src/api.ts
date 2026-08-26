import type {
  Customer,
  Health,
  Item,
  ItemKind,
  Landmark,
  Movement,
  Rack,
  RackDetail,
  RackKind,
  SearchResult,
  Settings,
  Shelf,
  Side,
  Site,
  User,
} from './types';

/** Erreur d'API portant le message français renvoyé par le serveur. */
export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details: unknown = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
  } catch {
    throw new ApiError(0, 'PlanStock ne répond pas. Vérifie la connexion Internet du magasin.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      (payload as { error?: string } | null)?.error ?? 'Erreur inattendue du serveur.';
    throw new ApiError(response.status, message, (payload as { details?: unknown })?.details);
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

/** Payloads de modification : le prénom sélectionné accompagne chaque écriture. */
export interface ItemPayload {
  reference: string;
  designation?: string;
  kind?: ItemKind;
  family_code?: string | null;
  family_label?: string | null;
  /** Étagère de destination — exclusif avec `zone_id`. */
  shelf_id?: number | null;
  /** Zone de destination — exclusif avec `shelf_id`. */
  zone_id?: number | null;
  /** Côté d'étagère, facultatif ; ignoré pour une zone. */
  side?: Side | null;
}

export interface RackPayload {
  site_id?: number;
  code?: number;
  kind?: RackKind;
  label?: string;
  aisle?: string;
  shelves_count?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
}

/** État du contrôle d'accès, renvoyé même à une connexion refusée. */
export interface AccessState {
  open: boolean;
  can_use_code: boolean;
  /** Adresse publique vue par Cloudflare, à recopier dans les réglages. */
  your_ip: string;
}

export interface BackupFile {
  format: string;
  exported_at: string;
  tables: Record<string, unknown[]>;
}

export const api = {
  health: () => request<Health>('/health'),

  access: {
    get: () => request<AccessState>('/access'),
    submit: (code: string) =>
      request<{ open: boolean }>('/access', { method: 'POST', ...json({ code }) }),
  },

  users: {
    list: (includeInactive = false) =>
      request<User[]>(`/users${includeInactive ? '?all=1' : ''}`),
    create: (firstName: string) =>
      request<User>('/users', { method: 'POST', ...json({ first_name: firstName }) }),
    update: (id: number, changes: { first_name?: string; active?: boolean }) =>
      request<User>(`/users/${id}`, { method: 'PATCH', ...json(changes) }),
  },

  sites: {
    list: () => request<Site[]>('/sites'),
    update: (
      id: number,
      changes: {
        name?: string;
        accent?: string;
        logo?: string;
        plan_width?: number;
        plan_height?: number;
      },
    ) => request<Site>(`/sites/${id}`, { method: 'PATCH', ...json(changes) }),
  },

  landmarks: {
    list: (siteId: number) => request<Landmark[]>(`/landmarks?site_id=${siteId}`),
    create: (payload: {
      site_id: number;
      kind: 'door' | 'bench';
      label?: string;
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }) => request<Landmark>('/landmarks', { method: 'POST', ...json(payload) }),
    update: (
      id: number,
      changes: { label?: string; x?: number; y?: number; width?: number; height?: number },
    ) => request<Landmark>(`/landmarks/${id}`, { method: 'PATCH', ...json(changes) }),
    remove: (id: number) => request<{ deleted: boolean }>(`/landmarks/${id}`, { method: 'DELETE' }),
  },

  racks: {
    list: (siteId?: number) => request<Rack[]>(`/racks${siteId ? `?site_id=${siteId}` : ''}`),
    get: (id: number) => request<RackDetail>(`/racks/${id}`),
    shelves: (id: number) => request<Shelf[]>(`/racks/${id}/shelves`),
    create: (payload: RackPayload) =>
      request<RackDetail>('/racks', { method: 'POST', ...json(payload) }),
    update: (id: number, payload: RackPayload) =>
      request<RackDetail>(`/racks/${id}`, { method: 'PATCH', ...json(payload) }),
    remove: (id: number) => request<{ deleted: boolean }>(`/racks/${id}`, { method: 'DELETE' }),
  },

  items: {
    list: (query?: string, siteId?: number) => {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (siteId) params.set('site_id', String(siteId));
      const search = params.toString();
      return request<Item[]>(`/items${search ? `?${search}` : ''}`);
    },
    /**
     * La recherche ne franchit pas la frontière entre les deux locaux.
     * `customerId` la restreint à un stock à part ; sans lui, elle ne voit
     * que le stock général du local.
     */
    search: (query: string, siteId?: number, customerId?: number | null) => {
      const params = new URLSearchParams({ q: query });
      if (siteId) params.set('site_id', String(siteId));
      if (customerId) params.set('customer_id', String(customerId));
      return request<SearchResult>(`/items/search?${params}`);
    },
    get: (id: number) => request<Item>(`/items/${id}`),
    create: (userId: number, payload: ItemPayload) =>
      request<Item>('/items', { method: 'POST', ...json({ user_id: userId, ...payload }) }),
    update: (userId: number, id: number, payload: Partial<ItemPayload>) =>
      request<Item>(`/items/${id}`, { method: 'PATCH', ...json({ user_id: userId, ...payload }) }),
    move: (
      userId: number,
      id: number,
      target: {
        shelf_id?: number;
        zone_id?: number;
        side?: Side | null;
        /** Stock à part de destination ; absent = stock général. */
        customer_id?: number | null;
      },
    ) =>
      request<Item>(`/items/${id}/location`, {
        method: 'PUT',
        ...json({ user_id: userId, ...target }),
      }),
    remove: (userId: number, id: number) =>
      request<{ deleted: boolean }>(`/items/${id}`, {
        method: 'DELETE',
        ...json({ user_id: userId }),
      }),
  },

  /**
   * Stocks à part d'un local : celui d'un client qui achète à l'année, rangé
   * au même endroit que le stock général et portant les mêmes références.
   */
  customers: {
    list: (siteId: number) => request<Customer[]>(`/customers?site_id=${siteId}`),
    create: (siteId: number, name: string) =>
      request<Customer>('/customers', { method: 'POST', ...json({ site_id: siteId, name }) }),
    rename: (id: number, name: string) =>
      request<Customer>(`/customers/${id}`, { method: 'PATCH', ...json({ name }) }),
    remove: (id: number) =>
      request<{ deleted: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
  },

  movements: {
    list: (reference?: string) =>
      request<Movement[]>(
        `/movements${reference ? `?reference=${encodeURIComponent(reference)}` : ''}`,
      ),
  },

  settings: {
    get: () => request<Settings>('/settings'),
    update: (changes: Settings) => request<Settings>('/settings', { method: 'PUT', ...json(changes) }),
  },

  backups: {
    /** Ce que pèse la base, table par table. */
    counts: () => request<{ format: string; counts: Record<string, number> }>('/backups'),
    /** Adresse du fichier à télécharger : le navigateur s'en charge. */
    exportUrl: () => '/api/backups/export',
    restore: (userId: number, backup: BackupFile) =>
      request<{ restored: boolean; counts: Record<string, number> }>('/backups/restore', {
        method: 'POST',
        ...json({ user_id: userId, backup }),
      }),
  },

  demo: {
    status: () => request<{ available: boolean }>('/demo'),
    seed: (userId: number) =>
      request<{ racks: number; zones: number; items: number }>('/demo', {
        method: 'POST',
        ...json({ user_id: userId }),
      }),
  },

  /** Le CSV est produit par le Worker ; le .xlsx est assemblé par le navigateur. */
  exportCsvUrl: (siteId?: number) => `/api/export/csv${siteId ? `?site_id=${siteId}` : ''}`,
  exportRows: (siteId?: number) =>
    request<{ headers: string[]; rows: (string | number)[][] }>(
      `/export/rows${siteId ? `?site_id=${siteId}` : ''}`,
    ),
};
