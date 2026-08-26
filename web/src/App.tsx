import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, type ItemPayload } from './api';
import { Modal } from './components/Modal';
import { PickList } from './components/PickList';
import { PlanPanel, type PlanFocus } from './components/PlanPanel';
import type { SlotSelection } from './components/RackView';
import { SearchBox } from './components/SearchBox';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { InventoryMode } from './features/inventory/InventoryMode';
import { ItemForm } from './features/items/ItemForm';
import { MovementsView } from './features/settings/MovementsView';
import { PlanEditor } from './features/settings/PlanEditor';
import { useCurrentUser } from './hooks/useCurrentUser';
import { usePickList } from './hooks/usePickList';
import { useRacks } from './hooks/useRacks';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import type { Item, Location, Settings, SlotContent, SlotItem } from './types';
import styles from './App.module.css';

type FormState =
  | { mode: 'create'; presetReference: string }
  | { mode: 'edit'; item: Item }
  | null;

type SettingsTab = 'plan' | 'history' | 'data';

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function App() {
  const { theme, toggleTheme } = useTheme();
  const { users, currentUser, loading: usersLoading, error: usersError, selectUser } = useCurrentUser();
  const racksState = useRacks();
  const pickList = usePickList();
  const { toasts, notify, dismiss } = useToasts();

  const [settings, setSettings] = useState<Settings>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [planFocus, setPlanFocus] = useState<PlanFocus | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [slotPicking, setSlotPicking] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<SlotContent | null>(null);
  const [pendingMove, setPendingMove] = useState<{ item: SlotItem; rackId: number } | null>(null);
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

  const focusOnPlan = useCallback((rackId: number, slotId: number | null, force: boolean) => {
    focusNonce.current += 1;
    setPlanFocus({ rackId, slotId, force, nonce: focusNonce.current });
  }, []);

  const focusOnLocation = useCallback(
    (location: Location, force: boolean) => focusOnPlan(location.rack_id, location.slot_id, force),
    [focusOnPlan],
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

  /** Une référence trouvée rejoint la liste et allume son emplacement. */
  const pickItem = useCallback(
    (item: Item) => {
      pickList.add(item);
      const location = item.locations[0];
      if (item.kind === 'physical' && location) focusOnLocation(location, false);
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
    setSlotPicking(false);
    setPickedSlot(null);
    searchRef.current?.focus();
  }

  /** Déplacement effectif d'un article, avec possibilité d'annuler. */
  const moveItem = useCallback(
    async (item: SlotItem, slot: SlotContent) => {
      if (!requireUser() || !currentUser) return;
      try {
        const before = await api.items.get(item.id);
        const from = before.locations[0] ?? null;
        if (from?.slot_id === slot.id) return;

        await api.items.move(currentUser.id, item.id, slot.id);
        await refreshAfterMutation(item.id);

        notify({
          tone: 'success',
          message: `${item.reference_display} : ${from?.code ?? '—'} → ${slot.code}`,
          action: from
            ? {
                label: 'Annuler',
                run: () => {
                  void (async () => {
                    try {
                      await api.items.move(currentUser.id, item.id, from.slot_id);
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
    async (item: SlotItem) => {
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

  const editItem = useCallback(async (item: SlotItem) => {
    try {
      setForm({ mode: 'edit', item: await api.items.get(item.id) });
      setFormError(null);
    } catch (cause) {
      setFormError(messageOf(cause, 'Article introuvable.'));
    }
  }, []);

  /** Pastille lâchée sur un autre rayonnage : il s'ouvre pour choisir la case. */
  const dropOnRack = useCallback(
    (item: SlotItem, rackId: number) => {
      if (!requireUser()) return;
      setPendingMove({ item, rackId });
      focusOnPlan(rackId, null, true);
    },
    [requireUser, focusOnPlan],
  );

  // Une seule mécanique de choix de case : déplacement en cours, ou formulaire ouvert.
  const selection: SlotSelection | null = pendingMove
    ? {
        label: `Choisissez la case de destination pour ${pendingMove.item.reference_display}.`,
        onSelect: (slot) => {
          const move = pendingMove;
          setPendingMove(null);
          void moveItem(move.item, slot);
        },
        onCancel: () => setPendingMove(null),
      }
    : slotPicking && form
      ? {
          label: 'Cliquez la case où ranger cet article.',
          onSelect: (slot) => setPickedSlot(slot),
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
                pickedSlot={pickedSlot}
                onSlotPickingChange={setSlotPicking}
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
                    setPickedSlot(null);
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
              slotStates={pickList.slots}
              highlight={pickList.racks}
              focus={planFocus}
              loading={racksState.loading}
              canEdit={currentUser !== null}
              selection={selection}
              refreshToken={refreshToken}
              onMoveItem={(item, slot) => void moveItem(item, slot)}
              onDropOnRack={dropOnRack}
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
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === 'plan'}
              className={`${styles.tab} ${settingsTab === 'plan' ? styles.tabActive : ''}`}
              onClick={() => setSettingsTab('plan')}
            >
              Plan
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === 'history'}
              className={`${styles.tab} ${settingsTab === 'history' ? styles.tabActive : ''}`}
              onClick={() => setSettingsTab('history')}
            >
              Historique
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === 'data'}
              className={`${styles.tab} ${settingsTab === 'data' ? styles.tabActive : ''}`}
              onClick={() => setSettingsTab('data')}
            >
              Données
            </button>
          </div>

          {settingsTab === 'plan' ? (
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
          ) : settingsTab === 'history' ? (
            <MovementsView />
          ) : (
            <div className={styles.dataTab}>
              <h3 className={styles.panelTitle}>Inventaire initial</h3>
              <p className={styles.dataHint}>
                Mode guidé pour saisir le stock : référence, désignation, puis clic sur la case du
                plan. Il démarre tout seul quand la base est vide.
              </p>
              <button
                type="button"
                className={styles.dataButton}
                onClick={() => {
                  setSettingsTab(null);
                  setInventoryOpen(true);
                }}
              >
                Relancer l’inventaire initial
              </button>
              <p className={styles.dataHint}>
                Export Excel/CSV, sauvegardes et restauration : étape 8.
              </p>
            </div>
          )}
        </Modal>
      ) : null}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
