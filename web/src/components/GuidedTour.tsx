import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import styles from './GuidedTour.module.css';

/**
 * Visite guidée.
 *
 * Une bulle à la fois, posée à côté de l'élément dont elle parle, et un
 * projecteur sur cet élément. Chaque étape dit **à quoi ça sert** avant de dire
 * où cliquer : la visite s'adresse à quelqu'un qui découvre l'outil et se
 * demande ce qu'il apporte, pas à quelqu'un qui cherche un bouton.
 *
 * La couche ne capte pas les clics. On peut donc essayer l'application pendant
 * la visite, chercher une autre référence, ouvrir le plan — et la bulle suit.
 * C'est ce qui distingue une démonstration d'un diaporama.
 */

export interface TourStep {
  title: string;
  body: ReactNode;
  /**
   * Valeur d'un attribut `data-tour` présent dans la page. Absent, ou introuvable
   * à l'écran, la bulle se met au centre plutôt que de pointer dans le vide.
   */
  anchor?: string;
  /** Préparer l'écran avant d'afficher l'étape (ouvrir le plan, chercher…). */
  enter?: () => void | Promise<void>;
  /** Remettre en état en quittant l'étape (refermer le plan…). */
  leave?: () => void;
}

interface GuidedTourProps {
  steps: TourStep[];
  onFinish: () => void;
}

/** Marge entre le projecteur et l'élément qu'il éclaire. */
const PADDING = 8;
/** Distance entre le projecteur et la bulle. */
const GAP = 14;
/** Marge minimale entre la bulle et le bord de l'écran. */
const MARGIN = 16;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const findAnchor = (anchor?: string) =>
  anchor ? document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`) : null;

export function GuidedTour({ steps, onFinish }: GuidedTourProps) {
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box | null>(null);
  const [bubble, setBubble] = useState<Box | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const last = index === steps.length - 1;

  /**
   * `enter` et `leave` changent l'état de l'application, donc font rendre à
   * nouveau — et le rendu reconstruit le tableau d'étapes. Les déclencher sur
   * l'identité de l'étape tournerait en rond sans fin. Ils suivent donc le
   * **numéro** de l'étape, et vont chercher les fonctions dans une référence
   * tenue à jour en marge du rendu.
   */
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  useEffect(() => {
    const current = stepsRef.current[index];
    void current?.enter?.();
    return () => current?.leave?.();
  }, [index]);

  /**
   * Position du projecteur et de la bulle.
   *
   * Recalculée à chaque étape, mais aussi au défilement et au redimensionnement :
   * la page bouge sous la visite dès qu'on s'en sert, et une bulle qui reste en
   * arrière désigne le mauvais endroit.
   */
  const anchor = step?.anchor;

  const place = useCallback(() => {
    const element = findAnchor(anchor);
    if (!element) {
      setSpot(null);
      setBubble(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    // Un élément sorti de l'écran (replié, masqué) ne mérite pas de projecteur.
    if (rect.width === 0 && rect.height === 0) {
      setSpot(null);
      setBubble(null);
      return;
    }

    const target: Box = {
      top: rect.top - PADDING,
      left: rect.left - PADDING,
      width: rect.width + PADDING * 2,
      height: rect.height + PADDING * 2,
    };
    setSpot(target);

    // Hauteur **mesurée**, pas estimée : les étapes n'ont pas toutes la même
    // longueur, et une bulle plus haute que prévu passe sous le bas de l'écran
    // en emportant le bouton « Suivant » avec elle.
    const height = bubbleRef.current?.offsetHeight ?? 260;
    const width = Math.min(420, window.innerWidth - 32);

    const below = target.top + target.height + GAP;
    const above = target.top - GAP - height;
    // Dessous si la place y est, sinon dessus, sinon collée en haut — et dans
    // tous les cas ramenée dans l'écran plutôt que laissée dehors.
    const top =
      below + height <= window.innerHeight - MARGIN
        ? below
        : above >= MARGIN
          ? above
          : Math.max(MARGIN, window.innerHeight - height - MARGIN);

    setBubble({
      top,
      left: Math.min(
        Math.max(MARGIN, target.left + target.width / 2 - width / 2),
        window.innerWidth - width - MARGIN,
      ),
      width,
      height,
    });
  }, [anchor]);

  useLayoutEffect(() => {
    place();
    // L'étape vient peut-être d'ouvrir un écran : on repasse une fois le rendu
    // fait, sinon le projecteur se pose sur l'écran précédent.
    const timers = [50, 220, 500].map((delay) => window.setTimeout(place, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [place]);

  useEffect(() => {
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [place]);

  const go = useCallback(
    (delta: number) => {
      setIndex((current) => {
        const next = current + delta;
        if (next < 0) return current;
        if (next >= steps.length) {
          onFinish();
          return current;
        }
        return next;
      });
    },
    [steps.length, onFinish],
  );

  // Le clavier suit la visite : flèches pour avancer, Échap pour sortir.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onFinish();
      } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
        event.preventDefault();
        go(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        go(-1);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [go, onFinish]);

  if (!step) return null;

  const centered = !spot || !bubble;

  return (
    <div className={styles.layer} role="dialog" aria-label="Visite guidée de PlanStock">
      {centered ? (
        <div className={styles.veil} />
      ) : (
        <div
          className={styles.spot}
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}

      <div
        className={styles.bubble}
        ref={bubbleRef}
        style={
          centered
            ? {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }
            : { top: bubble.top, left: bubble.left, width: bubble.width }
        }
      >
        <span className={styles.step}>
          Étape {index + 1} sur {steps.length}
        </span>
        <h2 className={styles.title}>{step.title}</h2>
        <div className={styles.body}>{step.body}</div>

        <div className={styles.footer}>
          <span className={styles.dots} aria-hidden="true">
            {steps.map((entry, position) => (
              <span
                key={entry.title}
                className={`${styles.dot} ${
                  position === index ? styles.dotOn : position < index ? styles.dotDone : ''
                }`}
              />
            ))}
          </span>

          <button type="button" className={styles.ghost} onClick={onFinish}>
            Quitter <span className={styles.kbd}>Échap</span>
          </button>
          {index > 0 ? (
            <button type="button" className={styles.ghost} onClick={() => go(-1)}>
              Retour
            </button>
          ) : null}
          <button type="button" className={styles.next} onClick={() => go(1)} autoFocus>
            {last ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
