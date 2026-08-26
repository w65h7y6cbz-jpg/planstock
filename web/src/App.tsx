import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type ItemPayload } from './api';
import { Modal } from './components/Modal';
import { PickList } from './components/PickList';
import { PlanPanel, type PlanFocus } from './components/PlanPanel';
import type { LocationSelection, MoveTarget } from './components/RackView';
import { SearchBox } from './components/SearchBox';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { InventoryMode } from './features/inventory/InventoryMode';
import { ItemForm } from './features/items/ItemForm';
import { AppearanceView } from './features/settings/AppearanceView';
import { DataView } from './features/settings/DataView';
import { MovementsView } from './features/settings/MovementsView';
import { PlanEditor } from './features/settings/PlanEditor';
import { UsersView } from './features/settings/UsersView';
import { useCurrentUser } from './hooks/useCurrentUser';
import { usePickList } from './hooks/usePickList';
import { useRacks } from './hooks/useRacks';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import type { Item, Location, Rack, Settings, Shelf, ShelfItem } from './types';
import styles from './App.module.css';

type FormState =
  | { mode: 'create'; presetReference: string }
  | { mode: 'edit'; item: Item }
  | null;

const SETTINGS_TABS = [
  { id: 'users', label: 'Utilisateurs' },
  { id: 'plan', label: 'Plan' },
  { id: 'history', label: 'Historique' },
  { id: 'data', label: 'Données' },
  { id: 'appearance', label: 'Apparence' },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function App() {
  const { theme, toggleTheme } = useTheme();
  const {
    users,
    currentUser,
    loading: usersLoading,
    error: usersError,
    selectUser,
    reloadUsers,
  } = useCurrentUser();
  const racksState = useRacks();
  const pickList = usePickList();
  const { toasts, notify, dismiss } = useToasts();

  const [settings, setSettings] = useState<Settings>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [planFocus, setPlanFocus] = useState<PlanFocus | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<{ shelf?: Shelf; zone?: Rack } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  // Le curseur doit être dans le champ de recherche dès l'ouverture.
  const searchRef = useRef<HTMLInputElement>(null);
  const focusNonce = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [settingsResponse, health] = await Promise.all([api.settings.get(), api.health()]);
        if (cancelled) return;
        setSettings(settingsResponse);
        setServerError(null);
        // Base vide au premier lancement : on enchaîne directement sur
        // l'assistant de plan puis la saisie guidée.
        if (health.empty) setInventoryOpen(true);
      } catch (cause) {
        if (!cancelled) setServerError(messageOf(cause, 'Serveur injoignable.'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Le curseur revient dans la recherche au chargement et à la sortie de l'inventaire.
  useEffect(() => {
    if (!inventoryOpen) searchRef.current?.focus();
  }, [inventoryOpen]);

  const focusOnLocation = useCallback(
    (location: Location, force: boolean, reference: string | null = null) => {
      focusNonce.current += 1;
      setPlanFocus({
        rackId: location.rack_id,
        code: location.code,
        reference,
        force,
        nonce: focusNonce.current,
      });
    },
    [],
  );

  /** Après toute modification : plan, rayonnage ouvert et liste de prépa à jour. */
  const refreshAfterMutation = useCallback(
    async (itemId: number | null) => {
      setRefreshToken((token) => token + 1);
      await racksState.reload();
      if (itemId === null) return;
      try {
        pickList.updateItem(await api.items.get(itemId));
      } catch {
        // L'article n'est plus dans la liste de préparation : rien à rafraîchir.
      }
    },
    [racksState, pickList],
  );

  /**
   * Rechargement complet après remplacement des données (restauration, démo).
   * La liste de préparation est vidée : ses lignes pointent vers des articles
   * qui n'existent peut-être plus.
   */
  const reloadEverything = useCallback(async () => {
    pickList.clear();
    setPlanFocus(null);
    setRefreshToken((token) => token + 1);
    await Promise.all([racksState.reload(), reloadUsers()]);
    try {
      setSettings(await api.settings.get());
      setServerError(null);
    } catch (cause) {
      setServerError(messageOf(cause, 'Serveur injoignable.'));
    }
  }, [pickList, racksState, reloadUsers]);

  /**
   * Changer la hauteur du plan changerait la position apparente des emplacements :
   * on remet chacun à l'échelle pour qu'il garde sa place relative dans le local,
   * au lieu de sortir du cadre.
   */
  const changePlanShape = useCallback(
    async (nextHeight: number) => {
      const currentHeight = Number(settings.plan_height) || 100;
      if (nextHeight === currentHeight) return;
      try {
        const factor = nextHeight / currentHeight;
        for (const rack of racksState.racks) {
          const height = Math.max(3, Math.min(rack.height * factor, nextHeight));
          const y = Math.max(0, Math.min(rack.y * factor, nextHeight - height));
          await api.racks.update(rack.id, {
            y: Math.round(y * 100) / 100,
            height: Math.round(height * 100) / 100,
          });
        }
        setSettings(await api.settings.update({ plan_height: String(nextHeight) }));
        await racksState.reload();
      } catch (cause) {
        notify({ tone: 'danger', message: messageOf(cause, 'Modification impossible.') });
      }
    },
    [settings, racksState, notify],
  );

  /** Une référence trouvée rejoint la liste et allume son emplacement. */
  const pickItem = useCallback(
    (item: Item) => {
      pickList.add(item);
      const location = item.locations[0];
      if (item.kind === 'physical' && location) focusOnLocation(location, false, item.reference);
    },
    [pickList, focusOnLocation],
  );

  const requireUser = useCallback(() => {
    if (currentUser) return true;
    notify({
      tone: 'danger',
      message: 'Sélectionnez d’abord votre prénom en haut à droite.',
    });
    return false;
  }, [currentUser, notify]);

  async function submitForm(payload: ItemPayload): Promise<boolean> {
    if (!currentUser) {
      setFormError('Sélectionnez d’abord votre prénom en haut à droite.');
      return false;
    }
    try {
      if (form?.mode === 'edit') {
        const updated = await api.items.update(currentUser.id, form.item.id, payload);
        await refreshAfterMutation(updated.id);
        notify({ tone: 'success', message: `${updated.reference_display} modifié.` });
      } else {
        const created = await api.items.create(currentUser.id, payload);
        await refreshAfterMutation(null);
        pickItem(created);
        notify({
          tone: 'success',
          message: `${created.reference_display} ajouté${
            created.locations[0] ? ` en ${created.locations[0].code}` : ''
          }.`,
        });
      }
      closeForm();
      return true;
    } catch (cause) {
      setFormError(messageOf(cause, 'Enregistrement impossible.'));
      return false;
    }
  }

  function closeForm() {
    setForm(null);
    setFormError(null);
    setPicking(false);
    setPicked(null);
    searchRef.current?.focus();
  }

  /** Déplacement effectif d'un article, avec possibilité d'annuler. */
  const moveItem = useCallback(
    async (item: ShelfItem, target: MoveTarget, code: string) => {
      if (!requireUser() || !currentUser) return;
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
                          ? { shelf_id: from.shelf_id as number }
                          : { zone_id: from.zone_id as number },
                      );
                      await refreshAfterMutation(item.id);
                      notify({
                        tone: 'info',
                        message: `${item.reference_display} remis en ${from.code}.`,
                      });
                    } catch (cause) {
                      notify({ tone: 'danger', message: messageOf(cause, 'Annulation impossible.') });
                    }
                  })();
                },
              }
            : undefined,
        });
      } catch (cause) {
        notify({ tone: 'danger', message: messageOf(cause, 'Déplacement impossible.') });
      }
    },
    [currentUser, requireUser, refreshAfterMutation, notify],
  );

  const deleteItem = useCallback(
    async (item: ShelfItem) => {
      if (!requireUser() || !currentUser) return;
      if (!window.confirm(`Supprimer définitivement ${item.reference_display} du plan ?`)) return;
      try {
        await api.items.remove(currentUser.id, item.id);
        pickList.remove(item.id);
        await refreshAfterMutation(null);
        notify({ tone: 'info', message: `${item.reference_display} supprimé.` });
      } catch (cause) {
        notify({ tone: 'danger', message: messageOf(cause, 'Suppression impossible.') });
      }
    },
    [currentUser, requireUser, pickList, refreshAfterMutation, notify],
  );

  const editItem = useCallback(async (item: ShelfItem) => {
    try {
      setForm({ mode: 'edit', item: await api.items.get(item.id) });
      setFormError(null);
    } catch (cause) {
      setFormError(messageOf(cause, 'Article introuvable.'));
    }
  }, []);

  // Une seule mécanique de choix d'emplacement : le formulaire ouvert.
  const selection: LocationSelection | null =
    picking && form
      ? {
          label: 'Cliquez l’étagère ou la zone où ranger cet article.',
          onSelectShelf: (shelf) => setPicked({ shelf }),
          onSelectZone: (zone) => setPicked({ zone }),
        }
      : null;

  const planWidth = Number(settings.plan_width) || 100;
  const planHeight = Number(settings.plan_height) || 100;
  const error = serverError ?? usersError ?? racksState.error;

  // L'inventaire couvre tout l'écran : on démonte l'écran principal plutôt que
  // de le laisser dessous (deux plans dans le DOM, doublons pour les lecteurs
  // d'écran). L'état vit dans les hooks, rien n'est perdu.
  if (inventoryOpen) {
    return (
      <>
        <InventoryMode
          currentUser={currentUser}
          users={users}
          onSelectUser={selectUser}
          racks={racksState.racks}
          racksLoading={racksState.loading}
          planWidth={planWidth}
          planHeight={planHeight}
          onCreateRacks={racksState.createRacks}
          onItemSaved={() => void refreshAfterMutation(null)}
          onClose={() => setInventoryOpen(false)}
        />
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </>
    );
  }

  return (
    <div className={styles.app}>
      <TopBar
        roomName={settings.room_name ?? ''}
        users={users}
        currentUser={currentUser}
        onSelectUser={selectUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsTab('plan')}
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
          {form ? (
            <div className={`${styles.panel} ${styles.panelGrow}`}>
              <h2 className={styles.panelTitle}>
                {form.mode === 'edit' ? 'Modifier l’article' : 'Nouvel article'}
              </h2>
              <ItemForm
                key={form.mode === 'edit' ? form.item.id : form.presetReference}
                item={form.mode === 'edit' ? form.item : null}
                presetReference={form.mode === 'create' ? form.presetReference : ''}
                racks={racksState.racks}
                picked={picked}
                onPickingChange={setPicking}
                onSubmit={submitForm}
                onCancel={closeForm}
                error={formError}
              />
            </div>
          ) : (
            <>
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>Rechercher une référence</h2>
                <SearchBox
                  inputRef={searchRef}
                  canCreate={currentUser !== null}
                  onPick={pickItem}
                  onCreateRequest={(reference) => {
                    setFormError(null);
                    setPicked(null);
                    // Les références du bon sont en majuscules : on pré-remplit ainsi,
                    // en gardant les séparateurs saisis (UK707E/L). Reste modifiable.
                    setForm({ mode: 'create', presetReference: reference.toUpperCase() });
                  }}
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
            </>
          )}
        </section>

        <section className={styles.column} aria-label="Plan du local">
          <div className={`${styles.panel} ${styles.panelGrow}`}>
            <PlanPanel
              racks={racksState.racks}
              planWidth={planWidth}
              planHeight={planHeight}
              locationStates={pickList.locations}
              highlight={pickList.racks}
              focus={planFocus}
              loading={racksState.loading}
              canEdit={currentUser !== null}
              selection={selection}
              refreshToken={refreshToken}
              onMoveItem={(item, target, code) => void moveItem(item, target, code)}
              onEditItem={(item) => void editItem(item)}
              onDeleteItem={(item) => void deleteItem(item)}
            />
          </div>
        </section>
      </main>

      {settingsTab ? (
        <Modal
          title="Paramètres"
          width={1040}
          onClose={() => {
            setSettingsTab(null);
            racksState.clearError();
          }}
        >
          <div className={styles.tabs} role="tablist">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={settingsTab === tab.id}
                className={`${styles.tab} ${settingsTab === tab.id ? styles.tabActive : ''}`}
                onClick={() => setSettingsTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {settingsTab === 'users' ? (
            <UsersView currentUser={currentUser} onChanged={reloadUsers} />
          ) : settingsTab === 'plan' ? (
            <PlanEditor
              racks={racksState.racks}
              error={racksState.error}
              canEdit={currentUser !== null}
              planWidth={planWidth}
              planHeight={planHeight}
              onCreate={racksState.createRack}
              onUpdate={racksState.updateRack}
              onDelete={racksState.removeRack}
              onPlanShapeChange={changePlanShape}
            />
          ) : settingsTab === 'history' ? (
            <MovementsView />
          ) : settingsTab === 'data' ? (
            <DataView
              currentUser={currentUser}
              onDataReplaced={reloadEverything}
              onRelaunchInventory={() => {
                setSettingsTab(null);
                setInventoryOpen(true);
              }}
            />
          ) : (
            <AppearanceView
              theme={theme}
              onToggleTheme={toggleTheme}
              settings={settings}
              onSettingsChanged={setSettings}
            />
          )}
        </Modal>
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
