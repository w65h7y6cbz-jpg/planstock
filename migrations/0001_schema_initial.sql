-- PlanStock — schéma initial de la base D1.
--
-- Les cinq migrations de la version locale sont fondues ici : la base
-- Cloudflare part neuve, il n'y a pas d'historique à rejouer.
--
-- Aucune quantité, aucun prix, aucune donnée de commande : uniquement
-- « quelle référence se trouve à quel emplacement physique ».

-- Locaux ---------------------------------------------------------------------
-- L'application couvre deux locaux (Optimium, Sharp Center). Chaque rayonnage,
-- zone et repère appartient à l'un d'eux ; un article n'ayant qu'un seul
-- emplacement, son local se déduit de cet emplacement.
CREATE TABLE sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  -- Couleur d'accent du local, en hexadécimal : le thème de l'application la
  -- prend quand ce local est sélectionné.
  -- La contrainte reste grossière (un dièse et sept caractères) : le SQLite
  -- des Workers refuse un motif GLOB à six classes. Le format exact est
  -- vérifié par une expression régulière dans la route des locaux.
  accent      TEXT    NOT NULL DEFAULT '#0057a8'
              CHECK (length(accent) = 7 AND substr(accent, 1, 1) = '#'),
  -- Nom de fichier du logo servi depuis web/public/logos/ ; vide = logo dessiné.
  logo        TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  plan_width  REAL    NOT NULL DEFAULT 100 CHECK (plan_width  BETWEEN 10 AND 100),
  plan_height REAL    NOT NULL DEFAULT 100 CHECK (plan_height BETWEEN 10 AND 100),
  created_at  TEXT    NOT NULL
);

-- Couleurs relevées au cœur des lettres des logos fournis par l'atelier.
INSERT INTO sites (code, name, accent, logo, position, created_at) VALUES
  ('optimium',     'Optimium',     '#38388c', 'optimium.png',     1, datetime('now')),
  ('sharp-center', 'Sharp Center', '#e42020', 'sharp-center.png', 2, datetime('now'));

-- Équipe ---------------------------------------------------------------------
-- Pas d'authentification : un prénom choisi dans une liste, pour tracer qui
-- range quoi. Jamais de mot de passe.
CREATE TABLE users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT    NOT NULL UNIQUE,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL
);

-- Rayonnages et zones --------------------------------------------------------
-- x/y/width/height sont des pourcentages du plan (0-100), indépendants de la
-- taille d'écran. Une zone (pile au sol, palette, cage, table) n'a pas
-- d'étagère : les articles y sont posés directement.
CREATE TABLE racks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id       INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
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
  -- R01 et Z01 coexistent, et R01 existe dans chacun des deux locaux.
  UNIQUE (site_id, kind, code)
);

CREATE INDEX idx_racks_site ON racks (site_id);

-- Étagères. Générées automatiquement à la création/modification d'un rayonnage.
-- L'étagère 1 est celle du haut ; c'est l'unité la plus fine, il n'y a pas de case.
CREATE TABLE shelves (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rack_id     INTEGER NOT NULL REFERENCES racks(id) ON DELETE CASCADE,
  shelf_index INTEGER NOT NULL CHECK (shelf_index >= 1),
  UNIQUE (rack_id, shelf_index)
);

CREATE INDEX idx_shelves_rack ON shelves (rack_id);

-- Repères du local : porte d'entrée, établi. Ils aident à se situer sur le plan
-- et ne stockent aucun article — d'où une table à part.
CREATE TABLE landmarks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('door', 'bench')),
  label      TEXT    NOT NULL DEFAULT '',
  x          REAL    NOT NULL DEFAULT 0 CHECK (x BETWEEN 0 AND 100),
  y          REAL    NOT NULL DEFAULT 0 CHECK (y BETWEEN 0 AND 100),
  width      REAL    NOT NULL DEFAULT 8 CHECK (width  > 0 AND width  <= 100),
  height     REAL    NOT NULL DEFAULT 4 CHECK (height > 0 AND height <= 100),
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_landmarks_site ON landmarks (site_id);

-- Articles -------------------------------------------------------------------
-- `reference` est la forme normalisée (clé d'unicité et de recherche),
-- `reference_display` la forme telle que saisie et réaffichée.
-- `other_site` s'appelle « Hors PlanStock » dans l'interface : connu de SAGE,
-- rangé dans aucun des deux locaux.
CREATE TABLE items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  reference         TEXT NOT NULL UNIQUE,
  reference_display TEXT NOT NULL,
  designation       TEXT NOT NULL DEFAULT '',
  kind              TEXT NOT NULL DEFAULT 'physical'
                    CHECK (kind IN ('physical', 'service', 'other_site')),
  -- Famille Sage facultative, saisie à la main : PlanStock ne se connecte
  -- jamais à Sage.
  family_code       TEXT,
  family_label      TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_items_reference ON items (reference);
CREATE INDEX idx_items_family ON items (family_code);

-- Emplacement d'un article : soit une étagère, soit une zone, jamais les deux.
-- `side` (gauche / centre / droite) est une indication d'appoint : elle n'entre
-- pas dans le code d'emplacement et peut rester vide.
CREATE TABLE item_locations (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  shelf_id INTEGER REFERENCES shelves(id) ON DELETE CASCADE,
  zone_id  INTEGER REFERENCES racks(id) ON DELETE CASCADE,
  side     TEXT CHECK (side IS NULL OR side IN ('left', 'center', 'right')),
  CHECK (
    (shelf_id IS NOT NULL AND zone_id IS NULL)
    OR (shelf_id IS NULL AND zone_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_item_locations_shelf
  ON item_locations (item_id, shelf_id) WHERE shelf_id IS NOT NULL;
CREATE UNIQUE INDEX idx_item_locations_zone
  ON item_locations (item_id, zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX idx_item_locations_by_shelf ON item_locations (shelf_id);
CREATE INDEX idx_item_locations_by_zone ON item_locations (zone_id);

-- Historique -----------------------------------------------------------------
-- Référence et codes d'emplacement sont figés en clair : l'historique doit
-- rester lisible après suppression de l'article ou du rayonnage concerné.
CREATE TABLE movements (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE INDEX idx_movements_reference ON movements (item_reference);
CREATE INDEX idx_movements_created_at ON movements (created_at);

-- Réglages globaux -----------------------------------------------------------
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
