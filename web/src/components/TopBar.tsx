import { useEffect, useRef, useState } from 'react';
import type { Site, User } from '../types';
import { Logo } from './Logo';
import styles from './TopBar.module.css';

/**
 * Barre du haut, présente sur tous les écrans sauf le choix du local.
 * À gauche : le logo et le nom du local, cliquables pour revenir à l'accueil.
 * À droite : le plan, l'historique, la liste en cours, le thème, le prénom et
 * un engrenage qui déroule les réglages.
 */

export type MenuAction =
  | 'racks'
  | 'stocks'
  | 'items'
  | 'users'
  | 'movements'
  | 'backups'
  | 'site'
  | 'switch-site';

const MENU: { action: MenuAction; label: string; hint: string }[] = [
  { action: 'racks', label: 'Rayonnages et zones', hint: 'Créer, déplacer, renommer' },
  { action: 'stocks', label: 'Stocks à part', hint: 'Ceux des clients à l’année' },
  { action: 'items', label: 'Articles', hint: 'Ajouter, corriger, ranger' },
  { action: 'users', label: 'Équipe', hint: 'Les prénoms de l’atelier' },
  { action: 'movements', label: 'Mouvements', hint: 'Qui a rangé quoi, quand' },
  { action: 'backups', label: 'Sauvegardes', hint: 'Copies et export du stock' },
  { action: 'site', label: 'Ce local', hint: 'Nom, couleur, logo, taille du plan' },
  { action: 'switch-site', label: 'Changer de local', hint: 'Revenir à l’écran de choix' },
];

interface TopBarProps {
  site: Site;
  users: User[];
  currentUser: User | null;
  theme: 'light' | 'dark';
  pickCount: number;
  pickPending: number;
  onHome: () => void;
  onOpenPlan: () => void;
  onOpenPickList: () => void;
  onSelectUser: (id: number | null) => void;
  onToggleTheme: () => void;
  onMenu: (action: MenuAction) => void;
}

export function TopBar({
  site,
  users,
  currentUser,
  theme,
  pickCount,
  pickPending,
  onHome,
  onOpenPlan,
  onOpenPickList,
  onSelectUser,
  onToggleTheme,
  onMenu,
}: TopBarProps) {
  const [openMenu, setOpenMenu] = useState<'settings' | 'user' | null>(null);
  const barRef = useRef<HTMLElement>(null);

  // Un clic hors de la barre, ou Échap, referme le menu ouvert.
  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenu]);

  return (
    <header className={styles.bar} ref={barRef}>
      <button type="button" className={styles.brand} onClick={onHome} title={site.name}>
        <Logo site={site} size={site.logo ? 32 : 34} title={site.logo ? site.name : undefined} />
        {site.logo ? null : <span className={styles.siteName}>{site.name}</span>}
      </button>

      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onOpenPlan}>
          <PlanIcon />
          Plan du local
          <kbd className={styles.kbd}>F2</kbd>
        </button>

        <button type="button" className={styles.action} onClick={() => onMenu('movements')}>
          <HistoryIcon />
          Historique
        </button>

        <button
          type="button"
          className={`${styles.action} ${pickPending > 0 ? styles.actionLive : ''}`}
          onClick={onOpenPickList}
          aria-label={`Liste de préparation, ${pickPending} article(s) à prélever`}
        >
          <ListIcon />
          Liste
          {pickCount > 0 ? (
            <span className={pickPending > 0 ? styles.badge : styles.badgeDone}>
              {pickPending > 0 ? pickPending : '✓'}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={styles.icon}
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>

        <div className={styles.holder}>
          <button
            type="button"
            className={styles.user}
            onClick={() => setOpenMenu((current) => (current === 'user' ? null : 'user'))}
            aria-expanded={openMenu === 'user'}
            aria-haspopup="menu"
          >
            <span className={styles.avatar} aria-hidden="true">
              {currentUser ? currentUser.first_name.slice(0, 1).toUpperCase() : '?'}
            </span>
            <span className={styles.userName}>{currentUser?.first_name ?? 'Qui es-tu ?'}</span>
          </button>

          {openMenu === 'user' ? (
            <div className={styles.menu} role="menu">
              <p className={styles.menuTitle}>Qui range ?</p>
              {users.length === 0 ? (
                <p className={styles.menuEmpty}>Aucun prénom enregistré.</p>
              ) : (
                users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    role="menuitem"
                    className={`${styles.menuItem} ${
                      currentUser?.id === user.id ? styles.menuItemActive : ''
                    }`}
                    onClick={() => {
                      onSelectUser(user.id);
                      setOpenMenu(null);
                    }}
                  >
                    <span className={styles.avatarSmall} aria-hidden="true">
                      {user.first_name.slice(0, 1).toUpperCase()}
                    </span>
                    {user.first_name}
                  </button>
                ))
              )}
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  setOpenMenu(null);
                  onMenu('users');
                }}
              >
                <span className={styles.avatarSmall} aria-hidden="true">
                  +
                </span>
                Gérer l’équipe
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.holder}>
          <button
            type="button"
            className={styles.icon}
            onClick={() => setOpenMenu((current) => (current === 'settings' ? null : 'settings'))}
            aria-expanded={openMenu === 'settings'}
            aria-haspopup="menu"
            aria-label="Réglages"
            title="Réglages"
          >
            <GearIcon />
          </button>

          {openMenu === 'settings' ? (
            <div className={styles.menu} role="menu">
              {MENU.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    setOpenMenu(null);
                    onMenu(entry.action);
                  }}
                >
                  <span className={styles.menuLabel}>
                    {entry.label}
                    <span className={styles.menuHint}>{entry.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/* Pictogrammes dessinés : aucune police d'icônes à télécharger. */

function PlanIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true" fill="currentColor">
      <rect x="1.5" y="3" width="7" height="5" rx="1.4" />
      <rect x="11.5" y="3" width="7" height="9" rx="1.4" opacity="0.55" />
      <rect x="1.5" y="11" width="7" height="6" rx="1.4" opacity="0.55" />
      <rect x="11.5" y="15" width="7" height="2" rx="1" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true" fill="none">
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 5.6V10l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true" fill="none">
      <path
        d="M3 5.5l1.8 1.8L8 4M3 13.5l1.8 1.8L8 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 6h6M11 14h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M8.6 1.8h2.8l.4 2a6.5 6.5 0 0 1 1.5.9l1.9-.8 1.4 2.4-1.5 1.3a6.6 6.6 0 0 1 0 1.8l1.5 1.3-1.4 2.4-1.9-.8c-.46.37-.97.68-1.5.9l-.4 2H8.6l-.4-2a6.5 6.5 0 0 1-1.5-.9l-1.9.8-1.4-2.4 1.5-1.3a6.6 6.6 0 0 1 0-1.8L3.4 6.3l1.4-2.4 1.9.8c.46-.37.97-.68 1.5-.9l.4-2Z" />
      <circle cx="10" cy="10" r="2.6" fill="var(--surface)" />
    </svg>
  );
}
