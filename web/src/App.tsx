import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Modal } from './components/Modal';
import { PickList } from './components/PickList';
import { PlanPanel, type PlanFocus } from './components/PlanPanel';
import { SearchBox } from './components/SearchBox';
import { TopBar } from './components/TopBar';
import { PlanEditor } from './features/settings/PlanEditor';
import { useCurrentUser } from './hooks/useCurrentUser';
import { usePickList } from './hooks/usePickList';
import { useRacks } from './hooks/useRacks';
import { useTheme } from './hooks/useTheme';
import type { Item, Location, Settings } from './types';
import styles from './App.module.css';

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { users, currentUser, loading: usersLoading, error: usersError, selectUser } = useCurrentUser();
  const racksState = useRacks();
  const pickList = usePickList();

  const [settings, setSettings] = useState<Settings>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [planFocus, setPlanFocus] = useState<PlanFocus | null>(null);

  // Le curseur doit être dans le champ de recherche dès l'ouverture.
  const searchRef = useRef<HTMLInputElement>(null);
  const focusNonce = useRef(0);

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

  const focusOnLocation = useCallback((location: Location, force: boolean) => {
    focusNonce.current += 1;
    setPlanFocus({ location, force, nonce: focusNonce.current });
  }, []);

  /** Une référence trouvée rejoint la liste et allume son emplacement. */
  const pickItem = useCallback(
    (item: Item) => {
      pickList.add(item);
      const location = item.locations[0];
      if (item.kind === 'physical' && location) focusOnLocation(location, false);
    },
    [pickList, focusOnLocation],
  );

  const planWidth = Number(settings.plan_width) || 100;
  const planHeight = Number(settings.plan_height) || 100;
  const error = serverError ?? usersError ?? racksState.error;

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
            <SearchBox
              inputRef={searchRef}
              canCreate={currentUser !== null}
              onPick={pickItem}
              onCreateRequest={(reference) =>
                window.alert(
                  `Formulaire d’ajout de « ${reference} » : étape 6.\n` +
                    'La recherche et la liste de préparation sont opérationnelles.',
                )
              }
            />
          </div>

          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <h2 className={styles.panelTitle}>Liste de préparation</h2>
            <PickList
              physical={pickList.physical}
              withoutStock={pickList.withoutStock}
              pending={pickList.pending}
              flashedItemId={pickList.flashedItemId}
              onToggle={pickList.toggle}
              onRemove={pickList.remove}
              onCheckAll={pickList.checkEverything}
              onClear={pickList.clear}
              onShowLocation={(location) => focusOnLocation(location, true)}
            />
          </div>
        </section>

        <section className={styles.column} aria-label="Plan du local">
          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <PlanPanel
              racks={racksState.racks}
              planWidth={planWidth}
              planHeight={planHeight}
              slotStates={pickList.slots}
              highlight={pickList.racks}
              focus={planFocus}
              loading={racksState.loading}
            />
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
