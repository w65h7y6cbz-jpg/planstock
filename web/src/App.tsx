import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Modal } from './components/Modal';
import { TopBar } from './components/TopBar';
import { TopView } from './components/TopView';
import { PlanEditor } from './features/settings/PlanEditor';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useRacks } from './hooks/useRacks';
import { useTheme } from './hooks/useTheme';
import type { Rack, Settings } from './types';
import styles from './App.module.css';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { users, currentUser, loading: usersLoading, error: usersError, selectUser } = useCurrentUser();
  const racksState = useRacks();

  const [settings, setSettings] = useState<Settings>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);

  // Le curseur doit être dans le champ de recherche dès l'ouverture.
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.settings.get();
        if (!cancelled) {
          setSettings(response);
          setServerError(null);
        }
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

  const planWidth = Number(settings.plan_width) || 100;
  const planHeight = Number(settings.plan_height) || 100;
  const error = serverError ?? usersError ?? racksState.error;
  const totalItems = racksState.racks.reduce((total, rack) => total + rack.items_count, 0);

  return (
    <div className={styles.app}>
      <TopBar
        roomName={settings.room_name ?? ''}
        users={users}
        currentUser={currentUser}
        onSelectUser={selectUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
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

        <section className={styles.column} aria-label="Plan du local">
          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>
                Plan du local{settings.room_name ? ` — ${settings.room_name}` : ''}
              </h2>
              <span className={styles.panelMeta}>
                {racksState.racks.length} rayonnage(s) · {totalItems} article(s)
                {selectedRack ? ` · ${selectedRack.rack_code} sélectionné` : ''}
              </span>
            </div>

            {racksState.loading ? (
              <p className={styles.loading}>Chargement du plan…</p>
            ) : (
              <TopView
                racks={racksState.racks}
                planWidth={planWidth}
                planHeight={planHeight}
                selectedRackId={selectedRack?.id ?? null}
                onSelectRack={setSelectedRack}
              />
            )}

            {selectedRack ? (
              <p className={styles.panelMeta}>
                {selectedRack.rack_code} · {selectedRack.label || 'sans libellé'} —{' '}
                {selectedRack.shelves_count} étagères × {selectedRack.slots_per_shelf} cases. Vue
                de face : étape 5.
              </p>
            ) : null}
          </div>
        </section>
      </main>

      {settingsOpen ? (
        <Modal
          title="Paramètres — Plan du local"
          width={1040}
          onClose={() => {
            setSettingsOpen(false);
            racksState.clearError();
          }}
        >
          <PlanEditor
            racks={racksState.racks}
            error={racksState.error}
            canEdit={currentUser !== null}
            planWidth={planWidth}
            planHeight={planHeight}
            onCreate={racksState.createRack}
            onUpdate={racksState.updateRack}
            onDelete={racksState.removeRack}
          />
        </Modal>
      ) : null}
    </div>
  );
}
