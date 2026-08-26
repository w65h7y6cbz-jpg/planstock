import { useState } from 'react';
import { ApiError, api } from '../../api';
import { Logo } from '../../components/Logo';
import type { Site } from '../../types';
import styles from './SiteView.module.css';
import shared from './settings.module.css';

/**
 * Réglages du local : son nom, sa couleur, son logo et la taille de son plan.
 * La couleur choisie ici devient celle de toute l'application quand ce local
 * est sélectionné.
 */

/** Les deux premières sont relevées au cœur des lettres des logos fournis. */
const SUGGESTED = [
  { label: 'Indigo Optimium', value: '#38388c' },
  { label: 'Rouge Sharp', value: '#e42020' },
  { label: 'Bleu', value: '#0057a8' },
  { label: 'Vert', value: '#12703a' },
  { label: 'Ardoise', value: '#3d4757' },
];

interface SiteViewProps {
  site: Site;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSaved: () => Promise<void>;
}

const messageOf = (cause: unknown, fallback: string) =>
  cause instanceof ApiError || cause instanceof Error ? cause.message : fallback;

export function SiteView({ site, theme, onToggleTheme, onSaved }: SiteViewProps) {
  const [name, setName] = useState(site.name);
  const [accent, setAccent] = useState(site.accent);
  const [logo, setLogo] = useState(site.logo);
  const [planWidth, setPlanWidth] = useState(String(site.plan_width));
  const [planHeight, setPlanHeight] = useState(String(site.plan_height));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.sites.update(site.id, {
        name,
        accent,
        logo,
        plan_width: Number(planWidth) || site.plan_width,
        plan_height: Number(planHeight) || site.plan_height,
      });
      await onSaved();
      setSaved(true);
    } catch (cause) {
      setError(messageOf(cause, 'Enregistrement impossible.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.layout} onSubmit={save}>
      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Identité du local</h2>

        <div className={styles.preview}>
          <span className={styles.previewMark} style={{ background: `${accent}1f` }}>
            <Logo site={{ ...site, accent, logo }} size={64} />
          </span>
          <span className={styles.previewName} style={{ color: accent }}>
            {name || 'Sans nom'}
          </span>
        </div>

        <label className={shared.field}>
          Nom
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label className={shared.field}>
          Couleur
          <span className={styles.colorRow}>
            <input
              type="color"
              className={styles.colorInput}
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              aria-label="Choisir la couleur du local"
            />
            <input
              className={styles.hexInput}
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
              spellCheck={false}
            />
          </span>
        </label>

        <div className={styles.swatches}>
          {SUGGESTED.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.swatch}
              style={{ background: option.value }}
              onClick={() => setAccent(option.value)}
              aria-label={option.label}
              title={option.label}
            />
          ))}
        </div>

        <label className={shared.field}>
          Logo
          <input
            value={logo}
            onChange={(event) => setLogo(event.target.value)}
            placeholder="optimium.png"
            spellCheck={false}
          />
        </label>
        <p className={shared.hint}>
          Dépose le fichier image dans <code>web/public/logos/</code> puis écris son nom ici. Laisse
          vide pour garder le pictogramme dessiné.
        </p>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Taille du plan</h2>
        <p className={shared.hint}>
          Les proportions du local. Réduire est refusé tant qu’un emplacement dépasserait du cadre.
        </p>

        <div className={shared.row}>
          <label className={shared.field}>
            Largeur
            <input
              type="number"
              min={10}
              max={100}
              value={planWidth}
              onChange={(event) => setPlanWidth(event.target.value)}
            />
          </label>
          <label className={shared.field}>
            Profondeur
            <input
              type="number"
              min={10}
              max={100}
              value={planHeight}
              onChange={(event) => setPlanHeight(event.target.value)}
            />
          </label>
        </div>
      </section>

      <section className={shared.section}>
        <h2 className={shared.sectionTitle}>Apparence</h2>
        <p className={shared.hint}>
          Le thème clair est celui sur lequel les contrastes ont été réglés ; le sombre reste
          disponible.
        </p>
        <button type="button" className={shared.button} onClick={onToggleTheme}>
          {theme === 'dark' ? '☀ Passer en clair' : '☾ Passer en sombre'}
        </button>
      </section>

      {error ? <p className={shared.error}>{error}</p> : null}
      {saved ? <p className={shared.success}>Réglages enregistrés.</p> : null}

      <div className={shared.buttons}>
        <button type="submit" className={shared.primary} disabled={busy}>
          Enregistrer
        </button>
      </div>
    </form>
  );
}
