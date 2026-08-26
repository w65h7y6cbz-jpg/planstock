import { useState } from 'react';
import { ApiError, api } from '../../api';
import styles from '../../components/GuidedTour.module.css';

/**
 * Bandeau permanent du local de démonstration.
 *
 * Il est là pour qu'à aucun moment quelqu'un ne croie regarder le vrai stock —
 * la ressemblance est le but de la démonstration, et c'est précisément ce qui
 * rend la confusion possible. Il porte aussi les deux gestes qu'on veut sous la
 * main pendant une présentation : relancer la visite, et remettre le local à
 * neuf quand on l'a laissé en désordre.
 */

interface DemoBannerProps {
  userId: number | null;
  onStartTour: () => void;
  onReset: () => Promise<void>;
}

export function DemoBanner({ userId, onStartTour, onReset }: DemoBannerProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reset() {
    if (!userId) {
      setMessage('Choisissez un prénom en haut à droite pour remettre la démo à neuf.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.demo.resetSite(userId);
      await onReset();
      setMessage(
        result.skipped.length > 0
          ? `Démo remise à neuf — ${result.skipped.length} référence(s) laissée(s) au vrai stock.`
          : 'Démo remise à neuf.',
      );
    } catch (cause) {
      setMessage(
        cause instanceof ApiError || cause instanceof Error
          ? cause.message
          : 'Remise à neuf impossible.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.banner}>
      <span className={styles.bannerText}>
        {message ?? (
          <>
            <strong>Local de démonstration</strong> — articles inventés, le vrai stock n’est pas
            touché.
          </>
        )}
      </span>
      <button type="button" className={styles.bannerButton} onClick={onStartTour} disabled={busy}>
        Visite guidée
      </button>
      <button type="button" className={styles.bannerButton} onClick={() => void reset()} disabled={busy}>
        {busy ? 'Remise à neuf…' : 'Remettre à neuf'}
      </button>
    </div>
  );
}
