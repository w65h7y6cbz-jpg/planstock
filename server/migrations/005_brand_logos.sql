-- Logos et couleurs fournis par l'atelier.
--
-- Les couleurs sont relevées au cœur des lettres des logos, pas choisies :
-- rouge Sharp #e42020, indigo Optimium #38388c. Les fichiers sont déposés dans
-- web/public/logos/ et servis par PlanStock lui-même.
--
-- La mise à jour ne s'applique qu'aux locaux restés sur les valeurs posées par
-- la migration 004 : un réglage déjà personnalisé n'est jamais écrasé.

UPDATE sites
   SET logo = 'optimium.png', accent = '#38388c'
 WHERE code = 'optimium' AND logo = '' AND accent = '#0057a8';

UPDATE sites
   SET logo = 'sharp-center.png', accent = '#e42020'
 WHERE code = 'sharp-center' AND logo = '' AND accent = '#e30613';
