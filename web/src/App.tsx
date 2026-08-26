import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type AccessState } from './api';
import { AccessScreen } from './components/AccessScreen';
import { PickDrawer } from './components/PickDrawer';
import { PlanScreen } from './components/PlanScreen';
import { ResultScreen, type SearchOutcome } from './components/ResultScreen';
import { SearchHome, type SearchHandle } from './components/SearchHome';
import { SiteChooser } from './components/SiteChooser';
import { Toasts } from './components/Toasts';
import { TopBar, type MenuAction } from './components/TopBar';
import { InventoryMode } from './features/inventory/InventoryMode';
import { CustomersView } from './features/settings/CustomersView';
import { DataView } from './features/settings/DataView';
import { ItemsView } from './features/settings/ItemsView';
import { MovementsView } from './features/settings/MovementsView';
import { RacksView } from './features/settings/RacksView';
import { SettingsPage } from './features/settings/SettingsPage';
import { SiteView } from './features/settings/SiteView';
import { UsersView } from './features/settings/UsersView';
import { useCurrentUser } from './hooks/useCurrentUser';
import { useCustomers } from './hooks/useCustomers';
import { usePickList } from './hooks/usePickList';
import { useRacks } from './hooks/useRacks';
import { useSites } from './hooks/useSites';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import type { Item, Landmark, ShelfItem } from './types';
import styles from './App.module.css';

/**
 * Enchaînement des écrans.
 *
 * Un seul écran occupe la page à la fois : le choix du local, la recherche, le
 * résultat, ou un réglage. Le plan et la liste de préparation se superposent —
 * on y entre et on en sort sans perdre ce qu'on faisait.
 */

type Screen =
  | { name: 'home' }
  | { name: 'result'; outcome: SearchOutcome }
  | { name: 'settings'; page: Exclude<MenuAction, 'switch-site'> };

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error
    ? cause.message
    : fallback;

const SETTINGS_TITLES: Record<
  Exclude<MenuAction, 'switch-site'>,
  [string, string]
> = {
  racks: [
    'Rayonnages et zones',
    'Dessine le local : pose les meubles, fais-les glisser à leur place.',
  ],
  stocks: [
    'Stocks à part',
    'Ceux des clients qui achètent à l’année, rangés au même endroit que le stock général.',
  ],
  items: [
    'Articles',
    'Corriger une référence, changer un emplacement, supprimer une ligne.',
  ],
  users: [
    'Équipe',
    'Les prénoms de l’atelier. Aucun mot de passe, aucun rôle.',
  ],
  movements: ['Mouvements', 'Qui a rangé quoi, quand, et depuis où.'],
  backups: [
    'Sauvegardes',
    'Copies de la base, restauration et export du stock.',
  ],
  site: ['Ce local', 'Son nom, sa couleur, son logo et la taille de son plan.'],
};

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    sites,
    site,
    loading: sitesLoading,
    error: sitesError,
    selectSite,
    reloadSites,
  } = useSites();
  const { users, currentUser, selectUser, reloadUsers } = useCurrentUser();
  const { customers, reloadCustomers } = useCustomers(site?.id ?? null);
  const racksState = useRacks(site?.id ?? null);
  const pickList = usePickList();
  const { toasts, notify, dismiss } = useToasts();

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [landmarks, setLandmarks] = useState<Landmark[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [focusRackId, setFocusRackId] = useState<number | null>(null);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [serverDown, setServerDown] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const searchRef = useRef<SearchHandle>(null);

  const reloadLandmarks = useCallback(async () => {
    if (!site) {
      setLandmarks([]);
      return;
    }
    try {
      setLandmarks(await api.landmarks.list(site.id));
    } catch {
      setLandmarks([]);
    }
  }, [site]);

  useEffect(() => {
    void reloadLandmarks();
  }, [reloadLandmarks]);

  // Premier contact : la porte est-elle ouverte, et la base est-elle vide ?
  const [access, setAccess] = useState<AccessState | null>(null);

  const knock = useCallback(async () => {
    try {
      const health = await api.health();
      setAccess({ open: true, can_use_code: false, your_ip: '' });
      setServerDown(null);
      // Base vide au premier lancement : on enchaîne sur l'inventaire initial.
      if (health.empty) setInventoryOpen(true);
    } catch (cause) {
      // 403 : la connexion n'est pas autorisée. L'écran d'entrée dira pourquoi.
      if (cause instanceof ApiError && cause.status === 403) {
        try {
          setAccess(await api.access.get());
          setServerDown(null);
          return;
        } catch {
          // L'écran d'entrée lui-même est injoignable : c'est une panne.
        }
      }
      setServerDown(messageOf(cause, 'PlanStock est injoignable.'));
    }
  }, []);

  useEffect(() => {
    void knock();
  }, [knock]);

  // Le curseur revient dans la recherche dès qu'on retrouve l'accueil.
  useEffect(() => {
    if (screen.name === 'home' && !inventoryOpen && site)
      searchRef.current?.focus();
  }, [screen.name, inventoryOpen, site]);

  // P ouvre le plan, Échap referme ce qui est ouvert.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.key === 'Escape') {
        if (planOpen) setPlanOpen(false);
        else if (drawerOpen) setDrawerOpen(false);
        else if (screen.name !== 'home') goHome();
        return;
      }
      if (!site) return;

      // P n'est un raccourci qu'en dehors d'une saisie : une référence peut
      // commencer par P (PNE24T). F2 reste disponible en toutes circonstances.
      const wantsPlan =
        event.key === 'F2' ||
        (!typing && (event.key === 'p' || event.key === 'P'));
      if (wantsPlan) {
        event.preventDefault();
        setPlanOpen((open) => !open);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

  function goHome() {
    setScreen({ name: 'home' });
    searchRef.current?.clear();
  }

  /** Après toute modification du stock : plan, panneau et liste remis à jour. */
  const refreshAfterMutation = useCallback(
    async (itemId: number | null) => {
      setRefreshToken((token) => token + 1);
      await racksState.reload();
      if (itemId === null) return;
      try {
        pickList.updateItem(await api.items.get(itemId));
      } catch {
        // L'article n'est plus dans la liste : rien à rafraîchir.
      }
    },
    [racksState, pickList],
  );

  /** Rechargement complet après remplacement des données (restauration, démo). */
  const reloadEverything = useCallback(async () => {
    pickList.clear();
    setFocusRackId(null);
    setRefreshToken((token) => token + 1);
    await Promise.all([
      racksState.reload(),
      reloadUsers(),
      reloadSites(),
      reloadLandmarks(),
    ]);
  }, [pickList, racksState, reloadUsers, reloadSites, reloadLandmarks]);

  /** Une référence trouvée s'affiche et rejoint la liste dans le même geste. */
  const showItem = useCallback(
    (item: Item) => {
      pickList.add(item);
      if (!drawerOpen) setDrawerOpen(true);
      const location = item.locations[0];
      setFocusRackId(
        item.kind === 'physical' && location ? location.rack_id : null,
      );
      setScreen({ name: 'result', outcome: { status: 'found', item } });
    },
    [pickList, drawerOpen],
  );

  const runSearch = useCallback(
    async (query: string, customerId: number | null = null) => {
      if (!site) return;
      setScreen({ name: 'result', outcome: { status: 'searching', query } });
      try {
        const result = await api.items.search(query, site.id, customerId);
        if (result.exact) {
          showItem(result.exact);
          return;
        }
        setFocusRackId(null);
        setScreen({
          name: 'result',
          outcome: { status: 'unknown', query: query.toUpperCase() },
        });
      } catch (cause) {
        setScreen({
          name: 'result',
          outcome: {
            status: 'error',
            query: query.toUpperCase(),
            message: messageOf(cause, 'Recherche impossible.'),
          },
        });
      }
    },
    [site, showItem],
  );

  /** Déplacement d'un article, avec possibilité d'annuler. */
  const moveItem = useCallback(
    async (
      item: ShelfItem,
      target: { shelf_id?: number; zone_id?: number },
      code: string,
    ) => {
      if (!currentUser) {
        notify({
          tone: 'danger',
          message: 'Choisis ton prénom en haut à droite.',
        });
        return;
      }
      try {
        const before = await api.items.get(item.id);
        const from = before.locations[0] ?? null;
        if (from?.code === code) return;

        await api.items.move(currentUser.id, item.id, target);
        await refreshAfterMutation(item.id);

        notify({
          tone: 'success',
          message: `${item.reference_display} : ${from?.code ?? '—'} → ${code}`,
          action: from
            ? {
                label: 'Annuler',
                run: () => {
                  void (async () => {
                    try {
                      await api.items.move(
                        currentUser.id,
                        item.id,
                        from.kind === 'shelf'
                          ? {
                              shelf_id: from.shelf_id as number,
                              side: from.side,
                            }
                          : { zone_id: from.zone_id as number },
                      );
                      await refreshAfterMutation(item.id);
                      notify({
                        tone: 'info',
                        message: `${item.reference_display} remis en ${from.code}.`,
                      });
                    } catch (cause) {
                      notify({
                        tone: 'danger',
                        message: messageOf(cause, 'Annulation impossible.'),
                      });
                    }
                  })();
                },
              }
            : undefined,
        });
      } catch (cause) {
        notify({
          tone: 'danger',
          message: messageOf(cause, 'Déplacement impossible.'),
        });
      }
    },
    [currentUser, refreshAfterMutation, notify],
  );

  function onMenu(action: MenuAction) {
    if (action === 'switch-site') {
      selectSite(null);
      setScreen({ name: 'home' });
      setPlanOpen(false);
      return;
    }
    setPlanOpen(false);
    setScreen({ name: 'settings', page: action });
  }

  // --- Écrans qui prennent la place de tout le reste ---

  if (serverDown) {
    return (
      <main className={styles.offline}>
        <h1 className={styles.offlineTitle}>PlanStock est injoignable</h1>
        <p className={styles.offlineText}>
          L’application est hébergée en ligne : sans connexion Internet, elle ne
          répond pas. Vérifie la connexion du magasin, puis réessaie. Aucune
          donnée n’est perdue.
        </p>
        <p className={styles.offlineDetail}>{serverDown}</p>
        <button
          type="button"
          className={styles.offlineButton}
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
      </main>
    );
  }

  // Porte fermée : ni le local ni la recherche ne servent tant qu'on est dehors.
  if (access && !access.open) {
    return <AccessScreen state={access} onOpened={() => void knock()} />;
  }

  if (!site) {
    return (
      <SiteChooser
        sites={sites}
        loading={sitesLoading}
        error={sitesError}
        onSelect={(id) => selectSite(id)}
      />
    );
  }

  // L'inventaire couvre tout l'écran : on démonte le reste plutôt que de le
  // laisser dessous. L'état vit dans les hooks, rien n'est perdu.
  if (inventoryOpen) {
    return (
      <>
        <InventoryMode
          site={site}
          currentUser={currentUser}
          users={users}
          onSelectUser={selectUser}
          racks={racksState.racks}
          racksLoading={racksState.loading}
          onCreateRacks={racksState.createRacks}
          onItemSaved={() => void refreshAfterMutation(null)}
          onClose={() => {
            setInventoryOpen(false);
            void reloadEverything();
          }}
        />
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  const shelvesCountOf = (rackId: number | null) =>
    racksState.racks.find((rack) => rack.id === rackId)?.shelves_count ?? null;

  return (
    <div className={styles.app}>
      <TopBar
        site={site}
        users={users}
        currentUser={currentUser}
        theme={theme}
        pickCount={pickList.entries.length}
        pickPending={pickList.pending}
        onHome={goHome}
        onOpenPlan={() => setPlanOpen(true)}
        onOpenPickList={() => setDrawerOpen((open) => !open)}
        onSelectUser={selectUser}
        onToggleTheme={toggleTheme}
        onMenu={onMenu}
      />

      <div className={`${styles.body} ${drawerOpen ? styles.bodyWithDrawer : ''}`}>
        {screen.name === 'settings' ? (
          <SettingsPage
            title={SETTINGS_TITLES[screen.page][0]}
            subtitle={SETTINGS_TITLES[screen.page][1]}
            onBack={goHome}
          >
            {screen.page === 'racks' ? (
              <RacksView
                site={site}
                racks={racksState.racks}
                landmarks={landmarks}
                error={racksState.error}
                canEdit={currentUser !== null}
                onCreate={racksState.createRack}
                onUpdate={racksState.updateRack}
                onDelete={racksState.removeRack}
                onLandmarksChanged={reloadLandmarks}
                onSiteChanged={reloadSites}
              />
            ) : screen.page === 'stocks' ? (
              <CustomersView site={site} onChanged={reloadCustomers} />
            ) : screen.page === 'items' ? (
              <ItemsView
                site={site}
                racks={racksState.racks}
                currentUser={currentUser}
                onChanged={() => refreshAfterMutation(null)}
              />
            ) : screen.page === 'users' ? (
              <UsersView currentUser={currentUser} onChanged={reloadUsers} />
            ) : screen.page === 'movements' ? (
              <MovementsView />
            ) : screen.page === 'backups' ? (
              <DataView
                site={site}
                currentUser={currentUser}
                onDataReplaced={reloadEverything}
                onRelaunchInventory={() => {
                  setScreen({ name: 'home' });
                  setInventoryOpen(true);
                }}
              />
            ) : (
              <SiteView
                site={site}
                theme={theme}
                onToggleTheme={toggleTheme}
                onSaved={reloadSites}
              />
            )}
          </SettingsPage>
        ) : (
          <>
            {screen.name === 'result' ? (
              <SearchHome
                ref={searchRef}
                site={site}
                customers={customers}
                compact
                onSubmit={(query, customerId) => void runSearch(query, customerId)}
                onPick={(item) => showItem(item)}
              />
            ) : null}

            {screen.name === 'home' ? (
              <SearchHome
                ref={searchRef}
                site={site}
                customers={customers}
                onSubmit={(query, customerId) => void runSearch(query, customerId)}
                onPick={(item) => showItem(item)}
              />
            ) : (
              <ResultScreen
                outcome={screen.outcome}
                shelvesCount={shelvesCountOf(focusRackId)}
                onOpenPlan={() => setPlanOpen(true)}
                onNext={goHome}
              />
            )}
          </>
        )}

        <PickDrawer
          open={drawerOpen}
          pickList={pickList}
          onClose={() => setDrawerOpen(false)}
          onShow={(entry) => {
            const location = entry.item.locations[0];
            setFocusRackId(location?.rack_id ?? null);
            setScreen({
              name: 'result',
              outcome: { status: 'found', item: entry.item },
            });
          }}
        />
      </div>

      {planOpen ? (
        <PlanScreen
          site={site}
          racks={racksState.racks}
          landmarks={landmarks}
          focusRackId={focusRackId}
          route={pickList.route}
          locationStates={pickList.locations}
          canEdit={currentUser !== null}
          refreshToken={refreshToken}
          onClose={() => setPlanOpen(false)}
          onMoveItem={(item, target, code) => void moveItem(item, target, code)}
        />
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
