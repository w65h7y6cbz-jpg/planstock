import { useEffect, useState } from 'react';
import { ApiError, api, type AccessState } from '../api';
import { Logo } from '../components/Logo';
import styles from './AccessScreen.module.css';

/**
 * Porte d'entrée.
 *
 * PlanStock est ouvert aux connexions du magasin, reconnues à leur adresse IP.
 * Une adresse de PME change parfois sans prévenir : le code d'accès est là pour
 * ça, et il n'est demandé que dans ce cas. Une fois saisi, le navigateur s'en
 * souvient un mois.
 */

interface AccessScreenProps {
  state: AccessState;
  onOpened: () => void;
}

export function AccessScreen({ state, onOpened }: AccessScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.access.submit(code);
      onOpened();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Code refusé.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.screen}>
      <span className={styles.mark}>
        <Logo size={64} />
      </span>

      <h1 className={styles.title}>PlanStock est réservé au magasin</h1>
      <p className={styles.text}>
        Cette connexion ne fait pas partie des adresses autorisées.
        {state.can_use_code
          ? ' Saisis le code d’accès de l’atelier pour continuer.'
          : ' Demande à ce que ton adresse soit ajoutée aux réglages.'}
      </p>

      {state.can_use_code ? (
        <form className={styles.form} onSubmit={submit}>
          <input
            className={styles.input}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Code d’accès"
            aria-label="Code d’accès"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
          />
          <button type="submit" className={styles.button} disabled={busy || !code}>
            {busy ? 'Vérification…' : 'Entrer'}
          </button>
        </form>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}

      {state.your_ip ? (
        <p className={styles.ip}>
          Adresse de cette connexion :{' '}
          <button
            type="button"
            className={styles.ipValue}
            onClick={() => {
              void navigator.clipboard?.writeText(state.your_ip).then(() => setCopied(true));
            }}
            title="Copier"
          >
            {state.your_ip}
          </button>
          {copied ? <span className={styles.copied}>copiée</span> : null}
        </p>
      ) : null}
    </main>
  );
}
