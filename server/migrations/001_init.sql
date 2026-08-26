-- PlanStock — schéma initial.
-- Aucune quantité, aucun prix, aucune donnée de commande : uniquement
-- « quelle référence se trouve à quel emplacement physique ».

CREATE TABLE users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name  TEXT    NOT NULL UNIQUE,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  TEXT    NOT NULL
);

-- Rayonnages. x/y/width/height sont exprimés en pourcentage du plan (0-100)
-- pour rester indépendants de la taille d'écran.
CREATE TABLE racks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            INTEGER NOT NULL UNIQUE CHECK (code BETWEEN 1 AND 99),
  label           TEXT    NOT NULL DEFAULT '',
  shelves_count   INTEGER NOT NULL CHECK (shelves_count BETWEEN 1 AND 20),
  slots_per_shelf INTEGER NOT NULL CHECK (slots_per_shelf BETWEEN 1 AND 20),
  x               REAL    NOT NULL DEFAULT 0  CHECK (x BETWEEN 0 AND 100),
  y               REAL    NOT NULL DEFAULT 0  CHECK (y BETWEEN 0 AND 100),
  width           REAL    NOT NULL DEFAULT 18 CHECK (width  > 0 AND width  <= 100),
  height          REAL    NOT NULL DEFAULT 10 CHECK (height > 0 AND height <= 100),
  rotation        INTEGER NOT NULL DEFAULT 0  CHECK (rotation IN (0, 90)),
  created_at      TEXT    NOT NULL
);

-- Cases. Générées automatiquement à la création/modification d'un rayonnage.
CREATE TABLE slots (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rack_id     INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  shelf_index INTEGER NOT NULL CHECK (shelf_index >= 1),
  slot_index  INTEGER NOT NULL CHECK (slot_index  >= 1),
  UNIQUE (rack_id, shelf_index, slot_index)
);

CREATE INDEX idx_slots_rack ON slots (rack_id);

-- Articles. `reference` est la forme normalisée (clé d'unicité et de recherche),
-- `reference_display` la forme telle que saisie et réaffichée.
CREATE TABLE items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT NOT NULL UNIQUE,
  reference_display TEXT NOT NULL,
  designation       TEXT NOT NULL DEFAULT '',
  kind              TEXT NOT NULL DEFAULT 'physical'
                    CHECK (kind IN ('physical', 'service', 'other_site')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_items_reference ON items (reference);

-- Emplacements d'un article. Le MVP n'en affiche qu'un, mais le modèle
-- autorise déjà un article présent dans plusieurs cases.
CREATE TABLE item_locations (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  slot_id INTEGER NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  UNIQUE (item_id, slot_id)
);

CREATE INDEX idx_item_locations_slot ON item_locations (slot_id);

-- Historique des mouvements. Les colonnes `*_snapshot` conservent la référence
-- et les codes d'emplacement en clair : l'historique doit rester lisible même
-- après suppression de l'article ou du rayonnage concerné.
CREATE TABLE movements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id           INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_reference    TEXT    NOT NULL,
  item_designation  TEXT    NOT NULL DEFAULT '',
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_first_name   TEXT    NOT NULL,
  action            TEXT    NOT NULL CHECK (action IN ('create', 'move', 'delete', 'update')),
  from_slot_id      INTEGER REFERENCES slots(id) ON DELETE SET NULL,
  from_slot_code    TEXT,
  to_slot_id        INTEGER REFERENCES slots(id) ON DELETE SET NULL,
  to_slot_code      TEXT,
  created_at        TEXT    NOT NULL
);

CREATE INDEX idx_movements_reference ON movements (item_reference);
CREATE INDEX idx_movements_created_at ON movements (created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('theme', 'light'),
  ('room_name', 'Local de stock'),
  ('plan_width', '100'),
  ('plan_height', '100'),
  ('auto_open_rack', '1');
