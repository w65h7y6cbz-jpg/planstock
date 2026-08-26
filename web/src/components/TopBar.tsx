import type { Theme } from '../hooks/useTheme';
import type { User } from '../types';
import styles from './TopBar.module.css';

interface TopBarProps {
  roomName: string;
  users: User[];
  currentUser: User | null;
  onSelectUser: (id: number | null) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function TopBar({
  roomName,
  users,
  currentUser,
  onSelectUser,
  theme,
  onToggleTheme,
  onOpenSettings,
}: TopBarProps) {
  return (
    <header className={styles.bar}>
      <h1 className={styles.brand}>
        PlanStock
        <span className={styles.room}>{roomName}</span>
      </h1>

      <div className={styles.spacer} />

      <div className={styles.field}>
        <label className={styles.label} htmlFor="user-picker">
          Technicien
        </label>
        <select
          id="user-picker"
          className={`${styles.select} ${currentUser ? '' : styles.selectEmpty}`}
          value={currentUser?.id ?? ''}
          onChange={(event) =>
            onSelectUser(event.target.value === '' ? null : Number(event.target.value))
          }
        >
          <option value="">— Choisir un prénom —</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.first_name}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        className={styles.action}
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
      >
        <span className={styles.icon} aria-hidden="true">
          {theme === 'dark' ? '☀' : '☾'}
        </span>
      </button>

      <button type="button" className={styles.action} onClick={onOpenSettings}>
        <span className={styles.icon} aria-hidden="true">
          ⚙
        </span>
        Paramètres
      </button>
    </header>
  );
}
