import { useState } from 'react';
import { ApiError, api } from '../../api';
import type { Theme } from '../../hooks/useTheme';
import type { Settings } from '../../types';
import styles from './settings.module.css';

interface AppearanceViewProps {
  theme: Theme;
  onToggleTheme: () => void;
  settings: Settings;
  onSettingsChanged: (settings: Settings) => void;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function AppearanceView({
  theme,
  onToggleTheme,
  settings,
  onSettingsChanged,
}: AppearanceViewProps) {
  const [roomName, setRoomName] = useState(settings.room_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        </div>
        <p className={styles.hint}>
          Les proportions du local et la disposition des rayonnages se règlent dans l’onglet Plan.
        </p>
      </section>
    </div>
  );
}
