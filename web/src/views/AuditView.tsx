import { useCallback, useEffect, useState } from 'react';
import { Button, DataTable, PageHeader, Panel, SearchInput, useToast, type Column } from '../components';
import { api, errorText } from '../lib/api';
import { cx, fmtDateTime } from '../lib/format';

interface AuditRow { id: number; at: string; username: string; action: string; summary: string; ip: string }

const ACTION_LABEL: Record<string, string> = {
  'login': 'Inicio de sesión', 'login.fail': 'Intento fallido', 'password.view': 'Vio contraseña', 'password.copy': 'Copió contraseña',
  'resource.create': 'Creó recurso', 'resource.update': 'Editó recurso', 'resource.delete': 'Eliminó recurso',
  'client.create': 'Creó cliente', 'client.update': 'Editó cliente', 'client.delete': 'Eliminó cliente',
  'user.create': 'Creó usuario', 'user.update': 'Editó usuario', 'user.password': 'Cambió su contraseña', 'import.txt': 'Importó archivo',
};

const PAGE = 100;

const columns: Column<AuditRow>[] = [
  {
    key: 'action', header: 'Acción', primary: true,
    render: (r) => (
      <span className={cx('action', r.action.startsWith('password.') && 'reveal', r.action === 'login.fail' && 'fail')}>
        {ACTION_LABEL[r.action] ?? r.action}
      </span>
    ),
  },
  { key: 'summary', header: 'Detalle', className: 'sec', render: (r) => r.summary || <span className="muted">—</span> },
  { key: 'user', header: 'Usuario', render: (r) => r.username || <span className="muted">—</span> },
  { key: 'at', header: 'Fecha', className: 'mono sec nowrap', render: (r) => fmtDateTime(r.at) },
  { key: 'ip', header: 'IP', className: 'mono muted', desktopOnly: true, render: (r) => r.ip },
];

export function AuditView() {
  const toast = useToast();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [query, setQuery] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async (q: string, before?: number) => {
    try {
      const params = new URLSearchParams({ limit: String(PAGE) });
      if (before) params.set('before', String(before));
      if (q.trim()) params.set('q', q.trim());
      const r = await api<AuditRow[]>(`/api/audit?${params}`);
      setRows((prev) => (before ? [...prev, ...r] : r));
      setDone(r.length < PAGE);
    } catch (e) {
      toast(errorText(e), 'err');
    }
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query, load]);

  return (
    <>
      <PageHeader title="Auditoría" meta="Cada acceso, contraseña vista o copiada y cambio en la bóveda" />
      <div className="toolbar">
        <SearchInput value={query} onChange={setQuery} placeholder="Filtrar por usuario o recurso" />
      </div>
      <Panel footer={!done && rows.length > 0 && (
        <Button size="sm" onClick={() => load(query, rows[rows.length - 1].id)}>Cargar más</Button>
      )}>
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="Sin registros" />
      </Panel>
    </>
  );
}
