import type {
  Backup,
  Health,
  Item,
  ItemKind,
  Movement,
  Rack,
  RackDetail,
  RackKind,
  SearchResult,
  Settings,
  Shelf,
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
    throw new ApiError(0, 'Le serveur PlanStock ne répond pas. Est-il bien démarré ?');
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
}

export interface RackPayload {
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

export const api = {
  health: () => request<Health>('/health'),

  users: {
    list: (includeInactive = false) =>
      request<User[]>(`/users${includeInactive ? '?all=1' : ''}`),
    create: (firstName: string) =>
      request<User>('/users', { method: 'POST', ...json({ first_name: firstName }) }),
    update: (id: number, changes: { first_name?: string; active?: boolean }) =>
      request<User>(`/users/${id}`, { method: 'PATCH', ...json(changes) }),
  },

  racks: {
    list: () => request<Rack[]>('/racks'),
    get: (id: number) => request<RackDetail>(`/racks/${id}`),
    shelves: (id: number) => request<Shelf[]>(`/racks/${id}/shelves`),
    create: (payload: RackPayload) =>
      request<RackDetail>('/racks', { method: 'POST', ...json(payload) }),
    update: (id: number, payload: RackPayload) =>
      request<RackDetail>(`/racks/${id}`, { method: 'PATCH', ...json(payload) }),
    remove: (id: number) => request<{ deleted: boolean }>(`/racks/${id}`, { method: 'DELETE' }),
  },

  items: {
    list: (query?: string) =>
      request<Item[]>(`/items${query ? `?q=${encodeURIComponent(query)}` : ''}`),
    search: (query: string) =>
      request<SearchResult>(`/items/search?q=${encodeURIComponent(query)}`),
    get: (id: number) => request<Item>(`/items/${id}`),
    create: (userId: number, payload: ItemPayload) =>
      request<Item>('/items', { method: 'POST', ...json({ user_id: userId, ...payload }) }),
    update: (userId: number, id: number, payload: Partial<ItemPayload>) =>
      request<Item>(`/items/${id}`, { method: 'PATCH', ...json({ user_id: userId, ...payload }) }),
    move: (userId: number, id: number, target: { shelf_id?: number; zone_id?: number }) =>
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
    list: () => request<Backup[]>('/backups'),
    create: (userId: number) =>
      request<{ created: string }>('/backups', { method: 'POST', ...json({ user_id: userId }) }),
    restore: (userId: number, name: string) =>
      request<{ restored: string; safetyBackup: string }>(
        `/backups/${encodeURIComponent(name)}/restore`,
        { method: 'POST', ...json({ user_id: userId }) },
      ),
  },

  demo: {
    status: () => request<{ available: boolean }>('/demo'),
    seed: (userId: number) =>
      request<{ racks: number; zones: number; items: number }>('/demo', {
        method: 'POST',
        ...json({ user_id: userId }),
      }),
  },

  exportUrl: (format: 'xlsx' | 'csv') => `/api/export/${format}`,
};
