import { useState } from 'react';
import { ApiError, api } from '../../api';
import type { Theme } from '../../hooks/useTheme';
import type { Rack, Settings } from '../../types';
import styles from './settings.module.css';

interface AppearanceViewProps {
  theme: Theme;
  onToggleTheme: () => void;
  settings: Settings;
  racks: Rack[];
  onSettingsChanged: (settings: Settings) => void;
  onRacksChanged: () => Promise<void>;
}

/** Proportions du local : la largeur reste la référence, la hauteur varie. */
const SHAPES = [
  { value: 100, label: 'Carré' },
  { value: 70, label: 'Large' },
  { value: 55, label: 'Très large' },
];

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function AppearanceView({
  theme,
  onToggleTheme,
  settings,
  racks,
  onSettingsChanged,
  onRacksChanged,
}: AppearanceViewProps) {
  const [roomName, setRoomName] = useState(settings.room_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const planHeight = Number(settings.plan_height) || 100;

  async function saveRoomName() {
    const next = roomName.trim();
    if (next === (settings.room_name ?? '')) return;
    setBusy(true);
    try {
      onSettingsChanged(await api.settings.update({ room_name: next }));
      setNotice('Nom du local enregistré.');
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Enregistrement impossible.'));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Changer la hauteur du plan changerait la position apparente des rayonnages :
   * on remet chacun à l'échelle pour qu'ils gardent leur place relative dans le
   * local, au lieu de sortir du cadre.
   */
  async function changeShape(nextHeight: number) {
    if (nextHeight === planHeight || busy) return;
    setBusy(true);
    try {
      const factor = nextHeight / planHeight;
      for (const rack of racks) {
        const height = Math.max(4, Math.min(rack.height * factor, nextHeight));
        const y = Math.max(0, Math.min(rack.y * factor, nextHeight - height));
        await api.racks.update(rack.id, {
          y: Math.round(y * 100) / 100,
          height: Math.round(height * 100) / 100,
        });
      }
      onSettingsChanged(await api.settings.update({ plan_height: String(nextHeight) }));
      await onRacksChanged();
      setNotice('Proportions du local mises à jour.');
      setError(null);
    } catch (cause) {
      setError(messageOf(cause, 'Modification impossible.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.view}>
      {error ? <p className={styles.error}>{error}</p> : null}
      {notice ? <p className={styles.success}>{notice}</p> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Thème</h3>
        <p className={styles.hint}>
          Le choix est mémorisé sur ce poste. Par défaut, PlanStock suit le réglage clair/sombre de
          Windows.
        </p>
        <div className={styles.buttons}>
          <button type="button" className={styles.button} onClick={onToggleTheme}>
            {theme === 'dark' ? '☀ Passer en mode clair' : '☾ Passer en mode sombre'}
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Local</h3>
        <div className={styles.row}>
          <label className={styles.field}>
            Nom affiché dans la barre du haut
            <input
              type="text"
              value={roomName}
              placeholder="Local de stock"
              maxLength={60}
              disabled={busy}
              onChange={(event) => setRoomName(event.target.value)}
              onBlur={() => void saveRoomName()}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </label>
          <label className={styles.field}>
            Proportions du plan
            <select
              value={planHeight}
              disabled={busy}
              onChange={(event) => void changeShape(Number(event.target.value))}
            >
              {SHAPES.map((shape) => (
                <option key={shape.value} value={shape.value}>
                  {shape.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.hint}>
          Un local plus large occupe mieux l’écran. Les rayonnages déjà placés sont remis à
          l’échelle pour garder leur position relative.
        </p>
      </section>
    </div>
  );
}
