import { useState } from 'react';
import { api, type RackPayload } from '../../api';
import { PlanView } from '../../components/PlanView';
import { aisleColor } from '../../lib/labels';
import type { Landmark, Rack, Site } from '../../types';
import styles from './RacksView.module.css';
import shared from './settings.module.css';

/**
 * Dessin du local : on pose les rayonnages, les zones et les repères, puis on
 * les fait glisser à leur place sur le plan. La poignée du coin change la
 * taille. Rien n'est saisi en coordonnées.
 */

interface RacksViewProps {
  site: Site;
  racks: Rack[];
  landmarks: Landmark[];
  error: string | null;
  canEdit: boolean;
  onCreate: (payload: RackPayload) => Promise<void>;
  onUpdate: (id: number, payload: RackPayload) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLandmarksChanged: () => Promise<void>;
}

export function RacksView({
  site,
  racks,
  landmarks,
  error,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
  onLandmarksChanged,
}: RacksViewProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const current = racks.find((rack) => rack.id === selected) ?? null;
  const hasDoor = landmarks.some((landmark) => landmark.kind === 'door');
  const hasBench = landmarks.some((landmark) => landmark.kind === 'bench');

  async function guard(run: () => Promise<void>) {
    setBusy(true);
    setLocalError(null);
    try {
      await run();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.layout}>
      <div className={styles.planPane}>
        {racks.length === 0 && landmarks.length === 0 ? (
          <p className={styles.empty}>
            Le local est vide. Ajoute un premier rayonnage : il apparaîtra ici, tu le feras glisser
            à sa place.
          </p>
        ) : (
          <PlanView
            racks={racks}
            landmarks={landmarks}
            planWidth={site.plan_width}
            planHeight={site.plan_height}
            selectedRackId={selected}
            editable={canEdit}
            onSelectRack={(rack) => setSelected(rack.id)}
            onGeometryChange={(rack, box) => void guard(() => onUpdate(rack.id, box))}
            onLandmarkChange={(landmark, box) =>
              void guard(async () => {
                await api.landmarks.update(landmark.id, box);
                await onLandmarksChanged();
              })
            }
          />
        )}
      </div>

      <div className={styles.side}>
        {error || localError ? <p className={shared.error}>{error ?? localError}</p> : null}
        {!canEdit ? (
          <p className={shared.warning}>
            Choisis ton prénom en haut à droite pour modifier le plan.
          </p>
        ) : null}

        <div className={styles.addRow}>
          <button
            type="button"
            className={shared.primary}
            disabled={!canEdit || busy}
            onClick={() => void guard(() => onCreate({ shelves_count: 5 }))}
          >
            + Rayonnage
          </button>
          <button
            type="button"
            className={shared.button}
            disabled={!canEdit || busy}
            onClick={() => void guard(() => onCreate({ kind: 'zone', label: 'Zone' }))}
          >
            + Zone
          </button>
          <button
            type="button"
            className={shared.button}
            disabled={!canEdit || busy || hasDoor}
            onClick={() =>
              void guard(async () => {
                await api.landmarks.create({ site_id: site.id, kind: 'door' });
                await onLandmarksChanged();
              })
            }
          >
            + Porte
          </button>
          <button
            type="button"
            className={shared.button}
            disabled={!canEdit || busy || hasBench}
            onClick={() =>
              void guard(async () => {
                await api.landmarks.create({ site_id: site.id, kind: 'bench' });
                await onLandmarksChanged();
              })
            }
          >
            + Établi
          </button>
        </div>

        {current ? (
          <RackForm
            key={current.id}
            rack={current}
            disabled={!canEdit || busy}
            onSave={(payload) => void guard(() => onUpdate(current.id, payload))}
            onDelete={() =>
              void guard(async () => {
                await onDelete(current.id);
                setSelected(null);
              })
            }
          />
        ) : (
          <p className={shared.hint}>
            Clique un rayonnage sur le plan pour le renommer, changer son allée ou son nombre
            d’étagères.
          </p>
        )}

        <ul className={styles.list}>
          {racks.map((rack) => (
            <li key={rack.id}>
              <button
                type="button"
                className={`${styles.listItem} ${selected === rack.id ? styles.listItemOn : ''}`}
                onClick={() => setSelected(rack.id)}
              >
                <span className={styles.listCode}>{rack.rack_code}</span>
                <span className={styles.listLabel}>{rack.label || 'Sans nom'}</span>
                {rack.aisle ? (
                  <span className={styles.listAisle} style={{ color: aisleColor(rack.aisle) }}>
                    {rack.aisle}
                  </span>
                ) : null}
                <span className={styles.listMeta}>
                  {rack.is_zone ? 'zone' : `${rack.shelves_count} ét.`} · {rack.items_count} art.
                </span>
              </button>
            </li>
          ))}
        </ul>

        {landmarks.length > 0 ? (
          <ul className={styles.list}>
            {landmarks.map((landmark) => (
              <li key={landmark.id} className={styles.landmarkRow}>
                <span className={styles.listLabel}>
                  {landmark.kind === 'door' ? '🚪' : '🛠'} {landmark.label}
                </span>
                <button
                  type="button"
                  className={shared.danger}
                  disabled={!canEdit || busy}
                  onClick={() =>
                    void guard(async () => {
                      await api.landmarks.remove(landmark.id);
                      await onLandmarksChanged();
                    })
                  }
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function RackForm({
  rack,
  disabled,
  onSave,
  onDelete,
}: {
  rack: Rack;
  disabled: boolean;
  onSave: (payload: RackPayload) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(rack.label);
  const [aisle, setAisle] = useState(rack.aisle);
  const [shelves, setShelves] = useState(String(rack.shelves_count));

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          label,
          aisle,
          ...(rack.is_zone ? {} : { shelves_count: Number(shelves) || rack.shelves_count }),
        });
      }}
    >
      <p className={styles.formTitle}>
        <span className={styles.listCode}>{rack.rack_code}</span>
        {rack.is_zone ? 'Zone' : 'Rayonnage'}
      </p>

      <label className={shared.field}>
        Nom
        <input value={label} onChange={(event) => setLabel(event.target.value)} disabled={disabled} />
      </label>

      <label className={shared.field}>
        Allée
        <input
          value={aisle}
          onChange={(event) => setAisle(event.target.value)}
          placeholder="Allée A"
          disabled={disabled}
        />
      </label>

      {rack.is_zone ? null : (
        <label className={shared.field}>
          Nombre d’étagères
          <input
            type="number"
            min={1}
            max={30}
            value={shelves}
            onChange={(event) => setShelves(event.target.value)}
            disabled={disabled}
          />
        </label>
      )}

      <div className={shared.buttons}>
        <button type="submit" className={shared.primary} disabled={disabled}>
          Enregistrer
        </button>
        <button type="button" className={shared.danger} disabled={disabled} onClick={onDelete}>
          Supprimer
        </button>
      </div>
    </form>
  );
}
