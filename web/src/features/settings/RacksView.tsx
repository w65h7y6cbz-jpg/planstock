import { useEffect, useState } from 'react';
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
  /** Recharge le local après un changement de murs. */
  onSiteChanged: () => Promise<void>;
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
  onSiteChanged,
}: RacksViewProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [wallsMode, setWallsMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const current = racks.find((rack) => rack.id === selected) ?? null;

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
            à sa place. Tu peux aussi commencer par dessiner les murs.
          </p>
        ) : (
          <PlanView
            racks={racks}
            landmarks={landmarks}
            planWidth={site.plan_width}
            planHeight={site.plan_height}
            outline={site.outline}
            selectedRackId={selected}
            // Les meubles sont figés pendant qu'on redessine les murs : on ne
            // déplace pas une pièce et son contenu du même geste.
            editable={canEdit && !wallsMode}
            wallsEditable={canEdit && wallsMode}
            onOutlineChange={(corners) =>
              void guard(async () => {
                await api.sites.update(site.id, { outline: corners });
                await onSiteChanged();
              })
            }
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
            className={wallsMode ? shared.primary : shared.button}
            disabled={!canEdit || busy}
            onClick={() => setWallsMode((current) => !current)}
          >
            {wallsMode ? '✓ Murs — terminer' : '▱ Modifier les murs'}
          </button>
        </div>

        {wallsMode ? (
          <p className={shared.hint}>
            Fais glisser un <strong>coin</strong> pour déplacer un mur. Le{' '}
            <strong>+</strong> au milieu d’un pan ajoute un coin — c’est ainsi qu’on creuse un
            renfoncement ou qu’on coupe un angle. <strong>Double-clic</strong> sur un coin le
            retire. Les meubles ne bougent pas tant que ce mode est actif.
          </p>
        ) : null}

        {wallsMode && site.outline ? (
          <div className={shared.buttons}>
            <button
              type="button"
              className={shared.button}
              disabled={!canEdit || busy}
              onClick={() =>
                void guard(async () => {
                  await api.sites.update(site.id, { outline: '' });
                  await onSiteChanged();
                })
              }
            >
              Revenir à un rectangle
            </button>
          </div>
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
            onClick={() =>
              void guard(() =>
                onCreate({ shelves_count: 4, style: 'pegboard', label: 'Gondole' }),
              )
            }
          >
            + Gondole
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
            disabled={!canEdit || busy}
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
            disabled={!canEdit || busy}
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
  // Cotes et angle : la souris place vite, le clavier place juste. Les deux
  // écrivent au même endroit, et le plan se redessine à l'enregistrement.
  const [x, setX] = useState(String(rack.x));
  const [y, setY] = useState(String(rack.y));
  const [width, setWidth] = useState(String(rack.width));
  const [height, setHeight] = useState(String(rack.height));
  const [angle, setAngle] = useState(String(rack.angle ?? 0));
  const [style, setStyle] = useState(rack.style ?? '');

  // Le meuble bouge aussi à la souris sur le plan : les champs suivent, sinon
  // enregistrer les renverrait à leur position d'il y a dix secondes.
  useEffect(() => {
    setX(String(rack.x));
    setY(String(rack.y));
    setWidth(String(rack.width));
    setHeight(String(rack.height));
    setAngle(String(rack.angle ?? 0));
  }, [rack.x, rack.y, rack.width, rack.height, rack.angle]);

  /** Champ vide ou illisible : on garde la valeur actuelle plutôt que zéro. */
  const numberOr = (value: string, fallback: number) => {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          label,
          aisle,
          x: numberOr(x, rack.x),
          y: numberOr(y, rack.y),
          width: numberOr(width, rack.width),
          height: numberOr(height, rack.height),
          angle: numberOr(angle, rack.angle ?? 0),
          ...(rack.is_zone ? {} : { shelves_count: Number(shelves) || rack.shelves_count, style }),
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

      {rack.is_zone ? null : (
        <label className={shared.field}>
          Aspect
          <select value={style} onChange={(event) => setStyle(event.target.value)} disabled={disabled}>
            <option value="">Rayonnage à tablettes</option>
            <option value="pegboard">Gondole — panneau à broches, double face</option>
          </select>
        </label>
      )}

      <p className={styles.formTitle}>Cotes et orientation</p>
      <div className={shared.row}>
        <label className={shared.field}>
          Position X
          <input type="number" step="0.5" min={0} max={100} value={x}
            onChange={(event) => setX(event.target.value)} disabled={disabled} />
        </label>
        <label className={shared.field}>
          Position Y
          <input type="number" step="0.5" min={0} max={100} value={y}
            onChange={(event) => setY(event.target.value)} disabled={disabled} />
        </label>
      </div>
      <div className={shared.row}>
        <label className={shared.field}>
          Largeur
          <input type="number" step="0.5" min={3} max={100} value={width}
            onChange={(event) => setWidth(event.target.value)} disabled={disabled} />
        </label>
        <label className={shared.field}>
          Profondeur
          <input type="number" step="0.5" min={2} max={100} value={height}
            onChange={(event) => setHeight(event.target.value)} disabled={disabled} />
        </label>
      </div>
      <label className={shared.field}>
        Angle (degrés)
        <input type="number" step="5" value={angle}
          onChange={(event) => setAngle(event.target.value)} disabled={disabled} />
      </label>
      <div className={shared.buttons}>
        {[0, 45, 90, 135].map((preset) => (
          <button key={preset} type="button" className={shared.button} disabled={disabled}
            onClick={() => setAngle(String(preset))}>
            {preset}°
          </button>
        ))}
      </div>

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
