-- Sous-stocks réservés à un client -------------------------------------------
--
-- Certains clients achètent à l'année. Optimium garde pour eux des exemplaires
-- des mêmes références que le stock global, rangés dans les mêmes rayonnages,
-- parfois sur la même étagère. Ce ne sont pas d'autres articles : c'est la même
-- référence, à qui on a mis un nom dessus.
--
-- Un emplacement sans client appartient au stock global. Un emplacement avec
-- client est réservé : il ne doit jamais partir dans une préparation ordinaire.
--
-- PlanStock ne compte rien et ne facture rien : il dit seulement à qui est
-- réservé ce qui se trouve à tel endroit.

CREATE TABLE customers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id    INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL
);

-- Deux clients du même nom dans le même local n'auraient aucun sens ; le même
-- nom dans deux locaux différents, si.
CREATE UNIQUE INDEX idx_customers_name ON customers (site_id, name);
CREATE INDEX idx_customers_site ON customers (site_id);

-- NULL = stock global. Renseigné = réservé à ce client.
-- Pas de valeur par défaut : les emplacements déjà en base sont donc tous
-- rattachés au stock global, ce qui est exactement leur sens aujourd'hui.
ALTER TABLE item_locations
  ADD COLUMN customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE;

CREATE INDEX idx_item_locations_customer ON item_locations (customer_id);

-- Les index d'unicité changent de sens. Jusqu'ici une référence ne pouvait
-- figurer qu'une fois par étagère ; il en faut désormais une par client, plus
-- celle du stock global.
--
-- Le COALESCE est indispensable : sans lui, SQLite tient deux NULL pour
-- distincts, et le stock global pourrait se dédoubler sur une même étagère
-- sans que rien ne l'arrête.
DROP INDEX idx_item_locations_shelf;
DROP INDEX idx_item_locations_zone;

CREATE UNIQUE INDEX idx_item_locations_shelf
  ON item_locations (item_id, shelf_id, COALESCE(customer_id, 0))
  WHERE shelf_id IS NOT NULL;

CREATE UNIQUE INDEX idx_item_locations_zone
  ON item_locations (item_id, zone_id, COALESCE(customer_id, 0))
  WHERE zone_id IS NOT NULL;
