# PlanStock

Plan interactif du stock par référence — retrouver instantanément l'emplacement
physique d'un article dans le local, et gérer une liste de préparation de
commande à l'écran.

PlanStock ne remplace pas l'ERP : il ajoute uniquement l'information « où est
physiquement l'article ». Aucune quantité, aucun prix, aucune commande.

> **Hébergé chez Cloudflare.** L'application tourne sur un Worker, la base de
> données est une base D1 en région Océanie (Sydney, la plus proche de Nouméa).
> Il n'y a plus de PC à laisser allumé — mais **sans connexion Internet,
> PlanStock est inaccessible**. C'est la contrepartie assumée du choix.
>
> **PlanStock ne se connecte jamais à SAGE**, ni en lecture ni en écriture.

## Ouvrir PlanStock

**<https://planstock.lifepilot.win>**, depuis n'importe quel poste du magasin.
C'est la seule adresse : PlanStock n'a pas de nom de repli en `.workers.dev`.

1. **Choisis le local** — Optimium ou Sharp Center. Le choix est mémorisé sur le
   poste ; la couleur de l'application suit le local.
2. **Choisis ton prénom** en haut à droite. Obligatoire pour toute modification ;
   la recherche fonctionne sans.
3. **Tape une référence** dans le grand champ au centre, puis **Entrée** :
   l'emplacement s'affiche en énorme, le rayonnage est dessiné à côté avec
   l'étagère surlignée, et la référence rejoint la liste de préparation.

**On ne tape jamais qu'une référence dans PlanStock.** Il n'y a pas d'autre
champ de saisie, pas de numéro de bon, pas de nom de préparation : une
référence, un emplacement. La liste de préparation se remplit toute seule au
fil des références tapées.

Tout le flux se fait au clavier : taper, **Entrée**, **↑ ↓** pour choisir dans
les suggestions, **Suivante** pour la référence suivante, **Échap** pour fermer
ce qui est ouvert, **F2** (ou **P** hors saisie) pour le plan du local.

## Qui peut entrer

PlanStock n'a **aucun compte ni mot de passe** : le prénom sert à tracer qui
range quoi, pas à ouvrir la porte.

**Aujourd'hui, l'accès est libre : qui a l'adresse entre.** C'est un choix
assumé — l'adresse n'est donnée à personne en dehors de l'équipe. Deux verrous
existent si l'on change d'avis un jour ; ils sont facultatifs, vides par défaut,
et s'activent sans redéployer :

| Réglage | Rôle |
| --- | --- |
| `PLANSTOCK_ALLOWED_IPS` | Adresses IP publiques autorisées, séparées par des virgules. C'est le filtre principal : « accessible seulement depuis le magasin ». |
| `PLANSTOCK_ACCESS_CODE` | Code partagé, saisi une fois par navigateur (mémorisé un mois). Il existe parce qu'une IP de PME change souvent sans prévenir : sans lui, un changement d'adresse mettrait tout le monde dehors. |

```bat
npx wrangler secret put PLANSTOCK_ALLOWED_IPS
npx wrangler secret put PLANSTOCK_ACCESS_CODE
```

Tant que les deux sont vides, aucun filtre ne s'applique et personne n'a rien à
saisir. Le jour où l'on en veut un, l'écran de refus affiche l'adresse IP vue
par Cloudflare : c'est celle à recopier dans `PLANSTOCK_ALLOWED_IPS`.

## Emplacements

Deux sortes d'emplacements, dont le code est toujours **calculé**, jamais saisi :

- **Étagère de rayonnage** : `R{rayon sur 2 chiffres}-E{étagère}` — `R03-E2`
  désigne le rayonnage 3, étagère 2. **L'étagère 1 est celle du haut** ; la vue
  de face les liste de haut en bas. L'étagère est l'unité la plus fine : il n'y
  a pas de case.
- **Zone** : `Z{numéro sur 2 chiffres}` — `Z01`. Une zone est un emplacement
  sans étagère : pile au sol, palette, cage grillagée, table, présentoir à
  roulettes. Les articles y sont posés directement.

`R01` et `Z01` coexistent : les numérotations sont indépendantes. Elles
repartent aussi de 1 dans chaque local — `R01` d'Optimium et `R01` de Sharp
Center sont deux rayonnages différents.

Un article rangé sur une étagère peut porter un **côté** facultatif — gauche,
centre ou droite. C'est une indication d'appoint, dessinée sur la tablette :
elle n'entre pas dans le code, ne conditionne rien et peut rester vide.

## Écrans

| Écran | Ce qu'on y fait |
| --- | --- |
| **Choix du local** | Optimium ou Sharp Center, une fois au démarrage |
| **Accueil** | le grand champ de recherche au centre, rien d'autre |
| **Résultat** | le code en énorme, le rayonnage dessiné avec l'étagère surlignée, l'allée et le nom du meuble |
| **Plan du local** | plein écran (bouton ou **F2**) ; vue de dessus avec un peu d'épaisseur, cadrage automatique sur la cible, parcours numéroté pendant une préparation |
| **Tiroir de préparation** | à droite, s'ouvre au premier ajout : lignes cochables, rien à saisir |
| **Inventaire initial** | une question à la fois : le meuble, puis l'étagère, puis les références |
| **Réglages** (⚙) | Rayonnages et zones · Stocks à part · Articles · Équipe · Mouvements · Sauvegardes · Ce local |

Le plan est **fixe** : il n'y a ni molette ni glisser du fond, rien à recadrer.
Cliquer un meuble l'ouvre dans un panneau à droite, où l'on déplie une étagère
et d'où l'on glisse une référence vers un autre meuble du plan.

Le mode **Inventaire initial** démarre tout seul quand la base est vide, et se
relance depuis Réglages → Sauvegardes. Une fois l'étagère choisie, chaque
**Entrée** range une référence de plus au même endroit, pour vider un carton
d'affilée.

## Stocks à part

Certains clients achètent à l'année : le magasin garde pour eux des exemplaires
des mêmes références que le stock général. Ce ne sont pas d'autres articles —
c'est **la même référence, rangée au même endroit, mais qui ne lui appartient
pas**. Deux boîtes d'UK707E/L peuvent voisiner sur `R03-E1`, l'une au stock
général, l'autre réservée à AOCCI.

Les stocks à part se créent dans **Réglages → Stocks à part**. Chaque nom ajouté
apparaît ensuite dans le menu **« Chercher dans »**, au-dessus du champ de
recherche.

Ce menu **revient au stock général après chaque référence**, et c'est
volontaire : une commande mélange couramment des lignes réservées et des lignes
ordinaires. Un mode qui resterait allumé ferait chercher au mauvais endroit sans
que personne s'en aperçoive.

Une référence rangée seulement au stock général ressort « inconnue » quand on la
cherche chez AOCCI — c'est ce qui empêche de partir avec la pile du voisin. Les
articles Service et Hors PlanStock échappent à ce filtre : ils n'ont aucun
emplacement, donc aucun propriétaire.

Un stock à part qui contient encore des références ne se supprime pas. L'export
gagne une colonne « Réservé à », et l'historique note le nom dans le code
(`R03-E1 · AOCCI`).

## Les deux locaux

L'entreprise a deux branches partageant la même base articles Sage : **Sharp
Center** (reprographie, familles suffixées `TGC11`) et **Optimium**
(informatique, familles suffixées `TGC22`). **PlanStock couvre les deux.** On en
choisit un au démarrage, et tout l'écran s'y rapporte : ses rayonnages, ses
zones, sa recherche, sa couleur.

La recherche ne franchit pas la frontière — une référence rangée à Sharp Center
ressort « inconnue » depuis Optimium.

Le dépôt « DUCOS » reste hors périmètre : les articles concernés se marquent
« Hors PlanStock » et n'occupent aucun emplacement. Comme les services, ils
restent trouvables depuis les deux locaux, avec un message à la place du code.

Les articles portent un code et un libellé de famille Sage facultatifs, repris
dans l'export. Ils sont saisis à la main : **PlanStock ne se connecte jamais à
Sage**.

## Sauvegardes

Trois filets, du plus automatique au plus manuel :

1. **L'historique de Cloudflare (D1 Time Travel)** — trente jours conservés,
   sans rien préparer. C'est le vrai filet. Retour arrière en ligne de commande :
   ```bat
   npx wrangler d1 time-travel restore planstock --timestamp=2026-08-26T09:00:00Z
   ```
2. **Le fichier à télécharger** — Réglages → Sauvegardes → « Télécharger une
   sauvegarde ». Un fichier JSON complet, à ranger où l'on veut. Utile avant une
   manipulation risquée.
3. **La restauration** depuis un de ces fichiers, qui remplace **tout** le
   contenu, les deux locaux compris.

## Logos

Chaque local porte son logo, servi par PlanStock lui-même — aucune image n'est
chargée depuis Internet. Pour en changer : dépose le fichier dans
`web/public/logos/`, puis écris son nom dans Réglages → Ce local → Logo (par
exemple `optimium.png`). Sans fichier, un pictogramme est dessiné dans la
couleur du local.

Les couleurs actuelles sont relevées au cœur des lettres des logos fournis :
indigo `#38388c` pour Optimium, rouge `#e42020` pour Sharp Center.

## Structure du projet

```
planstock/
├── wrangler.toml         configuration du Worker : base D1, interface, réglages
├── migrations/           schéma de la base, appliqué au déploiement
├── worker/               l'API (Hono, exécutée par Cloudflare Workers)
│   ├── index.js          point d'entrée
│   ├── app.js            montage des routes et gestion des erreurs
│   ├── routes/           points d'entrée REST /api/*
│   ├── lib/              base, contrôle d'accès, références, codes, démonstration
│   └── __tests__/        tests joués dans le vrai moteur des Workers
├── web/                  interface Vite + React + TypeScript
│   ├── public/logos/     logos des locaux
│   └── src/
│       ├── components/   barre du haut, recherche, résultat, plan et rayonnage SVG
│       ├── features/     inventaire initial, articles, réglages
│       └── lib/          logique pure testée avec vitest
└── .github/workflows/    déploiement automatique à chaque poussée sur main
```

## Développement

```bat
npm install && npm --prefix web install

npm test                     :: 102 tests d'API + 29 tests d'interface
npm run build                :: compile l'interface dans web/dist
npm run dev                  :: PlanStock complet en local, sur une base D1 locale
npm --prefix web run dev     :: interface seule, rechargement à chaud
npm run db:migrate:local     :: applique le schéma à la base D1 locale
```

Les tests de l'API tournent dans le **vrai moteur des Workers** sur une base D1
locale (le même SQLite qu'en production) : ce qui passe en test passe déployé.

Le fichier Excel de l'export est fabriqué **dans le navigateur** : la
bibliothèque qui l'écrit pèse près d'un mégaoctet et s'appuie sur des modules
Node absents du moteur des Workers. Elle n'est chargée qu'au clic sur le bouton.

## Déploiement

Automatique : chaque poussée sur `main` lance les tests, compile l'interface,
applique les migrations et met le Worker en ligne.

Un seul secret à créer une fois dans le dépôt GitHub
(Settings → Secrets and variables → Actions) :

| Secret | Contenu |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Jeton Cloudflare avec les droits **Edit Workers** et **D1 Edit** |

À la main depuis un poste, si besoin :

```bat
npx wrangler login
npm run deploy
```

### L'adresse

`planstock.lifepilot.win` est déclaré dans `wrangler.toml` comme **domaine
personnalisé** : le Worker est l'origine, il n'y a pas de serveur derrière lui.
Le premier déploiement crée l'enregistrement DNS et le certificat tout seuls —
rien à préparer dans l'onglet DNS.

Deux conditions, sinon le déploiement s'arrête avec une erreur claire plutôt que
de mettre quoi que ce soit en ligne :

- `lifepilot.win` doit être une **zone active** du même compte Cloudflare ;
- `planstock.lifepilot.win` ne doit **pas** avoir déjà un enregistrement CNAME.

**L'apex `lifepilot.win` sert une autre application**, LifePilot, portée par les
Workers `lifepilot` et `lifepilot-preview` du même compte. PlanStock ne prend
que son sous-domaine et ne touche à rien d'autre. Pour en changer, une ligne
dans `wrangler.toml` suffit — mais jamais l'apex, qui débrancherait LifePilot.

## API REST

Toutes les routes sont sous `/api`. Les modifications exigent un technicien
identifié : `user_id` dans le corps de la requête, la query string ou l'en-tête
`X-User-Id` (aucun mot de passe, juste un prénom choisi dans une liste).

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` `POST` | `/api/access` | état du contrôle d'accès, saisie du code |
| `GET` | `/api/health` | état, compteurs, `empty` (déclenche l'inventaire initial) |
| `GET` `POST` `PATCH` | `/api/users` | liste, ajout et désactivation des prénoms |
| `GET` `PATCH` | `/api/sites` | les deux locaux : nom, couleur, logo, taille du plan |
| `GET` `POST` `PATCH` `DELETE` | `/api/landmarks?site_id=` | repères du plan : porte d'entrée, établi |
| `GET` `POST` `PATCH` `DELETE` | `/api/customers?site_id=` | stocks à part d'un local ; la suppression est refusée tant qu'il en reste des références |
| `GET` `POST` `PATCH` `DELETE` | `/api/racks?site_id=` | rayonnages et zones d'un local ; les étagères sont générées automatiquement |
| `GET` | `/api/racks/:id/shelves` | étagères d'un rayonnage avec leur contenu |
| `GET` | `/api/items` · `/api/items/search?q=&site_id=&customer_id=` | recherche exacte, puis par préfixe, puis par désignation ; sans `customer_id`, le stock général seul |
| `POST` `PATCH` `DELETE` | `/api/items` | création, modification, suppression |
| `PUT` | `/api/items/:id/location` | déplacement vers une étagère (`shelf_id`, `side` facultatif) ou une zone (`zone_id`) ; `customer_id` range dans un stock à part sans toucher aux autres |
| `GET` | `/api/movements?reference=` | historique filtrable |
| `GET` `PUT` | `/api/settings` | réglages globaux |
| `GET` | `/api/export/csv?site_id=` · `/api/export/rows?site_id=` | export des articles (famille, local, côté) |
| `GET` | `/api/backups` · `/api/backups/export` | compteurs, fichier de sauvegarde |
| `POST` | `/api/backups/restore` | restauration depuis un fichier |
| `GET` `POST` | `/api/demo` | jeu de démonstration, uniquement sur une base sans stock |

## Ce que PlanStock ne fait pas

Pas de connexion à Sage, pas de compte ni de mot de passe, pas de quantités,
pas d'impression, pas de scan code-barres.

Prévu plus tard, sans être codé aujourd'hui : import d'un export Sage, import
d'un bon de préparation.
