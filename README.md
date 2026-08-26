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

1. **Choisissez le local** — Optimium ou Sharp Center. Le choix est mémorisé sur
   le poste ; la couleur de l'application suit le local.
2. Choisissez votre prénom en haut à droite (obligatoire pour toute
   modification ; la recherche fonctionne sans).
3. Le curseur est déjà dans le grand champ au centre. Tapez une **référence
   d'article**, puis **Entrée** : l'emplacement s'affiche en énorme, le
   rayonnage est dessiné à côté avec l'étagère surlignée, et la référence rejoint
   la liste de préparation.

   La recherche ne connaît que les références. Le numéro du bon (NPL…) ne sert
   pas à chercher : il se saisit dans le tiroir, pour nommer la liste en cours.
4. **Suivante** vide le champ pour la référence suivante du bon. Les lignes sans
   stock physique (services, articles hors PlanStock) reçoivent un grand message
   coloré et sont cochées d'office.
5. Cochez au fur et à mesure du prélèvement : la ligne reste en place, barrée.
6. **Vider la liste** remet à zéro.

Tout le flux se fait au clavier : taper, **Entrée**, **↑ ↓** pour choisir dans
les suggestions, **Échap** pour effacer le champ puis en sortir, **F2** (ou
**P** hors saisie) pour ouvrir le plan.

### Si l'installation coince

- **`npm warn allow-scripts` sur `better-sqlite3` / `esbuild`** — sans effet avec
  npm 11 : les scripts s'exécutent, l'avertissement annonce seulement qu'une
  version future les bloquera. Ne pas passer à npm 12 sans nécessité. Si une
  réinstallation échoue un jour sur `better-sqlite3`, lancer la commande que npm
  affiche : `npm approve-scripts --allow-scripts-pending`.
- **Les `npm warn deprecated`** viennent de dépendances internes d'`exceljs` et
  de `better-sqlite3`. Sans conséquence sur le fonctionnement.
- **Le navigateur ne s'ouvre pas tout seul** — l'exécution de scripts PowerShell
  est probablement bloquée sur le poste. Le serveur tourne quand même : ouvrir
  <http://localhost:4823> à la main.
- **L'interface manque après une installation interrompue** —
  `npm --prefix web install` puis `npm run build`.

## Emplacements

Deux sortes d'emplacements, dont le code est toujours **calculé**, jamais saisi :

- **Étagère de rayonnage** : `R{rayon sur 2 chiffres}-E{étagère}` — `R03-E2`
  désigne le rayonnage 3, étagère 2. **L'étagère 1 est celle du haut** ; la vue
  de face les liste de haut en bas. L'étagère est l'unité la plus fine : il n'y
  a pas de case.
- **Zone** : `Z{numéro sur 2 chiffres}` — `Z01`. Une zone est un emplacement
  sans étagère : pile au sol, palette, cage grillagée, table, présentoir à
  roulettes. Les articles y sont posés directement.

`R01` et `Z01` peuvent coexister : les numérotations sont indépendantes. Elles
repartent aussi de 1 dans chaque local — `R01` d'Optimium et `R01` de Sharp
Center sont deux rayonnages différents.

Un article rangé sur une étagère peut porter un **côté** facultatif — gauche,
centre ou droite. C'est une indication d'appoint, dessinée sur la tablette : elle
n'entre pas dans le code, ne conditionne rien et peut rester vide.

## Écrans

| Écran | Ce qu'on y fait |
| --- | --- |
| **Choix du local** | Optimium ou Sharp Center, une fois au démarrage |
| **Accueil** | le grand champ de recherche au centre, rien d'autre |
| **Résultat** | le code en énorme, le rayonnage dessiné avec l'étagère surlignée, l'allée et le nom du meuble |
| **Plan du local** | plein écran (bouton ou **F2**) ; vue de dessus avec un peu d'épaisseur, cadrage automatique sur la cible, parcours numéroté pendant une préparation |
| **Tiroir de préparation** | à droite, s'ouvre au premier ajout : n° de bon, lignes cochables |
| **Inventaire initial** | une question à la fois : le meuble, puis l'étagère, puis les références |
| **Réglages** (⚙) | Rayonnages et zones · Articles · Équipe · Mouvements · Sauvegardes · Ce local |

Le plan est **fixe** : il n'y a ni molette ni glisser du fond, rien à recadrer.
Cliquer un meuble l'ouvre dans un panneau à droite, où l'on déplie une étagère et
d'où l'on glisse une référence vers un autre meuble du plan.

Le mode **Inventaire initial** démarre tout seul quand la base est vide, et se
relance depuis Réglages → Sauvegardes. Une fois l'étagère choisie, chaque
**Entrée** range une référence de plus au même endroit, pour vider un carton
d'affilée.

## Périmètre

L'entreprise a deux branches partageant la même base articles Sage : **Sharp
Center** (reprographie, familles suffixées `TGC11`) et **Optimium**
(informatique, familles suffixées `TGC22`), chacune avec son local au dépôt
« QUARTIER LATIN ». **PlanStock couvre les deux locaux.** On en choisit un au
démarrage, et tout l'écran s'y rapporte : ses rayonnages, ses zones, sa
recherche, sa couleur. La recherche ne franchit pas la frontière — une référence
rangée à Sharp Center ressort « inconnue » depuis Optimium.

Le dépôt « DUCOS » reste hors périmètre : les articles concernés se marquent
« Hors PlanStock » et n'occupent aucun emplacement. Comme les services, ils
restent trouvables depuis les deux locaux, avec un message à la place du code.

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
        ├── components/   barre du haut, recherche, résultat, plan et rayonnage SVG
        ├── features/     inventaire initial, articles, réglages
        └── lib/          logique pure testée avec vitest
```

## Développement

```bat
npm test                  :: 86 tests serveur + 29 tests front
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
| `GET` `PATCH` | `/api/sites` | les deux locaux : nom, couleur, logo, taille du plan |
| `GET` `POST` `PATCH` `DELETE` | `/api/landmarks?site_id=` | repères du plan : porte d'entrée, établi |
| `GET` `POST` `PATCH` `DELETE` | `/api/racks?site_id=` | rayonnages et zones d'un local ; les étagères sont générées automatiquement |
| `GET` | `/api/racks/:id/shelves` | étagères d'un rayonnage avec leur contenu |
| `GET` | `/api/items` · `/api/items/search?q=&site_id=` | recherche exacte, puis par préfixe, puis par désignation |
| `POST` `PATCH` `DELETE` | `/api/items` | création, modification, suppression |
| `PUT` | `/api/items/:id/location` | déplacement vers une étagère (`shelf_id`, `side` facultatif) ou une zone (`zone_id`) |
| `GET` | `/api/movements?reference=` | historique filtrable |
| `GET` `PUT` | `/api/settings` | réglages globaux |
| `GET` | `/api/export/xlsx?site_id=` · `/api/export/csv?site_id=` | export des articles (famille, local, côté) |
| `GET` `POST` | `/api/backups` | sauvegardes disponibles, création à la demande |
| `POST` | `/api/backups/:nom/restore` | restauration (copie de sécurité automatique avant) |
| `GET` `POST` | `/api/demo` | jeu de démonstration, uniquement sur une base sans stock |

## Ce que PlanStock ne fait pas

Pas de connexion à Sage, pas de compte ni de mot de passe, pas de quantités,
pas d'hébergement en ligne, pas d'impression, pas de scan code-barres.

Prévu plus tard, sans être codé aujourd'hui : import d'un export Sage, import
d'un bon de préparation.

## Logos

Chaque local peut porter son logo. Déposez le fichier image dans
`web/public/logos/` puis écrivez son nom dans Réglages → Ce local → Logo (par
exemple `optimium.png`). Sans fichier, un pictogramme est dessiné dans la couleur
du local. Aucune image n'est chargée depuis Internet.
