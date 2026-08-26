-- Refonte des emplacements : l'unité la plus fine est l'ÉTAGÈRE, plus la case.
--
-- - `racks` gagne `kind` ('rack' | 'zone') et `aisle`, et perd `slots_per_shelf`.
--   Une zone (pile au sol, palette, cage, table…) n'a aucune étagère.
-- - `slots` devient `shelves` : chaque case existante est reprise comme étagère.
-- - `item_locations` référence soit une étagère, soit une zone, jamais les deux.
-- - `movements` conserve les codes d'emplacement en clair, sans clé étrangère.
--
-- Les tables sont reconstruites (SQLite refuse DROP COLUMN sur une colonne
-- citée par un CHECK). Les migrations sont jouées clés étrangères désactivées.

-- 1. Rayonnages et zones ------------------------------------------------------
CREATE TABLE racks_new (
  id            INTEGER PRIMARY KEY,
  code          INTEGER NOT NULL CHECK (code BETWEEN 1 AND 99),
  kind          TEXT    NOT NULL DEFAULT 'rack' CHECK (kind IN ('rack', 'zone')),
  label         TEXT    NOT NULL DEFAULT '',
  aisle         TEXT    NOT NULL DEFAULT '',
  shelves_count INTEGER NOT NULL DEFAULT 0 CHECK (shelves_count BETWEEN 0 AND 30),
  x             REAL    NOT NULL DEFAULT 0  CHECK (x BETWEEN 0 AND 100),
  y             REAL    NOT NULL DEFAULT 0  CHECK (y BETWEEN 0 AND 100),
  width         REAL    NOT NULL DEFAULT 18 CHECK (width  > 0 AND width  <= 100),
  height        REAL    NOT NULL DEFAULT 10 CHECK (height > 0 AND height <= 100),
  rotation      INTEGER NOT NULL DEFAULT 0  CHECK (rotation IN (0, 90)),
  created_at    TEXT    NOT NULL,
  -- R01 et Z01 peuvent coexister : l'unicité porte sur le couple.
  UNIQUE (kind, code)
);

INSERT INTO racks_new (id, code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at)
  SELECT id, code, 'rack', label, '', shelves_count, x, y, width, height, rotation, created_at
    FROM racks;

-- 2. Étagères ----------------------------------------------------------------
CREATE TABLE shelves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rack_id     INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  shelf_index INTEGER NOT NULL CHECK (shelf_index >= 1),
  UNIQUE (rack_id, shelf_index)
);

CREATE INDEX idx_shelves_rack ON shelves (rack_id);

INSERT INTO shelves (rack_id, shelf_index)
  SELECT DISTINCT rack_id, shelf_index FROM slots ORDER BY rack_id, shelf_index;

-- 3. Emplacements des articles ------------------------------------------------
CREATE TABLE item_locations_new (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  shelf_id INTEGER REFERENCES shelves(id) ON DELETE CASCADE,
  zone_id  INTEGER REFERENCES racks(id) ON DELETE CASCADE,
  -- Exactement une des deux références est renseignée.
  CHECK (
    (shelf_id IS NOT NULL AND zone_id IS NULL)
    OR (shelf_id IS NULL AND zone_id IS NOT NULL)
  )
);

INSERT INTO item_locations_new (item_id, shelf_id)
  SELECT DISTINCT item_locations.item_id, shelves.id
    FROM item_locations
    JOIN slots   ON slots.id = item_locations.slot_id
    JOIN shelves ON shelves.rack_id = slots.rack_id
                AND shelves.shelf_index = slots.shelf_index;

DROP TABLE item_locations;
ALTER TABLE item_locations_new RENAME TO item_locations;

CREATE UNIQUE INDEX idx_item_locations_shelf
  ON item_locations (item_id, shelf_id) WHERE shelf_id IS NOT NULL;
CREATE UNIQUE INDEX idx_item_locations_zone
  ON item_locations (item_id, zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_item_locations_by_shelf ON item_locations (shelf_id);
CREATE INDEX idx_item_locations_by_zone ON item_locations (zone_id);

-- 4. Historique ---------------------------------------------------------------
CREATE TABLE movements_new (
  id               INTEGER PRIMARY KEY,
  item_id          INTEGER REFERENCES items(id) ON DELETE SET NULL,
  item_reference   TEXT    NOT NULL,
  item_designation TEXT    NOT NULL DEFAULT '',
  user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_first_name  TEXT    NOT NULL,
  action           TEXT    NOT NULL CHECK (action IN ('create', 'move', 'delete', 'update')),
  from_code        TEXT,
  to_code          TEXT,
  created_at       TEXT    NOT NULL
);

-- `R03-E2-C4` devient `R03-E2` : la case disparaît du code d'emplacement.
INSERT INTO movements_new (id, item_id, item_reference, item_designation, user_id,
                           user_first_name, action, from_code, to_code, created_at)
  SELECT id, item_id, item_reference, item_designation, user_id, user_first_name, action,
         CASE WHEN from_slot_code IS NULL THEN NULL
              ELSE substr(from_slot_code, 1, instr(from_slot_code || '-C', '-C') - 1) END,
         CASE WHEN to_slot_code IS NULL THEN NULL
              ELSE substr(to_slot_code, 1, instr(to_slot_code || '-C', '-C') - 1) END,
         created_at
    FROM movements;

DROP TABLE movements;
ALTER TABLE movements_new RENAME TO movements;

CREATE INDEX idx_movements_reference ON movements (item_reference);
CREATE INDEX idx_movements_created_at ON movements (created_at);

-- 5. Bascule finale -----------------------------------------------------------
DROP TABLE slots;
DROP TABLE racks;
ALTER TABLE racks_new RENAME TO racks;
