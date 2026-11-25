import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button, Callout, DataTable, PageHeader, Panel, useToast, type Column } from '../components';
import { useAction } from '../hooks';
import { api, errorText } from '../lib/api';
import { cx, plural } from '../lib/format';
import { typeInfo, type ResourceType } from '../lib/types';

interface PreviewResource {
  client: string; type: ResourceType; name: string; host: string;
  accounts: { role: string; username: string; hasPassword: boolean }[];
}
interface Result { clients: number; resources: number; accounts: number }

const columns: Column<PreviewResource>[] = [
  { key: 'name', header: 'Recurso', primary: true, render: (r) => r.name },
  { key: 'client', header: 'Cliente', render: (r) => r.client },
  { key: 'type', header: 'Tipo', className: 'sec', render: (r) => typeInfo(r.type).label },
  { key: 'host', header: 'Host', className: 'mono sec', render: (r) => r.host || <span className="muted">—</span> },
  {
    key: 'accounts', header: 'Cuentas', className: 'sec',
    render: (r) => r.accounts.map((a, j) => (
      <div key={j}>
        {a.role && <span className="muted">{a.role} · </span>}
        {a.username || <span className="muted">sin usuario</span>}
        {!a.hasPassword && <span className="flag"> · sin contraseña</span>}
      </div>
    )),
  },
];

export function ImportView({ onImported }: { onImported: () => void }) {
  const toast = useToast();
  const { run, busy } = useAction();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewResource[] | null>(null);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function readFile(f: File) {
    const t = await f.text();
    setFileName(f.name);
    setText(t);
    setResult(null);
    try {
      const r = await api<{ resources: PreviewResource[] }>('/api/import/txt/preview', { body: { text: t } });
      setPreview(r.resources);
    } catch (e) {
      toast(errorText(e), 'err');
    }
  }

  function reset() {
    setPreview(null);
    setText('');
    setFileName('');
  }

  async function commit() {
    const r = await run(() => api<Result>('/api/import/txt/commit', { body: { text } }));
    if (!r) return toast('No se pudo importar', 'err');
    setResult(r);
    reset();
    onImported();
  }

  const totalAccounts = preview?.reduce((n, r) => n + r.accounts.length, 0) ?? 0;

  return (
    <>
      <PageHeader title="Importar credenciales" meta="Convierte un archivo de texto con accesos en clientes, recursos y cuentas cifradas" />
      <div className="stack">
        {result && (
          <Callout title={`Listo: ${plural(result.resources, 'recurso', 'recursos')} y ${plural(result.accounts, 'cuenta', 'cuentas')} en ${plural(result.clients, 'cliente', 'clientes')}`}>
            <span className="sec">Revisa los nombres en la bóveda. Después borra el .txt original y vacía la papelera: ahí las contraseñas siguen en texto plano</span>
          </Callout>
        )}
        <label
          className={cx('drop', over && 'over')}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
        >
          <FileUp size={20} strokeWidth={1.5} />
          <strong>{fileName || 'Elige o arrastra el archivo .txt'}</strong>
          <span className="muted">Secciones como “WINDOWS SERVER - CLIENTE” y líneas usuario:, pass:, ip:</span>
          <input type="file" accept=".txt,text/plain" className="sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        </label>

        {preview && (
          <Panel
            title="Vista previa"
            meta={`${plural(preview.length, 'recurso', 'recursos')} · ${plural(totalAccounts, 'cuenta', 'cuentas')}`}
            footer={<>
              <span className="sec grow">Las contraseñas no se muestran; se cifran al importar</span>
              <Button onClick={reset}>Cancelar</Button>
              <Button variant="primary" loading={busy} loadingText="Importando…" disabled={!preview.length} onClick={commit}>
                Importar {preview.length}
              </Button>
            </>}
          >
            <DataTable columns={columns} rows={preview} rowKey={(r) => `${r.client}-${r.name}`} />
          </Panel>
        )}
      </div>
    </>
  );
}
