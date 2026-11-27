import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Confirm, Field, FieldRow, FormError, Input, Modal, PasswordInput, Tabs, useToast } from '../components';
import { useAction } from '../hooks';
import { api, errorText } from '../lib/api';
import { cx, fmtDateTime } from '../lib/format';
import { can, type Account, type HistoryEvent, type Resource, type User } from '../lib/types';

/** Editar una sola cuenta y, para quien tiene permiso, ver su línea de tiempo. */
export function AccountModal({ account: a, resource, user, onClose, onSaved }: {
  account: Account;
  resource: Resource;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const canEdit = can(user, 'resources.edit');
  const canHistory = can(user, 'history.view');
  const [tab, setTab] = useState<'edit' | 'history'>(canEdit ? 'edit' : 'history');
  const title = `${resource.name} · ${a.username || a.role || 'Cuenta'}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      {canEdit && canHistory && (
        <Tabs label="Cuenta" value={tab} onChange={(v) => setTab(v as 'edit' | 'history')}
          options={[{ value: 'edit', label: 'Editar' }, { value: 'history', label: 'Historial' }]} />
      )}
      {tab === 'edit' && canEdit
        ? <EditAccount account={a} user={user} onClose={onClose} onSaved={onSaved} />
        : <Timeline accountId={a.id} />}
    </Modal>
  );
}

function EditAccount({ account: a, user, onClose, onSaved }: { account: Account; user: User; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const [role, setRole] = useState(a.role);
  const [username, setUsername] = useState(a.username);
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState(a.notes);
  const [confirm, setConfirm] = useState(false);

  function save(e: FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api<{ changed: boolean }>(`/api/accounts/${a.id}`, {
        method: 'PUT',
        body: { role, username, notes, ...(password ? { password } : {}) },
      });
      toast(r.changed ? 'Cuenta actualizada' : 'Sin cambios');
      onSaved();
    });
  }

  function remove() {
    setConfirm(false);
    run(async () => {
      await api(`/api/accounts/${a.id}`, { method: 'DELETE' });
      toast('Cuenta eliminada');
      onSaved();
    });
  }

  return (
    <form className="stack" onSubmit={save}>
      <FieldRow>
        <Field label="Rol">
          <Input list="role-suggestions" maxLength={60} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Administrador" />
        </Field>
        <Field label="Usuario o correo">
          <Input maxLength={200} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
      </FieldRow>
      <Field label={a.hasPassword ? 'Nueva contraseña' : 'Contraseña'}>
        <PasswordInput generator showMeter autoComplete="new-password" maxLength={500}
          placeholder={a.hasPassword ? 'Vacía = conservar la actual' : ''} value={password} onChange={setPassword} />
      </Field>
      <Field label="Nota">
        <Input maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
      </Field>
      <FormError>{error}</FormError>
      <div className="modal-actions">
        {can(user, 'resources.delete') && <Button variant="danger" icon={Trash2} className="push-left" onClick={() => setConfirm(true)}>Eliminar</Button>}
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" variant="primary" loading={busy} loadingText="Guardando…">Guardar</Button>
      </div>
      {confirm && (
        <Confirm title="Eliminar cuenta" action="Eliminar"
          text={<>Se eliminará la cuenta <strong>{a.username || a.role || 'sin usuario'}</strong>. Su historial se conserva.</>}
          onCancel={() => setConfirm(false)} onConfirm={remove} />
      )}
    </form>
  );
}

const KIND: Record<string, string> = {
  created: 'create', password: 'password', username: 'change', role: 'change', notes: 'change', deleted: 'delete',
  'password.view': 'view', 'password.copy': 'view',
};

/** Línea de tiempo vertical: quién creó, modificó, vio o copió la cuenta */
function Timeline({ accountId }: { accountId: string }) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState('');
  const [showViews, setShowViews] = useState(true);

  useEffect(() => {
    api<HistoryEvent[]>(`/api/accounts/${accountId}/history`).then(setEvents).catch((e) => setError(errorText(e)));
  }, [accountId]);

  if (error) return <p className="form-error">{error}</p>;
  if (!events) return <p className="muted">Cargando historial…</p>;
  const list = events.filter((e) => showViews || KIND[e.action] !== 'view');

  return (
    <div className="stack">
      <label className="check small-check">
        <input type="checkbox" checked={showViews} onChange={(e) => setShowViews(e.target.checked)} />
        <span>Mostrar también quién vio o copió la contraseña</span>
      </label>
      {list.length === 0 ? <p className="muted">Sin registros</p> : (
        <ol className="timeline">
          {list.map((e, i) => (
            <li key={i} className={cx('tl-item', KIND[e.action] ?? 'change')}>
              <span className="tl-dot" aria-hidden />
              <div className="tl-body">
                <p>
                  {e.who ? <><strong>{e.who}</strong> {e.text}</> : e.action === 'created' ? 'Cuenta creada' : <><span className="muted">Alguien</span> {e.text}</>}
                  {e.action === 'created' && e.detail && e.detail !== 'Registrada antes del historial' && <> {e.detail}</>}
                </p>
                {e.detail && e.action !== 'created' && <span className="tl-detail mono">{e.detail}</span>}
                {e.action === 'created' && e.detail === 'Registrada antes del historial' && <span className="tl-detail">Registrada antes de que existiera el historial</span>}
                <time className="tl-time">{fmtDateTime(e.at)}{e.ip ? ` · ${e.ip}` : ''}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
