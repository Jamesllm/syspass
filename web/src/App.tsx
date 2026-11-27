import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from './components';
import { useIdle } from './hooks';
import { AppShell, type View } from './layout/AppShell';
import { api, errorText, setUnauthorizedHandler } from './lib/api';
import { applyAccent, applyTitle } from './lib/brand';
import { navigate, usePath } from './lib/router';
import { accountIssues, type AppConfig, type AppMode, type Client, type Org, type Resource, type User, type Vault } from './lib/types';
import { AuditView } from './views/AuditView';
import { ChangePasswordModal, ForcedPasswordChange, Login, Register } from './views/Auth';
import { ClientModal } from './views/ClientModal';
import { ImportView } from './views/ImportView';
import { OrgSettingsView } from './views/OrgSettingsView';
import { OrgsView } from './views/OrgsView';
import { ResourceSheet } from './views/ResourceSheet';
import { ReviewView } from './views/ReviewView';
import { UpdatesModal, type SystemInfo, type UpdatesInfo } from './views/UpdatesModal';
import { UsersView } from './views/UsersView';
import { VaultView } from './views/VaultView';

/** Última versión cuyas novedades ya vio este navegador */
const SEEN_KEY = 'sp_seen_version';
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };
const writeSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* sin almacenamiento */ } };
const newer = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

type Session = { user: User; org: Org; mode: AppMode; idleMinutes: number };
type AuthState = { status: 'loading' } | { status: 'out' } | ({ status: 'in' } & Session);

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const path = usePath();

  // Modo de la instalación (una empresa o multiempresa) y marca para el login
  useEffect(() => {
    api<AppConfig>('/api/public/config').then(setConfig).catch(() => setConfig({ mode: 'multi', org: null }));
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const r = await api<Session>('/api/auth/me');
      setAuth({ status: 'in', ...r });
    } catch {
      setAuth({ status: 'out' });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth({ status: 'out' }));
    refreshMe();
  }, [refreshMe]);

  // La marca de la empresa (color y título) acompaña a la sesión
  const org = auth.status === 'in' ? auth.org : null;
  useEffect(() => {
    applyAccent(org?.accent ?? null);
    applyTitle(org?.name);
  }, [org]);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuth({ status: 'out' });
  }, []);

  // Con sesión iniciada, /registro no aplica
  useEffect(() => { if (auth.status === 'in' && path !== '/') navigate('/'); }, [auth.status, path]);

  if (auth.status === 'loading' || (auth.status === 'out' && !config)) return <div className="loading">Cargando…</div>;
  if (auth.status === 'out') {
    // En modo una sola empresa no hay registro público
    return path === '/registro' && config!.mode === 'multi'
      ? <Register onRegistered={refreshMe} />
      : <Login config={config!} onLogin={refreshMe} />;
  }
  if (auth.user.mustChange) return <ForcedPasswordChange user={auth.user} onDone={refreshMe} onLogout={logout} />;
  return (
    <Workspace
      user={auth.user}
      org={auth.org}
      mode={auth.mode}
      idleMinutes={auth.idleMinutes}
      onLogout={logout}
      onOrgChange={(o) => setAuth({ ...auth, org: o })}
    />
  );
}

function Workspace({ user, org, mode, idleMinutes, onLogout, onOrgChange }: {
  user: User; org: Org; mode: AppMode; idleMinutes: number; onLogout: () => void; onOrgChange: (o: Org) => void;
}) {
  const toast = useToast();
  const [vault, setVault] = useState<Vault | null>(null);
  const [view, setView] = useState<View>({ kind: 'vault', clientId: 'all' });
  const [editing, setEditing] = useState<Resource | 'new' | null>(null);
  const [clientModal, setClientModal] = useState<Client | 'new' | null>(null);
  const [pwModal, setPwModal] = useState(false);
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [updates, setUpdates] = useState<UpdatesInfo | null>(null);
  const [about, setAbout] = useState<'about' | 'whatsnew' | null>(null);
  const isAdmin = user.role === 'admin';

  useIdle(idleMinutes, onLogout);

  const checkUpdates = useCallback(() => {
    api<UpdatesInfo>('/api/system/updates').then(setUpdates).catch(() => {});
  }, []);

  // Versión instalada; novedades una vez por versión nueva; ¿hay actualización?
  useEffect(() => {
    api<SystemInfo>('/api/system/info').then((info) => {
      setSys(info);
      const seen = readSeen();
      if (seen && newer(info.version, seen)) setAbout('whatsnew');
      else writeSeen(info.version);
      if (info.canUpdate) checkUpdates();
    }).catch(() => {});
  }, [checkUpdates]);

  const load = useCallback(async () => {
    try { setVault(await api<Vault>('/api/vault')); } catch (e) { toast(errorText(e), 'err'); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of vault?.resources ?? []) m.set(r.clientId, (m.get(r.clientId) ?? 0) + 1);
    return m;
  }, [vault]);
  const issueCount = useMemo(
    () => (vault?.resources ?? []).reduce((n, r) => n + r.accounts.filter((a) => accountIssues(a).any).length, 0),
    [vault],
  );

  const go = (v: View) => { setView(v); window.scrollTo({ top: 0 }); };
  const currentClientId = view.kind === 'vault' && view.clientId !== 'all' ? view.clientId : null;

  return (
    <AppShell
      user={user}
      org={org}
      mode={mode}
      version={sys?.version ?? null}
      updateAvailable={!!updates?.updateAvailable}
      onOpenAbout={() => { if (sys?.canUpdate) checkUpdates(); setAbout('about'); }}
      clients={vault?.clients ?? []}
      counts={counts}
      totalResources={vault?.resources.length ?? 0}
      issueCount={issueCount}
      view={view}
      onNavigate={go}
      onNewClient={() => setClientModal('new')}
      onChangePassword={() => setPwModal(true)}
      onLogout={onLogout}
    >
      {!vault ? <div className="muted">Cargando bóveda…</div> : (
        <>
          {view.kind === 'vault' && (
            <VaultView
              key={view.clientId}
              vault={vault}
              user={user}
              counts={counts}
              clientId={view.clientId}
              onSelectClient={(id) => go({ kind: 'vault', clientId: id })}
              onNewClient={() => setClientModal('new')}
              onEdit={(r) => setEditing(r ?? 'new')}
              onEditClient={setClientModal}
            />
          )}
          {view.kind === 'review' && <ReviewView vault={vault} user={user} onEdit={setEditing} />}
          {view.kind === 'users' && isAdmin && <UsersView clients={vault.clients} meId={user.id} />}
          {view.kind === 'audit' && isAdmin && <AuditView />}
          {view.kind === 'import' && isAdmin && <ImportView onImported={load} />}
          {view.kind === 'settings' && isAdmin && <OrgSettingsView org={org} mode={mode} onSaved={onOrgChange} />}
          {view.kind === 'platform' && isAdmin && org.isPlatform && mode === 'multi' && <OrgsView />}
        </>
      )}

      {editing && vault && (
        <ResourceSheet
          key={editing === 'new' ? 'new' : editing.id}
          resource={editing === 'new' ? null : editing}
          clients={vault.clients}
          defaultClientId={currentClientId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {clientModal && (
        <ClientModal
          client={clientModal === 'new' ? null : clientModal}
          resourceCount={clientModal === 'new' ? 0 : counts.get(clientModal.id) ?? 0}
          onClose={() => setClientModal(null)}
          onSaved={(id, deleted) => {
            setClientModal(null);
            load();
            go({ kind: 'vault', clientId: deleted || !id ? 'all' : id });
          }}
        />
      )}
      {pwModal && <ChangePasswordModal onClose={() => setPwModal(false)} />}
      {about && sys && (
        <UpdatesModal
          info={sys}
          updates={updates}
          whatsNew={about === 'whatsnew'}
          onClose={() => { writeSeen(sys.version); setAbout(null); }}
        />
      )}
    </AppShell>
  );
}
