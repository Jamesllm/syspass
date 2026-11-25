import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus } from 'lucide-react';
import {
  Button, ChipGroup, CopyButton, EmptyState, HostTag, IconButton, PageHeader, PasswordText, SearchInput, SheetSelect,
  useToast, type Option,
} from '../components';
import { useHotkey, useIsMobile } from '../hooks';
import { api, errorText } from '../lib/api';
import { copyToClipboard } from '../lib/clipboard';
import { ago, norm, plural } from '../lib/format';
import { TYPES, accountIssues, typeInfo, type Account, type Client, type Resource, type User, type Vault } from '../lib/types';

function haystack(r: Resource, client?: Client) {
  return norm([client?.name, typeInfo(r.type).label, r.name, r.host, r.notes, ...r.accounts.flatMap((a) => [a.role, a.username, a.notes])].join(' '));
}

export function VaultView({ vault, user, counts, clientId, onSelectClient, onNewClient, onEdit, onEditClient }: {
  vault: Vault;
  user: User;
  counts: Map<string, number>;
  clientId: string | 'all';
  onSelectClient: (id: string) => void;
  onNewClient: () => void;
  onEdit: (r: Resource | null) => void;
  onEditClient: (c: Client) => void;
}) {
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const canEdit = user.role !== 'lector';
  const isAdmin = user.role === 'admin';
  const clientsById = useMemo(() => new Map(vault.clients.map((c) => [c.id, c])), [vault.clients]);
  const client = clientId === 'all' ? null : clientsById.get(clientId) ?? null;

  useHotkey((e) => e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey)), () => searchRef.current?.focus());

  const scoped = vault.resources.filter((r) => clientId === 'all' || r.clientId === clientId);
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const matched = scoped.filter((r) => !terms.length || terms.every((t) => haystack(r, clientsById.get(r.clientId)).includes(t)));
  const visible = matched.filter((r) => type === 'all' || r.type === type);

  const typeCounts = new Map<string, number>();
  for (const r of matched) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  const typeOptions: Option[] = [
    { value: 'all', label: 'Todos los tipos', meta: matched.length },
    ...TYPES.filter((t) => typeCounts.has(t.id)).map((t) => ({ value: t.id, label: t.label, meta: typeCounts.get(t.id) })),
  ];

  const clientOptions: Option[] = [
    { value: 'all', label: 'Todos los clientes', meta: vault.resources.length },
    ...vault.clients.map((c) => ({ value: c.id, label: c.name, meta: counts.get(c.id) ?? 0 })),
  ];

  const groups = useMemo(() => {
    const m = new Map<string, Resource[]>();
    for (const r of visible) m.set(r.clientId, [...(m.get(r.clientId) ?? []), r]);
    return [...m.entries()]
      .map(([id, list]) => ({ client: clientsById.get(id), list }))
      .sort((a, b) => (a.client?.name ?? '').localeCompare(b.client?.name ?? ''));
  }, [visible, clientsById]);

  const accountCount = scoped.reduce((n, r) => n + r.accounts.length, 0);
  const title = client ? client.name : 'Todos los clientes';
  const meta = `${plural(scoped.length, 'recurso', 'recursos')} · ${plural(accountCount, 'cuenta', 'cuentas')}${client?.notes ? ` · ${client.notes}` : ''}`;
  const canCreate = canEdit && vault.clients.length > 0;

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
            {canCreate && <Button variant="primary" icon={Plus} onClick={() => onEdit(null)}>Nuevo recurso</Button>}
          </>
        )}
      />

      <div className="toolbar sticky">
        <SearchInput value={query} onChange={setQuery} placeholder={isMobile ? 'Buscar' : 'Buscar nombre, IP, usuario o rol'} shortcut={isMobile ? undefined : '/'} inputRef={searchRef} />
        {isMobile && typeOptions.length > 2 && (
          <SheetSelect
            title="Tipo de recurso"
            value={type}
            options={typeOptions}
            onChange={setType}
            className={type !== 'all' ? 'active' : undefined}
            trigger={(o) => <span>{type === 'all' ? 'Tipo' : o?.label}</span>}
          />
        )}
      </div>

      {!isMobile && typeOptions.length > 2 && (
        <ChipGroup label="Filtrar por tipo" value={type} onChange={(v) => setType(v === type ? 'all' : v)}
          options={typeOptions.map((o) => (o.value === 'all' ? { ...o, label: 'Todos' } : o))} />
      )}

      {vault.clients.length === 0 ? (
        <EmptyState
          title="Todavía no hay clientes"
          text={isAdmin ? 'Crea el primer cliente o importa tu archivo de credenciales' : 'Pide a un administrador que te asigne clientes'}
          action={isAdmin && <Button icon={Plus} onClick={onNewClient}>Nuevo cliente</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={query ? `Nada coincide con “${query}”` : 'Este cliente aún no tiene recursos'}
          text={query ? 'Prueba con una IP, un usuario o el nombre del equipo' : 'Agrega el primer servidor, correo o plataforma'}
          action={!query && canEdit && <Button icon={Plus} onClick={() => onEdit(null)}>Nuevo recurso</Button>}
        />
      ) : (
        groups.map(({ client: c, list }) => (
          <section className="group" key={c?.id ?? 'x'}>
            {clientId === 'all' && (
              <div className="group-head"><h2>{c?.name}</h2><span>{list.length}</span></div>
            )}
            <div className="cards">
              {list.map((r) => <ResourceCard key={r.id} resource={r} canEdit={canEdit} onEdit={() => onEdit(r)} />)}
            </div>
          </section>
        ))
      )}

      {isMobile && canCreate && (
        <button type="button" className="fab" onClick={() => onEdit(null)}>
          <Plus size={20} strokeWidth={1.75} />Nuevo
        </button>
      )}
    </>
  );
}

function ResourceCard({ resource: r, canEdit, onEdit }: { resource: Resource; canEdit: boolean; onEdit: () => void }) {
  return (
    <article className="card">
      <header className="card-head">
        <div className="card-title">
          <h3>{r.name}</h3>
          <span className="type">{typeInfo(r.type).label}</span>
        </div>
        {canEdit && <IconButton icon={Pencil} label={`Editar ${r.name}`} onClick={onEdit} />}
        {r.host && <div className="card-host"><HostTag host={r.host} type={r.type} /></div>}
      </header>
      {r.notes && <p className="card-notes">{r.notes}</p>}
      {r.accounts.length > 0 && (
        <div className="accounts">{r.accounts.map((a) => <AccountRow key={a.id} account={a} />)}</div>
      )}
    </article>
  );
}

const revealPassword = (id: string, purpose: 'ver' | 'copiar') =>
  api<{ password: string }>(`/api/accounts/${id}/reveal`, { body: { purpose } }).then((r) => r.password);

function AccountRow({ account: a }: { account: Account }) {
  const toast = useToast();
  const [shown, setShown] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const issues = accountIssues(a);
  const visible = shown !== null;

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
            <button type="button" className={`pw ${visible ? 'shown' : 'masked'}`} onClick={toggle} aria-live="polite"
              aria-label={visible ? 'Ocultar contraseña' : 'Ver contraseña'}>
              {visible ? <PasswordText value={shown} /> : '••••••••••••'}
            </button>
            <IconButton icon={visible ? EyeOff : Eye} label={visible ? 'Ocultar contraseña' : 'Ver contraseña'} active={visible} onClick={toggle} />
            <CopyButton value={() => revealPassword(a.id, 'copiar')} label="Copiar contraseña" done="Contraseña copiada · se borra en 30 s" secret />
          </>
        ) : <span className="pw muted">Sin contraseña</span>}
      </span>
      <span className="acc-meta">
        {issues.weak && <span className="flag neg">Débil</span>}
        {issues.reused && <span className="flag">Repetida ×{a.reusedCount}</span>}
        {issues.stale ? <span className="flag">Sin cambio {ago(a.passwordChangedAt)}</span>
          : a.passwordChangedAt && <span className="muted">Cambiada {ago(a.passwordChangedAt)}</span>}
      </span>
      {a.notes && <span className="acc-notes">{a.notes}</span>}
    </div>
  );
}
