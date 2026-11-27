import { Button, PageHeader, Panel, Stat, StatGrid } from '../components';
import { ago, plural } from '../lib/format';
import { accountIssues, can, type Resource, type User, type Vault } from '../lib/types';

export function ReviewView({ vault, user, onEdit }: { vault: Vault; user: User; onEdit: (r: Resource) => void }) {
  const clients = new Map(vault.clients.map((c) => [c.id, c]));
  const groups = new Map(vault.groups.map((g) => [g.id, g]));
  const rows = vault.resources.flatMap((r) => r.accounts.filter((a) => a.hasPassword).map((a) => ({ r, a, i: accountIssues(a) })));
  const flagged = rows.filter((x) => x.i.any).sort((x, y) => Number(y.i.weak) - Number(x.i.weak) || y.a.reusedCount - x.a.reusedCount);
  const total = rows.length;
  const count = (k: 'weak' | 'reused' | 'stale') => rows.filter((x) => x.i[k]).length;

  const perClient = vault.clients
    .map((c) => {
      const list = rows.filter((x) => x.r.clientId === c.id);
      return { c, total: list.length, bad: list.filter((x) => x.i.any).length };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.bad / b.total - a.bad / a.total);

  return (
    <>
      <PageHeader title="Revisión de seguridad" meta="Contraseñas débiles, repetidas o sin cambiar en más de 180 días" />
      <StatGrid>
        <Stat lead label="Cuentas sanas" value={total - flagged.length} hint={`de ${total} con contraseña`} />
        <Stat label="Débiles" value={count('weak')} hint="Cortas o con patrones como el año" />
        <Stat label="Repetidas" value={count('reused')} hint="Misma clave en varias cuentas" />
        <Stat label="Sin cambio" value={count('stale')} hint="Más de 180 días" />
      </StatGrid>
      <div className="review-grid">
        <Panel title="Para cambiar" meta={plural(flagged.length, 'cuenta', 'cuentas')}>
          {flagged.length === 0 ? (
            <p className="sec panel-pad">Todas las contraseñas están en buen estado</p>
          ) : (
            <ul className="issue-list">
              {flagged.map(({ r, a, i }) => (
                <li className="issue" key={a.id}>
                  <div className="what">
                    <strong>{r.name} · {a.username || a.role || 'Sin usuario'}</strong>
                    <span>{clients.get(r.clientId)?.name} · {groups.get(r.groupId)?.name}</span>
                  </div>
                  <div className="tags">
                    {i.weak && <span className="flag neg">Débil</span>}
                    {i.reused && <span className="flag">Repetida ×{a.reusedCount}</span>}
                    {i.stale && <span className="flag">{ago(a.passwordChangedAt)}</span>}
                  </div>
                  {can(user, 'resources.edit') && <Button size="sm" onClick={() => onEdit(r)}>Cambiar</Button>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Por cliente" meta="Sanas / total">
          <ul className="health">
            {perClient.map(({ c, total: t, bad }) => (
              <li key={c.id}>
                <div className="row"><span>{c.name}</span><span className="mono sec">{t - bad}/{t}</span></div>
                <div className="bar" role="img" aria-label={`${t - bad} de ${t} sanas`}>
                  <i className="ok" style={{ width: `${((t - bad) / t) * 100}%` }} />
                  <i className="bad" style={{ width: `${(bad / t) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
