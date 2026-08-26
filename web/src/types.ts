/** Types partagés avec l'API PlanStock (`/api/*`). */

/** `other_site` reste la valeur en base ; l'interface l'appelle « Hors PlanStock ». */
export type ItemKind = 'physical' | 'service' | 'other_site';

/** Un rayonnage porte des étagères ; une zone (pile, palette, table…) n'en a pas. */
export type RackKind = 'rack' | 'zone';

/** Côté d'une étagère, indication facultative pour affiner la recherche à l'œil. */
export type Side = 'left' | 'center' | 'right';

/** Un des deux locaux couverts par l'application. */
export interface Site {
  id: number;
  /** `optimium`, `sharp-center` */
  code: string;
  name: string;
  /** Couleur d'accent du local, en hexadécimal. */
  accent: string;
  /** Nom de fichier dans `public/logos/`, vide si aucun logo fourni. */
  logo: string;
  position: number;
  plan_width: number;
  plan_height: number;
  racks_count: number;
  zones_count: number;
  items_count: number;
  created_at: string;
}

/** Repère du local : il aide à se situer et ne stocke aucun article. */
export interface Landmark {
  id: number;
  site_id: number;
  kind: 'door' | 'bench';
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Orientation en degrés : une porte est rarement d'équerre avec les murs. */
  angle: number;
  created_at: string;
}

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
  /** Aspect du meuble porteur : une gondole se range sur des broches. */
  rack_style: string;
  shelf_index: number | null;
  /** Gauche / centre / droite, ou `null` si non précisé. */
  side: Side | null;
  /**
   * Stock à part auquel ce rangement appartient, ou `null` pour le stock
   * général du local. Un stock à part occupe les mêmes meubles que le stock
   * général : seule cette appartenance les distingue.
   */
  customer_id: number | null;
  customer_name: string;
  site_id: number | null;
  site_code: string;
  site_name: string;
  /** `E2` pour une étagère, `Z02` pour une zone. */
  short_code: string;
  /** `R03-E2` ou `Z02` — identifiant lisible et unique d'un emplacement. */
  code: string;
}

/**
 * Stock à part d'un local : celui d'un client qui achète à l'année, rangé au
 * même endroit que le stock général et portant les mêmes références.
 */
export interface Customer {
  id: number;
  site_id: number;
  name: string;
  /** Nombre de rangements qui lui appartiennent. */
  reserved_count: number;
  created_at: string;
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
> & { side: Side | null };

/** Étagère d'un rayonnage, avec les articles qu'elle porte. */
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
  site_id: number;
  code: number;
  kind: RackKind;
  is_zone: boolean;
  /** `R03` ou `Z01` */
  rack_code: string;
  label: string;
  /** Libellé d'allée facultatif, qui donne sa couleur au rayonnage. */
  aisle: string;
  shelves_count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Conservée par le schéma, remplacée par `angle` : plus rien ne la lit. */
  rotation: number;
  /** Orientation en degrés, dans [0, 360[. Libre, pas seulement le quart de tour. */
  angle: number;
  /** Aspect : `''` rayonnage classique, `pegboard` gondole à broches, servie des deux côtés. */
  style: string;
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
  /** Correspondances de référence, par préfixe. */
  matches: Item[];
  /** Correspondances de désignation, sans doublon avec `matches`. */
  by_designation: Item[];
}

export interface Health {
  ok: boolean;
  counts: { users: number; sites: number; racks: number; items: number };
  /** Base sans emplacement ni article : déclenche le mode Inventaire initial. */
  empty: boolean;
}

export type Settings = Record<string, string>;
