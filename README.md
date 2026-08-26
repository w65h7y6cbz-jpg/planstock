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

### Développement

```bat
npm test                  :: tests serveur (vitest + supertest) et front
npm --prefix web run dev  :: front en rechargement à chaud sur http://localhost:5173
npm start                 :: serveur d'API sur http://localhost:4823
```

En développement, lancer les deux : le front sur 5173 relaie `/api` vers 4823.
En production, `npm run build` puis `npm start` suffisent — Express sert
`web/dist` et l'API sur le même port.

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

## API REST

Toutes les routes sont sous `/api`. Les modifications exigent un technicien
identifié : `user_id` dans le corps de la requête, la query string ou l'en-tête
`X-User-Id` (aucun mot de passe, juste un prénom choisi dans une liste).

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/api/health` | état, compteurs, `empty` (déclenche l'inventaire initial) |
| `GET` `POST` `PATCH` | `/api/users` | liste, ajout et désactivation des prénoms |
| `GET` `POST` `PATCH` `DELETE` | `/api/racks` | rayonnages ; les cases sont générées automatiquement |
| `GET` | `/api/racks/:id/slots` | cases d'un rayonnage avec leur contenu |
| `GET` | `/api/items` · `/api/items/search?q=` | recherche exacte puis par préfixe |
| `POST` `PATCH` `DELETE` | `/api/items` | création, modification, suppression |
| `PUT` | `/api/items/:id/location` | déplacement d'un article (drag & drop) |
| `GET` | `/api/movements?reference=` | historique filtrable |
| `GET` `PUT` | `/api/settings` | réglages (thème, nom du local…) |
| `GET` | `/api/export/xlsx` · `/api/export/csv` | export des articles |
| `GET` | `/api/backups` | sauvegardes disponibles |

## Codes d'emplacement

Format : `R{rayon}-E{étagère}-C{case}` — par exemple `R03-E2-C4` désigne le
rayonnage 3, l'étagère 2 (1 = étagère du bas), case 4 (1 = case de gauche vue
de face). Ce code est toujours **calculé**, jamais saisi à la main.

## Avancement

- [x] Étape 1 — Vérification de l'environnement, arborescence, README
- [x] Étape 2 — Serveur Express + base SQLite + migrations + sauvegardes + API REST
- [x] Étape 3 — Squelette du front (thème clair/sombre, layout, sélecteur de prénom)
- [ ] Étape 4 — Éditeur de plan (rayonnages, cases, vue de dessus)
- [ ] Étape 5 — Vue de face, recherche, liste de préparation
- [ ] Étape 6 — Édition d'articles, drag & drop, historique
- [ ] Étape 7 — Mode Inventaire initial
- [ ] Étape 8 — Paramètres, export Excel/CSV, sauvegardes, données de démo
- [ ] Étape 9 — Raccourci bureau, README final, critères d'acceptation
