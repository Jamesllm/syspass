import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpDown, Download, Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Button, ChipGroup, CopyButton, EmptyState, HostTag, IconButton, PageHeader, PasswordText, SearchInput, SheetSelect,
  useToast, type Option,
} from '../components';
import { useHotkey, useIsMobile } from '../hooks';
import { api, errorText } from '../lib/api';
import { clientVars } from '../lib/brand';
import { copyToClipboard } from '../lib/clipboard';
import { ago, cx, fmtDate, norm, plural } from '../lib/format';
import {
  ACCOUNT_SORTS, accountIssues, can, sortAccounts, type Account, type AccountSort, type Client, type Group, type Resource, type User, type Vault,
} from '../lib/types';

/**
 * Busca en un recurso. Cada palabra puede coincidir con el recurso (cliente, grupo, nombre, IP, notas)
 * o con una cuenta. Devuelve las cuentas que coinciden; `all` si el recurso coincide por sí solo.
 */
function searchResource(r: Resource, terms: string[], client?: Client, group?: Group): { all: true } | { ids: Set<string> } | null {
  if (!terms.length) return { all: true };
  const own = norm([client?.name, group?.name, r.name, r.host, r.notes].join(' '));
  const pending = terms.filter((t) => !own.includes(t));
  if (!pending.length) return { all: true };
  const ids = new Set(
    r.accounts
      .filter((a) => {
        const text = norm([a.role, a.username, a.notes].join(' '));
        return pending.every((t) => text.includes(t));
      })
      .map((a) => a.id),
  );
  return ids.size ? { ids } : null;
}

export interface ExportScope { clientId?: string; groupId?: string }

export function VaultView({ vault, user, counts, clientId, onSelectClient, onNewClient, onEdit, onEditClient, onEditAccount, onAddAccounts, onExport }: {
  vault: Vault;
  user: User;
  counts: Map<string, number>;
  clientId: string | 'all';
  onSelectClient: (id: string) => void;
  onNewClient: () => void;
  onEdit: (r: Resource | null, groupId?: string) => void;
  onEditClient: (c: Client) => void;
  onEditAccount: (a: Account, r: Resource) => void;
  onAddAccounts: (r: Resource) => void;
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
  const hits = new Map<string, Set<string> | null>();
  const matched = scoped.filter((r) => {
    const hit = searchResource(r, terms, clientsById.get(r.clientId), groupsById.get(r.groupId));
    if (hit) hits.set(r.id, 'ids' in hit ? hit.ids : null);
    return !!hit;
  });
  const visible = matched.filter((r) => groupFilter === 'all' || r.groupId === groupFilter);

  const groupCounts = new Map<string, number>();
  for (const r of matched) groupCounts.set(r.groupId, (groupCounts.get(r.groupId) ?? 0) + 1);
  const groupOptions: Option[] = [
    { value: 'all', label: 'Todos los grupos', meta: matched.length },
    ...vault.groups.filter((g) => groupCounts.has(g.id)).map((g) => ({ value: g.id, label: g.name, meta: groupCounts.get(g.id) })),
  ];

  const clientOptions: Option[] = [
    { value: 'all', label: 'Todos los clientes', meta: vault.resources.length },
    ...vault.clients.map((c) => ({ value: c.id, label: c.name, meta: counts.get(c.id) ?? 0, icon: <ClientDot color={c.color} /> })),
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
            trigger={() => <h1>{client && <ClientDot color={client.color} />}{title}</h1>}
          >
            {(close) => isAdmin && (
              <div className="bsheet-actions">
                {client && <Button icon={Pencil} onClick={() => { close(); onEditClient(client); }}>Editar {client.name}</Button>}
                <Button icon={Plus} onClick={() => { close(); onNewClient(); }}>Nuevo cliente</Button>
              </div>
            )}
          </SheetSelect>
        ) : client?.color ? <h1><ClientDot color={client.color} />{title}</h1> : title}
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
              <div className="group-head"><h2><ClientDot color={c?.color} />{c?.name}</h2><span>{list.length}</span></div>
            )}
            <div className="cards">
              {list.map((r) => (
                <ResourceCard key={r.id} resource={r} group={groupsById.get(r.groupId)} user={user} only={hits.get(r.id) ?? null} color={c?.color}
                  onEdit={() => onEdit(r)} onEditAccount={(a) => onEditAccount(a, r)} onAddAccounts={() => onAddAccounts(r)} />
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

/** Punto con el color del cliente; no pinta nada si no tiene color */
function ClientDot({ color }: { color?: string | null }) {
  return color ? <span className="client-dot" style={{ background: color }} aria-hidden /> : null;
}

function ResourceCard({ resource: r, group, user, only, color, onEdit, onEditAccount, onAddAccounts }: {
  resource: Resource; group?: Group; user: User;
  /** Color del cliente: borde de la tarjeta y fondo de su cabecera */
  color?: string | null;
  /** Cuentas que coinciden con la búsqueda; null = todas */
  only: Set<string> | null;
  onEdit: () => void; onEditAccount: (a: Account) => void; onAddAccounts: () => void;
}) {
  const toast = useToast();
  const canEdit = can(user, 'resources.edit');
  const [sort, setSort] = useState<AccountSort>(r.accountSort ?? 'manual');
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setSort(r.accountSort ?? 'manual'), [r.accountSort]);
  // El Set se recrea en cada render del padre: se compara por contenido
  const onlyKey = only ? [...only].join(',') : '';
  useEffect(() => setShowAll(false), [onlyKey]);
  const filtered = only && !showAll;
  const accounts = useMemo(
    () => sortAccounts(filtered ? r.accounts.filter((a) => only.has(a.id)) : r.accounts, sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r.accounts, sort, onlyKey, filtered],
  );
  const hidden = r.accounts.length - accounts.length;

  async function changeSort(next: AccountSort) {
    const prev = sort;
    setSort(next);
    try {
      await api(`/api/resources/${r.id}/sort`, { method: 'PUT', body: { sort: next } });
      r.accountSort = next;
    } catch (e) {
      setSort(prev);
      toast(errorText(e), 'err');
    }
  }

  return (
    <article className={cx('card', color && 'tinted')} style={clientVars(color) as CSSProperties | undefined}>
      <header className="card-head">
        <div className="card-title">
          <h3>{r.name}</h3>
          <span className="type">{group?.name ?? 'Sin grupo'}</span>
          {r.accounts.length > 0 && (
            <span className="acc-count" title={filtered
              ? `${accounts.length} de ${plural(r.accounts.length, 'cuenta', 'cuentas')} coinciden con la búsqueda`
              : plural(r.accounts.length, 'cuenta', 'cuentas')}>
              {filtered ? `${accounts.length} de ${r.accounts.length}` : plural(r.accounts.length, 'cuenta', 'cuentas')}
            </span>
          )}
        </div>
        <div className="card-actions">
          {r.accounts.length > 1 && canEdit && (
            <label className="sort-select" title="Orden de las cuentas (se guarda para todos)">
              <ArrowUpDown size={14} strokeWidth={1.5} />
              <span className="sr">Ordenar cuentas</span>
              <select value={sort} onChange={(e) => changeSort(e.target.value as AccountSort)}>
                {ACCOUNT_SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          )}
          {canEdit && <IconButton icon={Pencil} label={`Editar ${r.name}`} onClick={onEdit} />}
        </div>
        {r.host && <div className="card-host"><HostTag host={r.host} color={group?.color ?? '#8a8a8a'} /></div>}
      </header>
      {r.notes && <p className="card-notes">{r.notes}</p>}
      {accounts.length > 0 && (
        <div className="accounts">{accounts.map((a) => <AccountRow key={a.id} account={a} user={user} onEdit={() => onEditAccount(a)} />)}</div>
      )}
      {only && (hidden > 0 || showAll) && (
        <div className="acc-filtered">
          <span>{showAll ? `Todas las cuentas (${r.accounts.length})` : `${plural(accounts.length, 'cuenta coincide', 'cuentas coinciden')} · ${hidden} oculta${hidden === 1 ? '' : 's'}`}</span>
          <button type="button" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Solo las que coinciden' : 'Ver todas'}</button>
        </div>
      )}
      {can(user, 'resources.create') && (
        <button type="button" className="add-acc" onClick={onAddAccounts}>
          <Plus size={16} strokeWidth={1.5} />Agregar cuenta
        </button>
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
