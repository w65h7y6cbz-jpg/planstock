import type { TourStep } from '../../components/GuidedTour';

/**
 * Le fil de la visite guidée.
 *
 * Elle s'adresse à quelqu'un qui découvre PlanStock et se demande ce que ça
 * change — un responsable, un patron — pas à un technicien qui cherche un
 * bouton. Chaque étape part donc du geste de tous les jours et de ce qu'il
 * coûte aujourd'hui, avant de montrer l'écran.
 *
 * L'avant-dernière étape est la plus importante des neuf : elle dit ce que
 * PlanStock **ne fait pas**. C'est la question qui vient toujours, et y répondre
 * avant qu'elle soit posée vaut mieux que d'avoir l'air de l'esquiver.
 */

/**
 * Référence que la visite tape à l'écran.
 *
 * Elle doit exister dans le jeu de démonstration **et** y être réservée à un
 * client : l'étape des stocks à part montre la même référence rangée deux fois,
 * une pour le stock général et une pour AOCCI. Elle est tenue en phase avec
 * `worker/lib/demoSite.js`, qui pose ce jeu.
 */
export const TOUR_REFERENCE = 'MX-3162';

export interface TourActions {
  /** Référence que la démonstration cherche à l'écran. */
  reference: string;
  /** Nom du premier stock à part du local, s'il y en a un. */
  customerName: string | null;
  search: (reference: string, customerId?: number | null) => void;
  /** Identifiant du premier stock à part, pour la recherche réservée. */
  customerId: number | null;
  openPlan: (open: boolean) => void;
  openPickList: (open: boolean) => void;
  goHome: () => void;
}

export function tourSteps(actions: TourActions): TourStep[] {
  const { reference, customerName, customerId, search, openPlan, openPickList, goHome } = actions;

  return [
    {
      title: 'Bienvenue dans la démonstration',
      body: (
        <>
          <p>
            Ce local s’appelle <strong>Démo</strong>. Ses meubles et ses articles sont inventés :
            vous pouvez tout essayer, déplacer, supprimer — <strong>le vrai stock n’est pas
            touché</strong>.
          </p>
          <p>
            PlanStock répond à une seule question, et il n’en pose aucune autre :{' '}
            <strong>où est cette référence, physiquement, dans le magasin ?</strong>
          </p>
        </>
      ),
      enter: () => goHome(),
    },
    {
      title: 'Toute l’application tient dans ce champ',
      body: (
        <>
          <p>
            Un technicien a une référence sur son bon de préparation. Aujourd’hui il traverse le
            magasin, il ouvre des cartons, il demande à un collègue. Ça prend cinq minutes, parfois
            un quart d’heure — et ça recommence à la ligne suivante.
          </p>
          <p>
            Ici il tape la référence. <strong>Rien d’autre à apprendre</strong> : pas de menu, pas
            de formulaire, pas de mot de passe pour chercher.
          </p>
        </>
      ),
      anchor: 'recherche',
      enter: () => goHome(),
    },
    {
      title: 'La réponse, en un coup d’œil',
      body: (
        <>
          <p>
            <strong>{reference}</strong> : le rayonnage, l’étagère, et de quel côté. Un chiffre
            assez gros pour être lu à un mètre cinquante, en marchant.
          </p>
          <p>
            Le technicien n’a pas cherché. On lui a dit où aller.
          </p>
        </>
      ),
      anchor: 'resultat',
      enter: () => search(reference),
    },
    {
      title: 'Et si on ne connaît pas le magasin',
      body: (
        <>
          <p>
            Le plan montre le local tel qu’il est — les murs, les allées, la porte, l’établi — et{' '}
            <strong>allume le meuble concerné</strong>.
          </p>
          <p>
            C’est ce qui fait qu’un intérimaire ou un nouveau est utile dès le premier jour, sans
            que personne l’accompagne dans les rayons.
          </p>
        </>
      ),
      // Ancré sur le dessin, pas sur le bouton « Plan du local » : celui-ci
      // passe sous l'écran du plan une fois ouvert, et le projecteur se posait
      // sur un rectangle vide.
      anchor: 'planLocal',
      enter: () => openPlan(true),
      leave: () => openPlan(false),
    },
    {
      title: 'Les stocks réservés à un client',
      body: (
        <>
          <p>
            Certains clients achètent à l’année. Leurs articles portent{' '}
            <strong>les mêmes références</strong> que le stock général et dorment sur les mêmes
            étagères — mais ils leur sont réservés.
          </p>
          <p>
            {customerName ? (
              <>
                La recherche que vous venez de voir est celle de <strong>{customerName}</strong> :
                même référence, une autre étagère. Et le menu est <strong>déjà revenu au stock
                général</strong> — c’est voulu. Une commande mélange couramment les deux, et un
                mode qui resterait allumé ferait chercher au mauvais endroit sans que personne s’en
                aperçoive.
              </>
            ) : (
              <>
                Le menu « Chercher dans » vise un de ces stocks, puis revient de lui-même au stock
                général à la référence suivante.
              </>
            )}
          </p>
        </>
      ),
      anchor: 'stocks',
      enter: () => {
        goHome();
        if (customerId) search(reference, customerId);
      },
    },
    {
      title: 'Une commande entière, pas une ligne',
      body: (
        <>
          <p>
            Chaque référence cherchée rejoint une <strong>liste de préparation</strong>. On coche
            au fur et à mesure qu’on prélève, et on voit ce qui reste.
          </p>
          <p>
            La liste vit à l’écran, elle ne s’imprime pas et ne se range nulle part : elle sert le
            temps d’une commande, puis on passe à la suivante.
          </p>
        </>
      ),
      anchor: 'liste',
      enter: () => openPickList(true),
    },
    {
      title: 'Qui range, et qui a le droit',
      body: (
        <>
          <p>
            Chaque technicien choisit son prénom, protégé par un <strong>code à 4 chiffres</strong>.
            Chaque déplacement d’article garde son nom : on sait qui a rangé quoi, quand, et depuis
            où.
          </p>
          <p>
            Et on décide pour chacun : déplacer, supprimer, toucher au plan, ou seulement chercher.
          </p>
        </>
      ),
      anchor: 'prenom',
      enter: () => openPickList(false),
    },
    {
      title: 'Ce que PlanStock ne fait pas',
      body: (
        <>
          <p>
            Il <strong>ne se connecte jamais à Sage</strong>, ni en lecture ni en écriture. Aucun
            risque pour la comptabilité, aucun paramétrage à faire côté Sage.
          </p>
          <p>
            Il ne gère <strong>aucune quantité, aucun prix, aucune commande client</strong>. Sage
            reste la référence pour savoir <em>combien</em> il en reste. PlanStock dit seulement{' '}
            <em>où</em> c’est rangé. Les deux ne se marchent pas dessus, et il n’y a pas de double
            saisie à craindre.
          </p>
        </>
      ),
      enter: () => goHome(),
    },
    {
      title: 'À vous',
      body: (
        <>
          <p>
            Essayez : tapez une référence, ouvrez le plan, déplacez un article. Vous êtes dans le
            local <strong>Démo</strong>, il ne peut rien arriver au vrai stock.
          </p>
          <p>
            Le bandeau violet en haut permet de <strong>remettre la démonstration à neuf</strong>{' '}
            quand elle a servi, et de relancer cette visite.
          </p>
        </>
      ),
      enter: () => goHome(),
    },
  ];
}
