# PlanStock

Plan interactif du stock par référence — retrouver instantanément l'emplacement
physique d'un article dans le local, et gérer une liste de préparation de
commande à l'écran.

> Application **100 % locale**. Aucune donnée ne sort du PC, aucune connexion
> Internet n'est nécessaire au fonctionnement. PlanStock ne remplace pas l'ERP :
> il ajoute uniquement l'information « où est physiquement l'article ».

## Démarrer

**Double-cliquez sur `PlanStock.bat`.** Il installe ce qu'il faut à la première
utilisation, démarre le serveur et ouvre le navigateur. Gardez la fenêtre noire
ouverte pendant l'utilisation : la fermer arrête PlanStock.

En ligne de commande, l'équivalent est :

```bat
npm install
npm run build
npm start
```

puis <http://localhost:4823>.

Prérequis : **Node.js 20 LTS ou plus récent** (testé sur Node 22), à télécharger
sur <https://nodejs.org/fr>. Internet n'est nécessaire que pour cette première
installation.

## Le flux quotidien

1. Choisissez votre prénom en haut à droite (obligatoire pour toute
   modification ; la recherche fonctionne sans).
2. Le curseur est déjà dans le champ de recherche. Tapez une référence du bon de
   préparation, puis **Entrée** : elle rejoint la liste de préparation, son
   rayonnage s'allume sur le plan et sa vue de face s'ouvre sur la bonne étagère.
3. Enchaînez les références du bon. Les lignes sans stock physique (services,
   articles d'un autre site) sont rangées à part et cochées d'office.
4. Cochez au fur et à mesure du prélèvement : la ligne se barre et son
   emplacement passe au vert.
5. **Vider** remet la liste à zéro.

Tout le flux se fait au clavier : taper, **Entrée**, **↑ ↓** pour choisir dans
les suggestions, **Échap** pour effacer le champ.

## Emplacements

Deux sortes d'emplacements, dont le code est toujours **calculé**, jamais saisi :

- **Étagère de rayonnage** : `R{rayon sur 2 chiffres}-E{étagère}` — `R03-E2`
  désigne le rayonnage 3, étagère 2. **L'étagère 1 est celle du haut** ; la vue
  de face les liste de haut en bas. L'étagère est l'unité la plus fine : il n'y
  a pas de case.
- **Zone** : `Z{numéro sur 2 chiffres}` — `Z01`. Une zone est un emplacement
  sans étagère : pile au sol, palette, cage grillagée, table, présentoir à
  roulettes. Les articles y sont posés directement.

`R01` et `Z01` peuvent coexister : les numérotations sont indépendantes.

## Écrans

| Écran | Ce qu'on y fait |
| --- | --- |
| **Principal** | recherche, liste de préparation, plan du local |
| **Vue de dessus** | rayonnages et zones ; molette pour zoomer, glisser le fond pour se déplacer |
| **Vue de face** | une bande par étagère ; glisser une pastille pour déplacer un article |
| **Inventaire initial** | saisie guidée réf → désignation → clic sur l'emplacement |
| **Paramètres** | Utilisateurs · Plan · Historique · Données · Apparence |

Le mode **Inventaire initial** démarre tout seul quand la base est vide, et se
relance depuis Paramètres → Données. Le dernier emplacement reste sélectionné :
**Entrée** seul range l'article suivant au même endroit, pour vider un carton
d'affilée.

## Périmètre

L'entreprise a deux branches partageant la même base articles Sage : **Sharp
Center** (reprographie, familles suffixées `TGC11`) et **Optimium**
(informatique, familles suffixées `TGC22`), chacune avec son local au dépôt
« QUARTIER LATIN ». **PlanStock ne couvre que le local Optimium.** L'autre local
et le dépôt « DUCOS » sont hors périmètre : les articles concernés se marquent
« Autre site » et n'occupent aucun emplacement.

Les articles portent un code et un libellé de famille Sage facultatifs
(`family_code`, `family_label`), repris dans l'export. **PlanStock ne se connecte
jamais à Sage** : ces champs sont saisis à la main, ou plus tard importés depuis
un export fourni par l'utilisateur.

PlanStock ne gère **aucune quantité**, aucun prix, aucune commande : uniquement
« quelle référence, à quel emplacement ».

## Sauvegardes

Une copie datée de la base est créée **à chaque démarrage** dans
`data/backups/planstock-AAAA-MM-JJ-HHmm.db`, et celles de plus de 30 jours sont
supprimées. Paramètres → Données permet d'en créer une à la demande et d'en
restaurer une : l'état courant est alors sauvegardé d'abord, et son nom affiché.

Pour repartir de zéro : arrêtez PlanStock, supprimez `data/planstock.db`,
relancez — le mode Inventaire initial redémarre.

## Structure du projet

```
planstock/
├── PlanStock.bat         raccourci : démarre le serveur et ouvre le navigateur
├── data/                 base SQLite (planstock.db) + backups/ (copies datées)
├── server/               API Express + SQLite
│   ├── migrations/       migrations SQL versionnées, appliquées au démarrage
│   ├── routes/           endpoints REST /api/*
│   ├── lib/              références, codes d'emplacement, jeu de démonstration
│   └── __tests__/        tests supertest de l'API
└── web/                  interface Vite + React + TypeScript (build servi par Express)
    └── src/
        ├── components/   barre du haut, recherche, liste de prépa, plan SVG
        ├── features/     inventaire initial, articles, paramètres
        └── lib/          logique pure testée avec vitest
```

## Développement

```bat
npm test                  :: 63 tests serveur + 20 tests front
npm --prefix web run dev  :: front en rechargement à chaud sur http://localhost:5173
npm start                 :: serveur d'API sur http://localhost:4823
```

En développement, lancer les deux : le front sur 5173 relaie `/api` vers 4823.
En production, `npm run build` puis `npm start` suffisent — Express sert
`web/dist` et l'API sur le même port.

Le serveur n'écoute que sur ce PC (`127.0.0.1`). Pour y accéder depuis les autres
postes du SAV plus tard, démarrer avec `PLANSTOCK_HOST=0.0.0.0` — aucun autre
changement n'est nécessaire. L'application n'ayant aucune authentification,
c'est un choix à faire en connaissance de cause.

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
| `GET` `PUT` | `/api/settings` | réglages (thème, nom du local, proportions du plan) |
| `GET` | `/api/export/xlsx` · `/api/export/csv` | export des articles (avec famille) |
| `GET` `POST` | `/api/backups` | sauvegardes disponibles, création à la demande |
| `POST` | `/api/backups/:nom/restore` | restauration (copie de sécurité automatique avant) |
| `GET` `POST` | `/api/demo` | jeu de démonstration, uniquement sur une base sans stock |

## Ce que PlanStock ne fait pas

Pas de connexion à Sage, pas de compte ni de mot de passe, pas de quantités,
pas d'hébergement en ligne, pas d'impression, pas de scan code-barres.

Prévu plus tard, sans être codé aujourd'hui : import d'un export Sage (filtré
sur les familles `TGC22`), import d'un bon de préparation, recherche par
désignation.
