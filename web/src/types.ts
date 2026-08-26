/** Types partagés avec l'API PlanStock (`/api/*`). */

export type ItemKind = 'physical' | 'service' | 'other_site';

export interface User {
  id: number;
  first_name: string;
  active: boolean;
  created_at: string;
}

export interface Location {
  slot_id: number;
  rack_id: number;
  rack_code: number;
  rack_label: string;
  shelf_index: number;
  slot_index: number;
  /** `E2-C4` */
  short_code: string;
  /** `R03-E2-C4` */
  code: string;
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

export type SlotItem = Pick<
  Item,
  'id' | 'reference' | 'reference_display' | 'designation' | 'kind' | 'family_code' | 'family_label'
>;

export interface SlotContent {
  id: number;
  rack_id: number;
  rack_code: number;
  shelf_index: number;
  slot_index: number;
  short_code: string;
  code: string;
  items: SlotItem[];
}

export interface Rack {
  id: number;
  code: number;
  /** `R03` */
  rack_code: string;
  label: string;
  shelves_count: number;
  slots_per_shelf: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  slots_total: number;
  items_count: number;
  created_at: string;
}

export interface RackDetail extends Rack {
  slots: SlotContent[];
}

export interface Movement {
  id: number;
  item_id: number | null;
  item_reference: string;
  item_designation: string;
  user_id: number | null;
  user_first_name: string;
  action: 'create' | 'move' | 'delete' | 'update';
  from_slot_id: number | null;
  from_slot_code: string | null;
  to_slot_id: number | null;
  to_slot_code: string | null;
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
  /** Base sans rayonnage ni article : déclenche le mode Inventaire initial. */
  empty: boolean;
}

export type Settings = Record<string, string>;
