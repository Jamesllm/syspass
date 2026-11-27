import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { Button, Field, FieldRow, FormError, Input, Modal, PasswordInput, Tabs, TextArea, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { plural } from '../lib/format';
import type { Resource } from '../lib/types';
import { parseAccountList } from './ResourceSheet';

/** Agregar cuentas directo a un recurso: una sola o varias en lista (usuario;contraseña) */
export function AddAccountsModal({ resource, onClose, onSaved }: { resource: Resource; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { run, busy, error, setError } = useAction();
  const [mode, setMode] = useState<'one' | 'list'>('one');
  const [role, setRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState('');
  const [listText, setListText] = useState('');
  const parsed = parseAccountList(listText);

  function save(e: FormEvent) {
    e.preventDefault();
    const accounts = mode === 'list'
      ? parsed.map(({ role: r, username: u, password: p, notes: n }) => ({ role: r, username: u, password: p, notes: n }))
      : [{ role, username, password, notes }];
    if (mode === 'one' && !username && !password) return setError('Escribe al menos el usuario o la contraseña');
    if (mode === 'list' && !parsed.length) return setError('Escribe al menos una línea usuario;contraseña');
    run(async () => {
      const r = await api<{ created: number }>(`/api/resources/${resource.id}/accounts`, { body: { accounts } });
      toast(r.created === 1 ? 'Cuenta agregada' : `${r.created} cuentas agregadas`);
      onSaved();
    });
  }

  return (
    <Modal title={`Agregar a ${resource.name}`} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <Tabs label="Cómo agregar" value={mode} onChange={(v) => { setMode(v as 'one' | 'list'); setError(''); }}
          options={[{ value: 'one', label: 'Una cuenta' }, { value: 'list', label: 'En lista' }]} />

        {mode === 'one' ? (
          <>
            <FieldRow>
              <Field label="Rol">
                <Input list="role-suggestions" maxLength={60} placeholder="Administrador" value={role} onChange={(e) => setRole(e.target.value)} />
              </Field>
              <Field label="Usuario o correo">
                <Input maxLength={200} autoFocus autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
            </FieldRow>
            <Field label="Contraseña">
              <PasswordInput generator showMeter autoComplete="new-password" maxLength={500} value={password} onChange={setPassword} />
            </Field>
            <Field label="Nota">
              <Input maxLength={1000} placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </>
        ) : (
          <Field label="Una cuenta por línea" hint={<>Formato <code>usuario;contraseña</code>. Opcional: <code>;rol;nota</code>. También puedes pegar dos columnas desde Excel</>}>
            <TextArea rows={8} className="mono" spellCheck={false} autoCapitalize="off" autoFocus
              placeholder={'tc-admin;Cl4ve$egura2026\ntc-guest;OtraClave#77;Invitado'}
              value={listText} onChange={(e) => setListText(e.target.value)} />
          </Field>
        )}

        <FormError>{error}</FormError>
        <div className="modal-actions">
          {mode === 'list' && <span className="sec small push-left">{parsed.length ? `${plural(parsed.length, 'cuenta lista', 'cuentas listas')}` : ''}</span>}
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" icon={Plus} loading={busy} loadingText="Guardando…">
            {mode === 'list' && parsed.length > 1 ? `Agregar ${parsed.length} cuentas` : 'Agregar cuenta'}
          </Button>
        </div>
        <datalist id="role-suggestions">
          {['Administrador', 'Soporte', 'Root', 'Usuario', 'Invitado', 'Gerencia', 'Sistemas'].map((r) => <option key={r} value={r} />)}
        </datalist>
      </form>
    </Modal>
  );
}
