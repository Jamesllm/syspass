import { useState, type FormEvent } from 'react';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import {
  Button, Confirm, Field, FieldRow, FormError, IconButton, Input, PasswordInput, Select, Sheet, Tabs, TextArea, useToast,
} from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { newId, plural } from '../lib/format';
import { can, type Client, type Group, type Resource, type User } from '../lib/types';

interface AccDraft {
  key: string;
  id?: string;
  role: string;
  username: string;
  password: string;
  hasPassword: boolean;
  notes: string;
}

const ROLE_SUGGESTIONS = ['Administrador', 'Soporte', 'Root', 'Usuario', 'Invitado', 'Gerencia', 'Sistemas'];
const blankAcc = (): AccDraft => ({ key: newId(), role: '', username: '', password: '', hasPassword: false, notes: '' });

/**
 * Lista "usuario;contraseña" (una cuenta por línea). Opcional: ";rol;nota".
 * También acepta tabuladores, para pegar columnas desde Excel.
 */
export function parseAccountList(text: string): AccDraft[] {
  return text.split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [username = '', password = '', role = '', notes = ''] = line.split(/\t|;/).map((s) => s.trim());
      return { ...blankAcc(), username, password, role, notes };
    })
    .filter((a) => a.username || a.password);
}

export function ResourceSheet({ resource, clients, groups, defaultClientId, defaultGroupId, user, onClose, onSaved }: {
  resource: Resource | null;
  clients: Client[];
  groups: Group[];
  defaultClientId: string | null;
  defaultGroupId?: string;
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const { run, busy, error } = useAction();
  const canDelete = can(user, 'resources.delete');
  const [groupId, setGroupId] = useState(resource?.groupId ?? defaultGroupId ?? '');
  const [clientId, setClientId] = useState(resource?.clientId ?? defaultClientId ?? clients[0]?.id ?? '');
  const [name, setName] = useState(resource?.name ?? '');
  const [host, setHost] = useState(resource?.host ?? '');
  const [notes, setNotes] = useState(resource?.notes ?? '');
  const [accounts, setAccounts] = useState<AccDraft[]>(
    resource?.accounts.length
      ? resource.accounts.map((a) => ({ key: a.id, id: a.id, role: a.role, username: a.username, password: '', hasPassword: a.hasPassword, notes: a.notes }))
      : [blankAcc()],
  );
  const [mode, setMode] = useState<'one' | 'list'>('one');
  const [listText, setListText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parsed = parseAccountList(listText);
  const update = (key: string, patch: Partial<AccDraft>) => setAccounts((l) => l.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  function addFromList() {
    if (!parsed.length) return;
    // Reemplaza la primera fila si está vacía
    setAccounts((l) => [...l.filter((a) => a.id || a.username || a.password || a.role || a.notes), ...parsed]);
    toast(`${plural(parsed.length, 'cuenta agregada', 'cuentas agregadas')} a la lista`);
    setListText('');
    setMode('one');
  }

  function save(e: FormEvent) {
    e.preventDefault();
    if (mode === 'list' && parsed.length) {
      toast('Primero presiona «Agregar a la lista» o borra el texto', 'err');
      return;
    }
    const body = {
      clientId, groupId, name, host, notes,
      accounts: accounts.map((a) => ({
        id: a.id, role: a.role, username: a.username, notes: a.notes,
        // vacío en una cuenta existente = conservar la contraseña guardada
        ...(a.password || !a.id ? { password: a.password } : {}),
      })),
    };
    run(async () => {
      if (resource) await api(`/api/resources/${resource.id}`, { method: 'PUT', body });
      else await api('/api/resources', { body });
      toast(resource ? 'Cambios guardados' : 'Recurso creado');
      onSaved();
    });
  }

  function remove() {
    setConfirmDelete(false);
    run(async () => {
      await api(`/api/resources/${resource!.id}`, { method: 'DELETE' });
      toast('Recurso eliminado');
      onSaved();
    });
  }

  const groupOptions = [
    ...(groupId ? [] : [{ value: '', label: 'Elige un grupo…' }]),
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  return (
    <Sheet
      title={resource ? 'Editar recurso' : 'Nuevo recurso'}
      onClose={onClose}
      footer={
        <>
          {resource && canDelete && <IconButton icon={Trash2} label="Eliminar recurso" className="danger" onClick={() => setConfirmDelete(true)} />}
          <span className="grow" />
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="resource-form" variant="primary" loading={busy} loadingText="Guardando…" disabled={!groupId}>Guardar</Button>
        </>
      }
    >
      <form id="resource-form" className="sheet-body" onSubmit={save}>
        <FieldRow>
          <Field label="Grupo">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} required autoFocus={!resource && !groupId} options={groupOptions} />
          </Field>
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required options={clients.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
        </FieldRow>

        {!groupId ? (
          <p className="sec hint-box">Elige el grupo (VPN, NAS, AnyDesk…) para agregar el recurso y sus cuentas</p>
        ) : (
          <>
            <FieldRow>
              <Field label="Nombre">
                <Input required maxLength={120} placeholder="NAS principal" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!resource} />
              </Field>
              <Field label="IP, URL o ID">
                <Input mono maxLength={255} placeholder="192.168.10.197" inputMode="url" autoCapitalize="off" autoCorrect="off"
                  value={host} onChange={(e) => setHost(e.target.value)} />
              </Field>
            </FieldRow>
            <Field label="Notas">
              <TextArea rows={2} maxLength={4000} placeholder="Ubicación, puerto, a quién llamar…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <div className="section-title">
              <h3>Cuentas <span className="muted small">{accounts.filter((a) => a.id || a.username || a.password).length || ''}</span></h3>
              <Tabs
                label="Cómo agregar cuentas"
                value={mode}
                onChange={(v) => setMode(v as 'one' | 'list')}
                options={[{ value: 'one', label: 'Una por una' }, { value: 'list', label: 'En lista' }]}
              />
            </div>

            {mode === 'list' ? (
              <div className="acc-edit">
                <Field label="Una cuenta por línea" hint={<>Formato <code>usuario;contraseña</code>. Opcional: <code>;rol;nota</code>. También puedes pegar dos columnas desde Excel</>}>
                  <TextArea
                    rows={8}
                    className="mono"
                    spellCheck={false}
                    autoCapitalize="off"
                    placeholder={'tc-admin;Cl4ve$egura2026\ntc-guest;OtraClave#77;Invitado\nsoporte@empresa.pe;Soporte2026!;Soporte;Solo lectura'}
                    value={listText}
                    onChange={(e) => setListText(e.target.value)}
                  />
                </Field>
                <div className="list-actions">
                  <span className="sec small">{parsed.length ? `${plural(parsed.length, 'cuenta lista', 'cuentas listas')} para agregar` : 'Escribe o pega las cuentas'}</span>
                  <Button icon={ListPlus} disabled={!parsed.length} onClick={addFromList}>Agregar a la lista</Button>
                </div>
              </div>
            ) : (
              <>
                <datalist id="role-suggestions">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
                {accounts.map((a, idx) => (
                  <div className="acc-edit" key={a.key}>
                    <div className="acc-edit-head">
                      <span>Cuenta {idx + 1}{a.username ? ` · ${a.username}` : ''}</span>
                      {(!a.id || canDelete) && (
                        <IconButton icon={Trash2} label="Quitar cuenta" onClick={() => setAccounts((l) => l.filter((x) => x.key !== a.key))} />
                      )}
                    </div>
                    <FieldRow>
                      <Field label="Rol">
                        <Input list="role-suggestions" maxLength={60} placeholder="Administrador" value={a.role} onChange={(e) => update(a.key, { role: e.target.value })} />
                      </Field>
                      <Field label="Usuario o correo">
                        <Input maxLength={200} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false}
                          value={a.username} onChange={(e) => update(a.key, { username: e.target.value })} />
                      </Field>
                    </FieldRow>
                    <Field label={a.hasPassword ? 'Nueva contraseña' : 'Contraseña'}>
                      <PasswordInput
                        generator
                        showMeter
                        autoComplete="new-password"
                        maxLength={500}
                        placeholder={a.hasPassword ? 'Vacía = conservar la actual' : ''}
                        value={a.password}
                        onChange={(v) => update(a.key, { password: v })}
                      />
                    </Field>
                    <Field label="Nota">
                      <Input maxLength={1000} placeholder="Opcional" value={a.notes} onChange={(e) => update(a.key, { notes: e.target.value })} />
                    </Field>
                  </div>
                ))}
                <Button icon={Plus} onClick={() => setAccounts((l) => [...l, blankAcc()])}>Otra cuenta</Button>
              </>
            )}
          </>
        )}
        <FormError>{error}</FormError>
      </form>
      {confirmDelete && resource && (
        <Confirm
          title="Eliminar recurso"
          text={<>Se eliminará <strong>{resource.name}</strong> con sus {resource.accounts.length} cuenta(s). No se puede deshacer.</>}
          action="Eliminar"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={remove}
        />
      )}
    </Sheet>
  );
}
