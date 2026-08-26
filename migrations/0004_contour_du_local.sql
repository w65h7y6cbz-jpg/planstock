-- Contour du local ------------------------------------------------------------
--
-- Le plan supposait une pièce rectangulaire : `plan_width` × `plan_height`. Un
-- vrai local a un renfoncement, un angle coupé, une forme en L. Tant que le
-- contour ment, on se repère mal — et le plan ne sert qu'à ça.
--
-- `outline` porte la liste des coins, en JSON : `[[x, y], [x, y], …]`, dans les
-- mêmes unités que les meubles (0 à 100). Vide = rectangle, ce qui est le cas
-- de tous les locaux existants : la colonne s'ajoute sans rien reprendre, et
-- `plan_width` × `plan_height` continue de définir le cadre.
--
-- Les deux cohabitent volontairement : `plan_width` et `plan_height` restent le
-- cadre de référence — cadrage de la vue, bornes de déplacement d'un meuble —
-- tandis que `outline` ne décrit que la forme des murs à l'intérieur.

ALTER TABLE sites ADD COLUMN outline TEXT NOT NULL DEFAULT '';
