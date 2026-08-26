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
| `GET` `POST` `PATCH` `DELETE` | `/api/racks` | rayonnages et zones ; les étagères sont générées automatiquement |
| `GET` | `/api/racks/:id/shelves` | étagères d'un rayonnage avec leur contenu |
| `GET` | `/api/items` · `/api/items/search?q=` | recherche exacte puis par préfixe |
| `POST` `PATCH` `DELETE` | `/api/items` | création, modification, suppression |
| `PUT` | `/api/items/:id/location` | déplacement vers une étagère (`shelf_id`) ou une zone (`zone_id`) |
| `GET` | `/api/movements?reference=` | historique filtrable |
| `GET` `PUT` | `/api/settings` | réglages (thème, nom du local…) |
| `GET` | `/api/export/xlsx` · `/api/export/csv` | export des articles (avec famille) |
| `GET` `POST` | `/api/backups` | sauvegardes disponibles, création à la demande |
| `POST` | `/api/backups/:nom/restore` | restauration (copie de sécurité automatique avant) |
| `GET` `POST` | `/api/demo` | jeu de démonstration, uniquement sur une base sans stock |

## Périmètre

L'entreprise a deux branches partageant la même base articles Sage : **Sharp
Center** (reprographie, familles suffixées `TGC11`) et **Optimium**
(informatique, familles suffixées `TGC22`), chacune avec son local au dépôt
« QUARTIER LATIN ». **PlanStock ne couvre que le local Optimium.** L'autre local
et le dépôt « DUCOS » sont hors périmètre : les articles concernés se marquent
« Autre site » et n'occupent aucun emplacement.

Les articles portent un code et un libellé de famille Sage facultatifs
(`family_code`, `family_label`), repris dans l'export. PlanStock ne se connecte
jamais à Sage : ces champs sont saisis ou, plus tard, importés depuis un export
fourni par l'utilisateur.

## Codes d'emplacement

Deux sortes d'emplacements, dont le code est toujours **calculé**, jamais saisi :

- **Étagère de rayonnage** : `R{rayon sur 2 chiffres}-E{étagère}` — `R03-E2`
  désigne le rayonnage 3, étagère 2. **L'étagère 1 est celle du haut** ; la vue
  de face les liste de haut en bas. La case n'existe pas : l'étagère est l'unité
  la plus fine.
- **Zone** : `Z{numéro sur 2 chiffres}` — `Z01`. Une zone est un emplacement
  sans étagère : pile au sol, palette, cage grillagée, table, présentoir à
  roulettes. Les articles y sont posés directement.

`R01` et `Z01` peuvent coexister : la numérotation est indépendante.

## Avancement

- [x] Étape 1 — Vérification de l'environnement, arborescence, README
- [x] Étape 2 — Serveur Express + base SQLite + migrations + sauvegardes + API REST
- [x] Étape 3 — Squelette du front (thème clair/sombre, layout, sélecteur de prénom)
- [x] Étape 4 — Éditeur de plan (rayonnages, zones, étagères, vue de dessus)
- [x] Étape 5 — Vue de face, recherche, liste de préparation
- [x] Étape 6 — Édition d'articles, drag & drop, historique
- [x] Étape 7 — Mode Inventaire initial
- [x] Étape 8 — Paramètres, export Excel/CSV, sauvegardes, données de démo
- [x] Refonte — étagères à la place des cases, zones, vue de face en bandes
- [ ] Étape 9 — Raccourci bureau, README final, critères d'acceptation
