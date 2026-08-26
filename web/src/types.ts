/** Types partagés avec l'API PlanStock (`/api/*`). */

export type ItemKind = 'physical' | 'service' | 'other_site';

/** Un rayonnage porte des étagères ; une zone (pile, palette, table…) n'en a pas. */
export type RackKind = 'rack' | 'zone';

/** Un emplacement est soit une étagère de rayonnage, soit une zone. */
export interface Location {
  kind: 'shelf' | 'zone';
  shelf_id: number | null;
  zone_id: number | null;
  /** Rayonnage ou zone porteur. */
  rack_id: number;
  rack_code: number;
  rack_kind: RackKind;
  rack_label: string;
  rack_aisle: string;
  shelf_index: number | null;
  /** `E2` pour une étagère, `Z02` pour une zone. */
  short_code: string;
  /** `R03-E2` ou `Z02` — identifiant lisible et unique d'un emplacement. */
  code: string;
}

export interface User {
  id: number;
  first_name: string;
  active: boolean;
  created_at: string;
}

export interface Item {
  id: number;
  /** Référence normalisée (majuscules, sans séparateurs). */
  reference: string;
  /** Référence telle que saisie, à réafficher. */
  reference_display: string;
  designation: string;
  kind: ItemKind;
  /** Code de famille Sage, ex. `0310` (facultatif). */
  family_code: string | null;
  /** Libellé de famille Sage, ex. `IMPRIMANTE LASER N/B TGC22` (facultatif). */
  family_label: string | null;
  created_at: string;
  updated_at: string;
  locations: Location[];
}

export type ShelfItem = Pick<
  Item,
  'id' | 'reference' | 'reference_display' | 'designation' | 'kind' | 'family_code' | 'family_label'
>;

/** Bande d'étagère de la vue de face, avec les articles qu'elle porte. */
export interface Shelf {
  id: number;
  rack_id: number;
  rack_code: number;
  /** 1 = étagère du haut. */
  shelf_index: number;
  short_code: string;
  code: string;
  items: ShelfItem[];
}

export interface Rack {
  id: number;
  code: number;
  kind: RackKind;
  is_zone: boolean;
  /** `R03` ou `Z01` */
  rack_code: string;
  label: string;
  /** Libellé d'allée facultatif, affiché en petit sur la vue de dessus. */
  aisle: string;
  shelves_count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  items_count: number;
  created_at: string;
}

export interface RackDetail extends Rack {
  /** Vide pour une zone. */
  shelves: Shelf[];
  /** Articles posés directement sur la zone ; vide pour un rayonnage. */
  items: ShelfItem[];
}

export interface Movement {
  id: number;
  item_id: number | null;
  item_reference: string;
  item_designation: string;
  user_id: number | null;
  user_first_name: string;
  action: 'create' | 'move' | 'delete' | 'update';
  from_code: string | null;
  to_code: string | null;
  created_at: string;
}

export interface SearchResult {
  query: string;
  normalized: string;
  exact: Item | null;
  matches: Item[];
}

export interface Health {
  ok: boolean;
  counts: { users: number; racks: number; items: number };
  /** Base sans emplacement ni article : déclenche le mode Inventaire initial. */
  empty: boolean;
}

export type Settings = Record<string, string>;

export interface Backup {
  name: string;
  /** Taille du fichier en octets. */
  size: number;
  created_at: string;
}
