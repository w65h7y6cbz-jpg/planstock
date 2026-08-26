-- Familles d'articles reprises de l'export Sage.
-- Migration additive : `001_init.sql` n'est pas modifiée.
--
-- L'entreprise a deux branches partageant la même base articles : Sharp Center
-- (reprographie, familles suffixées TGC11) et Optimium (informatique, familles
-- suffixées TGC22). PlanStock ne couvre que le local Optimium ; le code et le
-- libellé de famille sont conservés à titre informatif et pour le futur import.

ALTER TABLE items ADD COLUMN family_code TEXT;
ALTER TABLE items ADD COLUMN family_label TEXT;

CREATE INDEX idx_items_family ON items (family_code);
