import { useEffect, useRef, useState } from 'react';
import { ArrowUpCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button, Modal } from '../components';
import { api, errorText } from '../lib/api';
import { cx } from '../lib/format';

export interface Release { version: string; date: string | null; sections: { title: string; items: string[] }[] }
export interface SystemInfo { version: string; mode: 'single' | 'multi'; canUpdate: boolean }
export interface UpdatesInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  updaterEnabled: boolean;
  releases: Release[];
  error: string | null;
}
interface UpdateStatus { state: 'idle' | 'pending' | 'running' | 'done' | 'failed'; from: string; to: string; current: string; log: string }

/** a es anterior a b (1.2.0 < 1.10.0) */
const isOlder = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0);
  return false;
};

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

/** Notas de una versión: secciones con viñetas */
export function ReleaseNotes({ release, highlight }: { release: Release; highlight?: boolean }) {
  return (
    <article className={cx('release', highlight && 'highlight')}>
      <header>
        <h3>SysPass {release.version}</h3>
        {release.date && <span>{fmtDate(release.date)}</span>}
      </header>
      {release.sections.length === 0 ? <p className="muted">Sin notas para esta versión</p> : release.sections.map((s) => (
        <section key={s.title}>
          <h4>{s.title}</h4>
          <ul>{s.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </section>
      ))}
    </article>
  );
}

type Phase = 'idle' | 'requesting' | 'pending' | 'running' | 'restarting' | 'done' | 'failed';

/**
 * Versión instalada, novedades y actualización.
 * whatsNew = se abre solo después de una actualización y muestra las notas de la versión nueva.
 */
export function UpdatesModal({ info, updates, whatsNew, onClose }: {
  info: SystemInfo;
  updates: UpdatesInfo | null;
  whatsNew?: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<Release[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [log, setLog] = useState('');
  const [error, setError] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const poll = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    api<{ releases: Release[] }>('/api/system/changelog').then((r) => setHistory(r.releases)).catch(() => {});
    return () => clearInterval(poll.current);
  }, []);

  const current = history.find((r) => r.version === info.version);
  const older = history.filter((r) => isOlder(r.version, info.version));
  const busy = ['requesting', 'pending', 'running', 'restarting'].includes(phase);

  function watch() {
    clearInterval(poll.current);
    poll.current = setInterval(async () => {
      try {
        const s = await api<UpdateStatus>('/api/system/update-status');
        setLog(s.log);
        if (s.state === 'pending') setPhase('pending');
        else if (s.state === 'running') setPhase('running');
        else if (s.state === 'failed') { setPhase('failed'); clearInterval(poll.current); }
        else if (s.state === 'done') {
          clearInterval(poll.current);
          setNewVersion(s.current);
          setPhase('done');
          // Recargar para usar la interfaz nueva (y ver sus novedades)
          setTimeout(() => window.location.reload(), 2500);
        }
      } catch {
        // Mientras el contenedor se reinicia la API no responde
        setPhase((p) => (p === 'running' || p === 'pending' || p === 'restarting' ? 'restarting' : p));
      }
    }, 3000);
  }

  async function update() {
    setError('');
    setPhase('requesting');
    try {
      await api('/api/system/update', { body: {} });
      setPhase('pending');
      watch();
    } catch (e) {
      setError(errorText(e));
      setPhase('idle');
    }
  }

  const title = whatsNew ? `Novedades de SysPass ${info.version}` : 'Versión y novedades';

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} wide>
      <div className="updates">
        {!whatsNew && (
          <div className="version-row">
            <div>
              <span className="muted">Versión instalada</span>
              <strong className="mono">{info.version}</strong>
            </div>
            {info.canUpdate && updates && (
              updates.updateAvailable
                ? <span className="update-pill"><ArrowUpCircle size={14} strokeWidth={1.75} />Disponible {updates.latest}</span>
                : updates.error ? <span className="muted small">{updates.error}</span>
                  : <span className="ok-pill"><CheckCircle2 size={14} strokeWidth={1.75} />Estás al día</span>
            )}
          </div>
        )}

        {/* Progreso de la actualización */}
        {phase !== 'idle' && phase !== 'requesting' && (
          <div className={cx('update-progress', phase)}>
            {phase === 'done' ? <CheckCircle2 size={18} strokeWidth={1.75} />
              : phase === 'failed' ? <XCircle size={18} strokeWidth={1.75} />
                : <Loader2 size={18} strokeWidth={1.75} className="spin" />}
            <div>
              <strong>
                {phase === 'pending' && 'Solicitud enviada, el servidor va a empezar…'}
                {phase === 'running' && 'Actualizando: respaldo, descarga y migraciones…'}
                {phase === 'restarting' && 'Reiniciando SysPass…'}
                {phase === 'done' && `Listo: SysPass ${newVersion}. Recargando…`}
                {phase === 'failed' && 'La actualización falló. SysPass sigue funcionando con la versión anterior'}
              </strong>
              {phase !== 'done' && <span className="muted small">No cierres esta ventana. Tarda uno o dos minutos</span>}
            </div>
          </div>
        )}
        {log && phase !== 'done' && <pre className="update-log">{log}</pre>}

        {/* Versiones nuevas */}
        {!whatsNew && info.canUpdate && updates?.updateAvailable && phase === 'idle' && (
          <>
            {updates.releases.map((r) => <ReleaseNotes key={r.version} release={r} highlight />)}
            {updates.updaterEnabled ? (
              <div className="update-actions">
                <span className="muted small">Se hace un respaldo de la base antes de actualizar. SysPass se reinicia unos segundos</span>
                <Button variant="primary" icon={RefreshCw} onClick={update}>Actualizar a {updates.latest}</Button>
              </div>
            ) : (
              <div className="callout">
                <strong>Para actualizar desde aquí, activa la opción una vez en el servidor</strong>
                <code className="cmd">sudo syspass ui-update enable</code>
                <span className="sec small">O actualiza directamente con <code>sudo syspass upgrade</code></span>
              </div>
            )}
          </>
        )}
        {error && <p className="form-error">{error}</p>}

        {/* Novedades de la versión instalada y anteriores */}
        {current && <ReleaseNotes release={current} highlight={whatsNew} />}
        {!whatsNew && older.length > 0 && (
          <details className="older">
            <summary>Versiones anteriores</summary>
            {older.map((r) => <ReleaseNotes key={r.version} release={r} />)}
          </details>
        )}

        {whatsNew && (
          <div className="modal-actions">
            <Button variant="primary" onClick={onClose}>Entendido</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
