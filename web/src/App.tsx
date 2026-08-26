import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { TopBar } from './components/TopBar';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useTheme } from './hooks/useTheme';
import type { Health, Settings } from './types';
import styles from './App.module.css';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { users, currentUser, loading: usersLoading, error: usersError, selectUser } = useCurrentUser();

  const [health, setHealth] = useState<Health | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Le curseur doit être dans le champ de recherche dès l'ouverture.
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [healthResponse, settingsResponse] = await Promise.all([
          api.health(),
          api.settings.get(),
        ]);
        if (cancelled) return;
        setHealth(healthResponse);
        setSettings(settingsResponse);
        setServerError(null);
      } catch (cause) {
        if (!cancelled) {
          setServerError(cause instanceof Error ? cause.message : 'Serveur injoignable.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const error = serverError ?? usersError;

  return (
    <div className={styles.app}>
      <TopBar
        roomName={settings.room_name ?? ''}
        users={users}
        currentUser={currentUser}
        onSelectUser={selectUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => window.alert('Écran Paramètres : étape 8.')}
      />

      {error ? (
        <p className={`${styles.banner} ${styles.bannerDanger}`}>⚠ {error}</p>
      ) : !usersLoading && !currentUser ? (
        <p className={styles.banner}>
          Sélectionnez votre prénom en haut à droite : la recherche fonctionne sans, mais aucune
          modification du stock n’est possible tant qu’aucun technicien n’est choisi.
        </p>
      ) : null}

      <main className={styles.main}>
        <section className={styles.column} aria-label="Recherche et préparation">
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Rechercher une référence</h2>
            <input
              ref={searchRef}
              className={styles.search}
              type="search"
              placeholder="Référence du bon de préparation…"
              autoComplete="off"
              spellCheck={false}
              aria-label="Référence à rechercher"
            />
          </div>

          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <h2 className={styles.panelTitle}>Liste de préparation</h2>
            <div className={styles.placeholder}>
              <span>Aucune référence pour l’instant.</span>
              <span>Recherche et liste de préparation : étape 5.</span>
            </div>
          </div>
        </section>

        <section className={`${styles.column}`} aria-label="Plan du local">
          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <h2 className={styles.panelTitle}>Plan du local</h2>
            {health ? (
              <ul className={styles.stats}>
                <li className={styles.stat}>
                  <span className={styles.statValue}>{health.counts.racks}</span>
                  <span className={styles.statLabel}>rayonnages</span>
                </li>
                <li className={styles.stat}>
                  <span className={styles.statValue}>{health.counts.items}</span>
                  <span className={styles.statLabel}>articles</span>
                </li>
                <li className={styles.stat}>
                  <span className={styles.statValue}>{health.counts.users}</span>
                  <span className={styles.statLabel}>techniciens</span>
                </li>
              </ul>
            ) : (
              <p className={styles.loading}>Connexion au serveur…</p>
            )}
            <div className={styles.placeholder}>
              {health?.empty ? (
                <>
                  <span>Aucun rayonnage enregistré.</span>
                  <span>Éditeur de plan : étape 4 — Inventaire initial : étape 7.</span>
                </>
              ) : (
                <>
                  <span>Vue de dessus du local.</span>
                  <span>Plan interactif : étape 4.</span>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
