# PlanStock

Plan interactif du stock par référence — retrouver instantanément l'emplacement
physique d'un article dans le local de stock, et gérer une liste de préparation
de commande à l'écran.

> Application **100 % locale**. Aucune donnée ne sort du PC, aucune connexion
> Internet n'est nécessaire au fonctionnement. PlanStock ne remplace pas l'ERP :
> il ajoute uniquement l'information « où est physiquement l'article ».

## Installation

```bat
npm install
npm run build
npm start
```

Puis ouvrir <http://localhost:4823> (ou double-cliquer sur `PlanStock.bat`,
livré à l'étape 9, qui lance le serveur et ouvre le navigateur).

Prérequis : **Node.js 20 LTS ou plus récent** (testé sur Node 22) et npm.

## Structure du projet

```
planstock/
├── data/                 base SQLite (planstock.db) + backups/ (copies datées)
├── server/               API Express + SQLite
│   ├── migrations/       migrations SQL versionnées, appliquées au démarrage
│   ├── routes/           endpoints REST /api/*
│   ├── lib/              normalisation des références, codes d'emplacement
│   └── __tests__/        tests supertest de l'API
└── web/                  interface Vite + React + TypeScript (build servi par Express)
    └── src/
        ├── components/   barre du haut, recherche, liste de prépa, plan SVG
        ├── features/     inventaire initial, paramètres
        └── lib/          logique pure testée avec vitest
```

## Codes d'emplacement

Format : `R{rayon}-E{étagère}-C{case}` — par exemple `R03-E2-C4` désigne le
rayonnage 3, l'étagère 2 (1 = étagère du bas), case 4 (1 = case de gauche vue
de face). Ce code est toujours **calculé**, jamais saisi à la main.

## Avancement

- [x] Étape 1 — Vérification de l'environnement, arborescence, README
- [ ] Étape 2 — Serveur Express + base SQLite + migrations + sauvegardes + API REST
- [ ] Étape 3 — Squelette du front (thème clair/sombre, layout, sélecteur de prénom)
- [ ] Étape 4 — Éditeur de plan (rayonnages, cases, vue de dessus)
- [ ] Étape 5 — Vue de face, recherche, liste de préparation
- [ ] Étape 6 — Édition d'articles, drag & drop, historique
- [ ] Étape 7 — Mode Inventaire initial
- [ ] Étape 8 — Paramètres, export Excel/CSV, sauvegardes, données de démo
- [ ] Étape 9 — Raccourci bureau, README final, critères d'acceptation
