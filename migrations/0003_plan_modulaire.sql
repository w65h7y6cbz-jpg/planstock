-- Plan modulaire : angle libre et catalogue de meubles ------------------------
--
-- L'éditeur ne savait que déplacer et redimensionner des rectangles alignés sur
-- les axes. Un local réel a des rayonnages posés en biais, des gondoles double
-- face, et des meubles dont on connaît les cotes au centimètre plutôt qu'à la
-- souris.
--
-- `rotation` existait déjà, mais ne valait que 0 ou 90 et rien ne la dessinait.
-- Sa contrainte CHECK ne s'assouplit pas sans reconstruire la table — et
-- reconstruire `racks` ferait jouer les cascades de `shelves` et
-- `item_locations`, qui emporteraient au passage le rangement de tous les
-- articles. On ajoute donc une colonne, ce qui ne risque rien ; `rotation`
-- reste en place sans plus servir, le temps qu'une remise à plat du schéma soit
-- justifiée par autre chose.

ALTER TABLE racks ADD COLUMN angle REAL NOT NULL DEFAULT 0;
ALTER TABLE landmarks ADD COLUMN angle REAL NOT NULL DEFAULT 0;

-- Les meubles déjà posés en travers gardent leur orientation.
UPDATE racks SET angle = rotation WHERE rotation <> 0;

-- Aspect du meuble, sans effet sur son fonctionnement. Une gondole est un
-- rayonnage — elle porte des étagères et se code `R..` — elle se dessine
-- seulement autrement : deux faces adossées plutôt qu'une contre un mur.
-- Le jeu de valeurs admises est tenu par la route, comme pour les couleurs.
ALTER TABLE racks ADD COLUMN style TEXT NOT NULL DEFAULT '';
