import { useCallback, useEffect, useState } from 'react';
import { Button, Confirm, DataTable, PageHeader, Panel, SearchInput, Stat, StatGrid, useToast, type Column } from '../components';
import { api, errorText } from '../lib/api';
import { ago, norm } from '../lib/format';

interface PlatformOrg {
  id: string; slug: string; name: string; status: 'active' | 'suspended'; isPlatform: boolean;
  createdAt: string; users: number; resources: number; lastActivity: string | null;
}

/** Panel del equipo SysPass: todas las empresas registradas. */
export function OrgsView() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<PlatformOrg[]>([]);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<PlatformOrg | null>(null);

  const load = useCallback(() => {
    api<PlatformOrg[]>('/api/platform/orgs').then(setOrgs).catch((e) => toast(errorText(e), 'err'));
  }, [toast]);
  useEffect(load, [load]);

  async function setStatus(o: PlatformOrg, status: PlatformOrg['status']) {
    setConfirm(null);
    try {
      await api(`/api/platform/orgs/${o.id}`, { method: 'PUT', body: { status } });
      toast(status === 'suspended' ? `${o.name} suspendida` : `${o.name} reactivada`);
      load();
    } catch (e) { toast(errorText(e), 'err'); }
  }

  const visible = orgs.filter((o) => !query || norm(`${o.name} ${o.slug}`).includes(norm(query)));
  const active = orgs.filter((o) => o.status === 'active' && !o.isPlatform).length;
  const month = orgs.filter((o) => Date.now() - new Date(o.createdAt).getTime() < 30 * 864e5 && !o.isPlatform).length;

  const columns: Column<PlatformOrg>[] = [
    {
      key: 'name', header: 'Empresa', primary: true,
      render: (o) => (<><div>{o.name}</div><div className="muted mono small">{o.slug}</div></>),
    },
    { key: 'users', header: 'Usuarios', className: 'mono', render: (o) => o.users },
    { key: 'resources', header: 'Recursos', className: 'mono', render: (o) => o.resources },
    { key: 'activity', header: 'Último acceso', className: 'sec', render: (o) => (o.lastActivity ? ago(o.lastActivity) : <span className="muted">Nunca</span>) },
    { key: 'created', header: 'Registro', className: 'sec', render: (o) => ago(o.createdAt) },
    {
      key: 'status', header: 'Estado',
      render: (o) => (o.isPlatform ? <span className="muted">Plataforma</span>
        : o.status === 'active' ? <span className="sec">Activa</span> : <span className="flag neg">Suspendida</span>),
    },
    {
      key: 'action', header: '', className: 'cell-action',
      render: (o) => !o.isPlatform && (o.status === 'active'
        ? <Button size="sm" variant="danger" onClick={() => setConfirm(o)}>Suspender</Button>
        : <Button size="sm" onClick={() => setStatus(o, 'active')}>Reactivar</Button>),
    },
  ];

  return (
    <>
      <PageHeader title="Empresas" meta="Todas las empresas registradas en SysPass" />
      <StatGrid>
        <Stat lead label="Empresas activas" value={active} />
        <Stat label="Nuevas en 30 días" value={month} />
        <Stat label="Usuarios" value={orgs.reduce((n, o) => n + o.users, 0)} />
        <Stat label="Recursos" value={orgs.reduce((n, o) => n + o.resources, 0)} />
      </StatGrid>
      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Buscar empresa o código" />
      </div>
      <Panel>
        <DataTable columns={columns} rows={visible} rowKey={(o) => o.id} empty="Sin empresas" />
      </Panel>
      {confirm && (
        <Confirm
          title="Suspender empresa"
          text={<>Nadie de <strong>{confirm.name}</strong> podrá entrar y se cerrarán sus sesiones. Sus datos se conservan y puedes reactivarla cuando quieras.</>}
          action="Suspender"
          onCancel={() => setConfirm(null)}
          onConfirm={() => setStatus(confirm, 'suspended')}
        />
      )}
    </>
  );
}
