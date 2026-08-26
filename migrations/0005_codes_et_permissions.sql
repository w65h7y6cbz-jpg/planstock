-- Code à 4 chiffres et permissions ---------------------------------------------
--
-- Jusqu'ici le prénom était une simple étiquette : on le choisissait dans une
-- liste, sans rien prouver. Il devient une identité, avec un code à 4 chiffres,
-- et porte des droits.
--
-- Deux précautions qui commandent le reste du schéma :
--
-- 1. **Personne ne doit se retrouver dehors de son propre outil.** L'application
--    est en service. Un prénom sans code (`pin_hash` vide) continue donc de
--    fonctionner exactement comme avant, et toutes les permissions démarrent à
--    « autorisé ». Rien ne change tant qu'un code n'a pas été posé.
--
-- 2. **Un code à 4 chiffres, c'est 10 000 combinaisons.** Il n'est jamais rangé
--    en clair : `pin_hash` porte un PBKDF2-SHA256 sur `pin_salt`. Et comme le
--    hachage ne suffit pas face à un espace aussi petit, le compte se bloque
--    après quelques essais ratés — c'est `failed_attempts` et `locked_until`
--    qui font le vrai travail.

ALTER TABLE users ADD COLUMN pin_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN pin_salt TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
-- Horodatage ISO jusqu'auquel le compte refuse toute tentative. Vide = ouvert.
ALTER TABLE users ADD COLUMN locked_until TEXT NOT NULL DEFAULT '';

-- Permissions. Tout à 1 : les prénoms déjà en base gardent ce qu'ils pouvaient
-- faire hier, et un nouveau prénom démarre comme eux. C'est à l'équipe de
-- restreindre, pas à la migration de surprendre.
ALTER TABLE users ADD COLUMN can_move  INTEGER NOT NULL DEFAULT 1 CHECK (can_move  IN (0, 1));
ALTER TABLE users ADD COLUMN can_delete INTEGER NOT NULL DEFAULT 1 CHECK (can_delete IN (0, 1));
ALTER TABLE users ADD COLUMN can_admin INTEGER NOT NULL DEFAULT 1 CHECK (can_admin IN (0, 1));

-- Accès aux stocks à part. L'absence de ligne pour un prénom vaut « tous les
-- stocks » : sans quoi la migration retirerait à tout le monde l'accès à AOCCI
-- du jour au lendemain. `restrict_customers` dit qu'on est passé en liste
-- blanche pour ce prénom-là, et que la table fait alors foi.
ALTER TABLE users
  ADD COLUMN restrict_customers INTEGER NOT NULL DEFAULT 0
  CHECK (restrict_customers IN (0, 1));

CREATE TABLE user_customers (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, customer_id)
);

CREATE INDEX idx_user_customers_user ON user_customers (user_id);

-- Secret de signature des sessions, tiré au sort à la première demande. Il
-- survit ainsi aux redéploiements sans que personne ait à le poser à la main.
--
-- Sa propre table, et surtout pas `settings` : `GET /api/settings` renvoie
-- cette table entière, et les sauvegardes l'exportent — le secret serait
-- publié à qui sait lire une réponse JSON. Aucune route ne lit `app_secrets`,
-- et la sauvegarde ne l'emporte pas : restaurer redemande simplement leur code
-- aux techniciens, ce qui est le bon compromis.
CREATE TABLE app_secrets (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
