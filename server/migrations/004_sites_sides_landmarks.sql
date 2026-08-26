-- Trois ajouts demandés après la première livraison :
--
-- 1. LOCAUX. L'application couvre désormais deux locaux (Optimium et Sharp
--    Center). Chaque rayonnage, chaque zone et chaque repère appartient à un
--    local ; un article n'a toujours qu'un seul emplacement, donc son local se
--    déduit de son emplacement. Les numéros repartent de 1 dans chaque local :
--    l'unicité passe de (kind, code) à (site_id, kind, code), ce qui impose de
--    reconstruire la table (SQLite ne sait pas modifier une contrainte UNIQUE).
--
-- 2. CÔTÉ D'ÉTAGÈRE. Indication facultative gauche / centre / droite, pour
--    affiner la recherche à l'œil. L'emplacement reste l'étagère : le côté
--    n'entre pas dans le code (R03-E2), ne conditionne rien, et peut rester vide.
--
-- 3. REPÈRES. Porte d'entrée et établi, dessinés sur le plan pour se situer.
--    Ils ne stockent aucun article.

-- 1. Locaux -------------------------------------------------------------------
CREATE TABLE sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  -- Couleur d'accent du local, en hexadécimal. Le thème de l'application prend
  -- cette couleur quand le local est sélectionné.
  accent      TEXT    NOT NULL DEFAULT '#0057a8'
              CHECK (accent GLOB '#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]'),
  -- Nom de fichier du logo déposé dans web/public/logos/ ; vide = logo dessiné.
  logo        TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL DEFAULT 0,
  -- Dimensions du plan, jusqu'ici globales dans `settings` : deux locaux n'ont
  -- pas la même forme.
  plan_width  REAL    NOT NULL DEFAULT 100 CHECK (plan_width  BETWEEN 10 AND 100),
  plan_height REAL    NOT NULL DEFAULT 100 CHECK (plan_height BETWEEN 10 AND 100),
  created_at  TEXT    NOT NULL
);

-- Le local déjà rempli reprend les dimensions de plan existantes ; le second
-- démarre vide. Les couleurs sont provisoires et modifiables dans les réglages.
INSERT INTO sites (code, name, accent, position, plan_width, plan_height, created_at)
  SELECT 'optimium', 'Optimium', '#0057a8', 1,
         COALESCE((SELECT CAST(value AS REAL) FROM settings WHERE key = 'plan_width'), 100),
         COALESCE((SELECT CAST(value AS REAL) FROM settings WHERE key = 'plan_height'), 100),
         datetime('now');

INSERT INTO sites (code, name, accent, position, plan_width, plan_height, created_at)
  VALUES ('sharp-center', 'Sharp Center', '#e30613', 2, 100, 100, datetime('now'));

-- Les dimensions du plan vivent maintenant dans `sites`, le nom du local aussi.
DELETE FROM settings WHERE key IN ('plan_width', 'plan_height', 'room_name');

-- 2. Rattachement des rayonnages et des zones ---------------------------------
CREATE TABLE racks_new (
  id            INTEGER PRIMARY KEY,
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
  -- R01 peut exister dans les deux locaux sans se confondre.
  UNIQUE (site_id, kind, code)
);

INSERT INTO racks_new (id, site_id, code, kind, label, aisle, shelves_count,
                       x, y, width, height, rotation, created_at)
  SELECT id, (SELECT id FROM sites ORDER BY position LIMIT 1),
         code, kind, label, aisle, shelves_count, x, y, width, height, rotation, created_at
    FROM racks;

DROP TABLE racks;
ALTER TABLE racks_new RENAME TO racks;

CREATE INDEX idx_racks_site ON racks (site_id);

-- 3. Côté d'étagère -----------------------------------------------------------
-- Colonne ajoutée en place : elle n'est citée par aucune contrainte existante.
ALTER TABLE item_locations
  ADD COLUMN side TEXT CHECK (side IS NULL OR side IN ('left', 'center', 'right'));

-- 4. Repères du local ---------------------------------------------------------
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
