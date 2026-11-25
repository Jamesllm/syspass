import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import {
  Button, Callout, Checkbox, CopyButton, DataTable, Field, FieldRow, FormError, Input, PageHeader, Panel, Select, Sheet,
  useToast, type Column,
} from '../components';
import { useAction } from '../hooks';
import { api, errorText } from '../lib/api';
import { ago } from '../lib/format';
import { ROLE_LABEL, type Client, type Role } from '../lib/types';

interface AdminUser {
  id: string; username: string; name: string; role: Role; active: boolean; mustChange: boolean;
  lastLoginAt: string | null; clientIds: string[];
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador · todo, incluidos usuarios y auditoría' },
  { value: 'editor', label: 'Editor · ve y edita sus clientes' },
  { value: 'lector', label: 'Solo lectura · ve y copia en sus clientes' },
];

export function UsersView({ clients, meId }: { clients: Client[]; meId: string }) {
  const toast = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [issued, setIssued] = useState<{ username: string; password: string } | null>(null);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const load = useCallback(() => {
    api<AdminUser[]>('/api/users').then(setUsers).catch((e) => toast(errorText(e), 'err'));
  }, [toast]);
  useEffect(load, [load]);

  const columns: Column<AdminUser>[] = [
    {
      key: 'user', header: 'Usuario', primary: true,
      render: (u) => (<><div>{u.name || u.username}</div><div className="muted mono small">{u.username}</div></>),
    },
    { key: 'role', header: 'Rol', render: (u) => ROLE_LABEL[u.role] },
    {
      key: 'clients', header: 'Clientes', className: 'sec',
      render: (u) => (u.role === 'admin' ? 'Todos'
        : u.clientIds.length ? u.clientIds.map((id) => clientName.get(id)).filter(Boolean).join(', ')
          : <span className="muted">Ninguno</span>),
    },
    { key: 'last', header: 'Último acceso', className: 'sec', render: (u) => (u.lastLoginAt ? ago(u.lastLoginAt) : <span className="muted">Nunca</span>) },
    {
      key: 'state', header: 'Estado',
      render: (u) => (!u.active ? <span className="flag neg">Desactivado</span>
        : u.mustChange ? <span className="flag">Clave temporal</span> : <span className="sec">Activo</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Usuarios"
        meta="Quién entra a la bóveda y a qué clientes"
        actions={<Button variant="primary" icon={Plus} onClick={() => { setIssued(null); setEditing('new'); }}>Nuevo usuario</Button>}
      />
      {issued && (
        <Callout title={`Contraseña temporal de ${issued.username}`}>
          <div className="temp-pass">
            {issued.password}
            <CopyButton value={issued.password} label="Copiar contraseña temporal" done="Contraseña copiada" secret />
          </div>
          <span className="sec">Entrégala en persona o por un canal seguro. Solo se muestra esta vez y se pedirá cambiarla al entrar</span>
        </Callout>
      )}
      <Panel>
        <DataTable columns={columns} rows={users} rowKey={(u) => u.id} onRowClick={(u) => { setIssued(null); setEditing(u); }} />
      </Panel>
      {editing && (
        <UserSheet
          user={editing === 'new' ? null : editing}
          clients={clients}
          isMe={editing !== 'new' && editing.id === meId}
          onClose={() => setEditing(null)}
          onSaved={(username, password) => {
            setEditing(null);
            if (password) setIssued({ username, password });
            load();
          }}
        />
      )}
    </>
  );
}

function UserSheet({ user, clients, isMe, onClose, onSaved }: {
  user: AdminUser | null; clients: Client[]; isMe: boolean;
  onClose: () => void; onSaved: (username: string, tempPassword: string | null) => void;
}) {
  const { run, busy, error } = useAction();
  const [username, setUsername] = useState(user?.username ?? '');
  const [name, setName] = useState(user?.name ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'editor');
  const [active, setActive] = useState(user?.active ?? true);
  const [clientIds, setClientIds] = useState<Set<string>>(new Set(user?.clientIds ?? []));
  const [reset, setReset] = useState(false);

  function toggleClient(id: string, on: boolean) {
    const n = new Set(clientIds);
    if (on) n.add(id); else n.delete(id);
    setClientIds(n);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const ids = role === 'admin' ? [] : [...clientIds];
    const r = await run(() => (user
      ? api<{ tempPassword: string | null }>(`/api/users/${user.id}`, { method: 'PUT', body: { name, role, active, clientIds: ids, resetPassword: reset } })
      : api<{ tempPassword: string }>('/api/users', { body: { username, name, role, clientIds: ids } })));
    if (r) onSaved(user?.username ?? username, r.tempPassword);
  }

  return (
    <Sheet
      title={user ? `Editar ${user.username}` : 'Nuevo usuario'}
      onClose={onClose}
      footer={<>
        <span className="grow" />
        <Button onClick={onClose}>Cancelar</Button>
        <Button type="submit" form="user-form" variant="primary" loading={busy}>{user ? 'Guardar' : 'Crear usuario'}</Button>
      </>}
    >
      <form id="user-form" className="sheet-body" onSubmit={save}>
        <FieldRow>
          <Field label="Usuario">
            <Input mono required minLength={3} maxLength={60} disabled={!!user} autoCapitalize="off" autoCorrect="off"
              value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jperez" />
          </Field>
          <Field label="Nombre">
            <Input maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" />
          </Field>
        </FieldRow>
        <Field label="Rol">
          <Select value={role} disabled={isMe} onChange={(e) => setRole(e.target.value as Role)} options={ROLE_OPTIONS} />
        </Field>
        {role !== 'admin' && (
          <div className="field">
            <span>Clientes asignados</span>
            {clients.length === 0 ? <p className="muted">Aún no hay clientes</p> : (
              <div className="client-pick">
                {clients.map((c) => (
                  <Checkbox key={c.id} label={c.name} checked={clientIds.has(c.id)} onChange={(e) => toggleClient(c.id, e.target.checked)} />
                ))}
              </div>
            )}
          </div>
        )}
        {user && (
          <>
            <Checkbox label="Usuario activo" checked={active} disabled={isMe} onChange={(e) => setActive(e.target.checked)} />
            {!isMe && <Checkbox label="Restablecer contraseña y cerrar sus sesiones" checked={reset} onChange={(e) => setReset(e.target.checked)} />}
          </>
        )}
        {!user && <p className="sec">Se generará una contraseña temporal que el usuario cambiará al entrar</p>}
        <FormError>{error}</FormError>
      </form>
    </Sheet>
  );
}
