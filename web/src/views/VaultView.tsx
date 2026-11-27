import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Button, ChipGroup, CopyButton, EmptyState, HostTag, IconButton, PageHeader, PasswordText, SearchInput, SheetSelect,
  useToast, type Option,
} from '../components';
import { useHotkey, useIsMobile } from '../hooks';
import { api, errorText } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { ago, fmtDate, norm, plural } from '../lib/format';
import { accountIssues, can, type Account, type Client, type Group, type Resource, type User, type Vault } from '../lib/types';

function haystack(r: Resource, client?: Client, group?: Group) {
  return norm([client?.name, group?.name, r.name, r.host, r.notes, ...r.accounts.flatMap((a) => [a.role, a.username, a.notes])].join(' '));
}

export interface ExportScope { clientId?: string; groupId?: string }

export function VaultView({ vault, user, counts, clientId, onSelectClient, onNewClient, onEdit, onEditClient, onEditAccount, onExport }: {
  vault: Vault;
  user: User;
  counts: Map<string, number>;
  clientId: string | 'all';
  onSelectClient: (id: string) => void;
  onNewClient: () => void;
  onEdit: (r: Resource | null, groupId?: string) => void;
  onEditClient: (c: Client) => void;
  onEditAccount: (a: Account, r: Resource) => void;
  onExport: (scope: ExportScope) => void;
}) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin = user.role === 'admin';
  const canCreate = can(user, 'resources.create') && vault.clients.length > 0;
  const canExport = can(user, 'export');
  const clientsById = useMemo(() => new Map(vault.clients.map((c) => [c.id, c])), [vault.clients]);
  const groupsById = useMemo(() => new Map(vault.groups.map((g) => [g.id, g])), [vault.groups]);
  const client = clientId === 'all' ? null : clientsById.get(clientId) ?? null;

  useHotkey((e) => e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey)), () => searchRef.current?.focus());

  const scoped = vault.resources.filter((r) => clientId === 'all' || r.clientId === clientId);
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const matched = scoped.filter((r) => !terms.length || terms.every((t) => haystack(r, clientsById.get(r.clientId), groupsById.get(r.groupId)).includes(t)));
  const visible = matched.filter((r) => groupFilter === 'all' || r.groupId === groupFilter);

  const groupCounts = new Map<string, number>();
  for (const r of matched) groupCounts.set(r.groupId, (groupCounts.get(r.groupId) ?? 0) + 1);
  const groupOptions: Option[] = [
    { value: 'all', label: 'Todos los grupos', meta: matched.length },
    ...vault.groups.filter((g) => groupCounts.has(g.id)).map((g) => ({ value: g.id, label: g.name, meta: groupCounts.get(g.id) })),
  ];

  const clientOptions: Option[] = [
    { value: 'all', label: 'Todos los clientes', meta: vault.resources.length },
    ...vault.clients.map((c) => ({ value: c.id, label: c.name, meta: counts.get(c.id) ?? 0 })),
  ];

  const sections = useMemo(() => {
    const m = new Map<string, Resource[]>();
    for (const r of visible) m.set(r.clientId, [...(m.get(r.clientId) ?? []), r]);
    return [...m.entries()]
      .map(([id, list]) => ({ client: clientsById.get(id), list }))
      .sort((a, b) => (a.client?.name ?? '').localeCompare(b.client?.name ?? ''));
  }, [visible, clientsById]);

  const accountCount = scoped.reduce((n, r) => n + r.accounts.length, 0);
  const title = client ? client.name : 'Todos los clientes';
  const meta = `${plural(scoped.length, 'recurso', 'recursos')} · ${plural(accountCount, 'cuenta', 'cuentas')}${client?.notes ? ` · ${client.notes}` : ''}`;
  const scope: ExportScope = { clientId: client?.id, groupId: groupFilter === 'all' ? undefined : groupFilter };
  const newInGroup = () => onEdit(null, groupFilter === 'all' ? undefined : groupFilter);

  return (
    <>
      <PageHeader
        title={isMobile ? (
          <SheetSelect
            title="Cliente"
            value={clientId}
            options={clientOptions}
            onChange={onSelectClient}
            className="title-select"
            trigger={() => <h1>{title}</h1>}
          >
            {(close) => isAdmin && (
              <div className="bsheet-actions">
                {client && <Button icon={Pencil} onClick={() => { close(); onEditClient(client); }}>Editar {client.name}</Button>}
                <Button icon={Plus} onClick={() => { close(); onNewClient(); }}>Nuevo cliente</Button>
              </div>
            )}
          </SheetSelect>
        ) : title}
        meta={meta}
        actions={!isMobile && (
          <>
            {client && isAdmin && <Button variant="ghost" icon={Pencil} onClick={() => onEditClient(client)}>Cliente</Button>}
            {canExport && scoped.length > 0 && <Button variant="ghost" icon={Download} onClick={() => onExport(scope)}>Exportar</Button>}
            {canCreate && <Button variant="primary" icon={Plus} onClick={newInGroup}>Nuevo recurso</Button>}
          </>
        )}
      />

      <div className="toolbar sticky">
        <SearchInput value={query} onChange={setQuery} placeholder={isMobile ? 'Buscar' : 'Buscar nombre, IP, usuario o rol'} shortcut={isMobile ? undefined : '/'} inputRef={searchRef} />
        {isMobile && groupOptions.length > 2 && (
          <SheetSelect
            title="Grupo"
            value={groupFilter}
            options={groupOptions}
            onChange={setGroupFilter}
            className={groupFilter !== 'all' ? 'active' : undefined}
            trigger={(o) => <span>{groupFilter === 'all' ? 'Grupo' : o?.label}</span>}
          />
        )}
        {isMobile && canExport && scoped.length > 0 && <IconButton icon={Download} label="Exportar a Excel" onClick={() => onExport(scope)} />}
      </div>

      {!isMobile && groupOptions.length > 2 && (
        <ChipGroup label="Filtrar por grupo" value={groupFilter} onChange={(v) => setGroupFilter(v === groupFilter ? 'all' : v)}
          options={groupOptions.map((o) => (o.value === 'all' ? { ...o, label: 'Todos' } : o))} />
      )}

      {vault.clients.length === 0 ? (
        <EmptyState
          title="Todavía no hay clientes"
          text={isAdmin ? 'Crea el primer cliente o importa tu archivo de credenciales' : 'Pide a un administrador que te asigne clientes'}
          action={isAdmin && <Button icon={Plus} onClick={onNewClient}>Nuevo cliente</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={query ? `Nada coincide con “${query}”` : 'Aún no hay recursos aquí'}
          text={query ? 'Prueba con una IP, un usuario o el nombre del equipo' : 'Agrega el primer servidor, correo o plataforma'}
          action={!query && canCreate && <Button icon={Plus} onClick={newInGroup}>Nuevo recurso</Button>}
        />
      ) : (
        sections.map(({ client: c, list }) => (
          <section className="group" key={c?.id ?? 'x'}>
            {clientId === 'all' && (
              <div className="group-head"><h2>{c?.name}</h2><span>{list.length}</span></div>
            )}
            <div className="cards">
              {list.map((r) => (
                <ResourceCard key={r.id} resource={r} group={groupsById.get(r.groupId)} user={user}
                  onEdit={() => onEdit(r)} onEditAccount={(a) => onEditAccount(a, r)} />
              ))}
            </div>
          </section>
        ))
      )}

      {isMobile && canCreate && (
        <button type="button" className="fab" onClick={newInGroup}>
          <Plus size={20} strokeWidth={1.75} />Nuevo
        </button>
      )}
    </>
  );
}

function ResourceCard({ resource: r, group, user, onEdit, onEditAccount }: {
  resource: Resource; group?: Group; user: User; onEdit: () => void; onEditAccount: (a: Account) => void;
}) {
  return (
    <article className="card">
      <header className="card-head">
        <div className="card-title">
          <h3>{r.name}</h3>
          <span className="type">{group?.name ?? 'Sin grupo'}</span>
        </div>
        {can(user, 'resources.edit') && <IconButton icon={Pencil} label={`Editar ${r.name}`} onClick={onEdit} />}
        {r.host && <div className="card-host"><HostTag host={r.host} color={group?.color ?? '#8a8a8a'} /></div>}
      </header>
      {r.notes && <p className="card-notes">{r.notes}</p>}
      {r.accounts.length > 0 && (
        <div className="accounts">{r.accounts.map((a) => <AccountRow key={a.id} account={a} user={user} onEdit={() => onEditAccount(a)} />)}</div>
      )}
    </article>
  );
}

const revealPassword = (id: string, purpose: 'ver' | 'copiar') =>
  api<{ password: string }>(`/api/accounts/${id}/reveal`, { body: { purpose } }).then((r) => r.password);

function AccountRow({ account: a, user, onEdit }: { account: Account; user: User; onEdit: () => void }) {
  const toast = useToast();
  const [shown, setShown] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const issues = accountIssues(a);
  const visible = shown !== null;
  const canView = can(user, 'passwords.view');
  const canCopy = can(user, 'passwords.copy');
  // El lápiz abre la cuenta: para editarla o, si solo puede ver el historial, para verlo
  const canOpen = can(user, 'resources.edit') || can(user, 'history.view');

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  async function toggle() {
    if (visible) return setShown(null);
    try {
      setShown(await revealPassword(a.id, 'ver'));
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setShown(null), 20_000);
    } catch (e) {
      toast(errorText(e), 'err');
    }
  }

  return (
    <div className="acc">
      <span className="acc-role" title={a.role}>{a.role || 'Cuenta'}</span>
      <span className="acc-user">
        {a.username ? (
          <>
            <button type="button" className="val" title="Copiar usuario"
              onClick={() => { copyToClipboard(a.username); toast('Usuario copiado'); }}>{a.username}</button>
            <CopyButton value={a.username} label="Copiar usuario" done="Usuario copiado" />
          </>
        ) : <span className="val muted">Sin usuario</span>}
      </span>
      <span className="acc-pass">
        {a.hasPassword ? (
          <>
            {canView ? (
              <button type="button" className={`pw ${visible ? 'shown' : 'masked'}`} onClick={toggle} aria-live="polite"
                aria-label={visible ? 'Ocultar contraseña' : 'Ver contraseña'}>
                {visible ? <PasswordText value={shown} /> : '••••••••••••'}
              </button>
            ) : <span className="pw masked">••••••••••••</span>}
            {canView && <IconButton icon={visible ? EyeOff : Eye} label={visible ? 'Ocultar contraseña' : 'Ver contraseña'} active={visible} onClick={toggle} />}
            {canCopy && <CopyButton value={() => revealPassword(a.id, 'copiar')} label="Copiar contraseña" done="Contraseña copiada · se borra en 30 s" secret />}
          </>
        ) : <span className="pw muted">Sin contraseña</span>}
        {canOpen && <IconButton icon={Pencil} label="Editar esta cuenta" onClick={onEdit} className="acc-edit-btn" />}
      </span>
      <span className="acc-meta">
        {issues.weak && <span className="flag neg">Débil</span>}
        {issues.reused && <span className="flag">Repetida ×{a.reusedCount}</span>}
        {issues.stale && <span className="flag">Sin cambio {ago(a.passwordChangedAt)}</span>}
        <span className="muted" title={a.updatedBy ? `Modificada por ${a.updatedBy}` : undefined}>
          Modificada {fmtDate(a.updatedAt)}{a.updatedBy ? ` · ${a.updatedBy}` : ''}
        </span>
      </span>
      {a.notes && <span className="acc-notes">{a.notes}</span>}
    </div>
  );
}
