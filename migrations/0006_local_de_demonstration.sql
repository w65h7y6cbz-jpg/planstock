-- Local de démonstration --------------------------------------------------------
--
-- Montrer PlanStock à quelqu'un demande un endroit où l'on peut tout essayer :
-- déplacer un article, en supprimer un, redessiner un mur. Le faire dans
-- Optimium reviendrait à présenter l'outil en retenant son souffle, et une
-- fausse manœuvre pendant une réunion abîmerait le vrai stock.
--
-- D'où un troisième local, « Démo », avec ses propres meubles et ses propres
-- articles. Rien de ce qui s'y passe ne touche le stock réel : les deux ne
-- partagent aucune ligne.
--
-- `hidden` le tient hors de l'écran de choix du local. L'équipe continue de
-- voir deux tuiles le matin, comme avant ; la démo s'ouvre par une adresse
-- (`?demo`) quand on en a besoin. Une colonne plutôt qu'un code en dur parce
-- que le jour où un local doit être mis de côté sans être supprimé — un
-- déménagement, un magasin fermé — c'est exactement le même besoin.

ALTER TABLE sites ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));

-- `position` à 90 : si le local est un jour rendu visible, il se range après
-- les vrais plutôt qu'en tête.
--
-- Le local part vide. Ses meubles et ses articles sont posés par la
-- réinitialisation (`POST /api/demo/site`), qui sait aussi les remettre en
-- place après une démonstration — les poser ici en dur les figerait au premier
-- clic d'un visiteur.
INSERT INTO sites (code, name, accent, logo, position, plan_width, plan_height, outline, hidden, created_at)
VALUES ('demo', 'Démo', '#7c3aed', '', 90, 100, 100, '', 1, datetime('now'));
