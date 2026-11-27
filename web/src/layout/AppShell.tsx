import { useState, type CSSProperties, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Building2, FileUp, FolderTree, Globe, KeyRound, Layers, LogOut, Menu, Palette, Plus, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { BottomSheet, ICON, OrgBrand, ThemeToggle } from '../components';
import { useIsMobile } from '../hooks';
import { clientVars } from '../lib/brand';
import { cx } from '../lib/format';
import { ROLE_LABEL, can, type AppMode, type Client, type Org, type User } from '../lib/types';

export type View =
  | { kind: 'vault'; clientId: string | 'all' }
  | { kind: 'review' }
  | { kind: 'users' }
  | { kind: 'audit' }
  | { kind: 'import' }
  | { kind: 'groups' }
  | { kind: 'settings' }
  | { kind: 'platform' };

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  count?: ReactNode;
  warn?: boolean;
  active?: boolean;
  muted?: boolean;
  /** Color del cliente: reemplaza el ícono por un punto de ese color */
  color?: string | null;
  onClick: () => void;
}

/** Fila de navegación: la usan la barra lateral y el menú "Más" del móvil. */
function NavItem({ icon: Icon, label, count, warn, active, muted, color, onClick }: NavItemProps) {
  return (
    <button type="button" className={cx('nav-item', active && 'active', active && color && 'client-active')} onClick={onClick}
      aria-current={active ? 'page' : undefined} style={clientVars(color) as CSSProperties | undefined}>
      {color ? <span className="nav-dot" aria-hidden><span /></span> : <Icon {...ICON} />}
      <span className={cx('label', muted && 'muted')}>{label}</span>
      {count !== undefined && count !== '' && <span className={cx('count', warn && 'warn-count')}>{count}</span>}
    </button>
  );
}

/** Botón de la barra inferior del móvil */
function TabItem({ icon: Icon, label, active, badge, onClick }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button type="button" className={cx('tab', active && 'active')} onClick={onClick} aria-current={active ? 'page' : undefined}>
      <span className="tab-icon">
        <Icon size={20} strokeWidth={1.5} />
        {!!badge && <span className="tab-badge">{badge}</span>}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function AppShell({ user, org, mode, version, updateAvailable, onOpenAbout, clients, counts, totalResources, issueCount, view, onNavigate, onNewClient, onChangePassword, onLogout, children }: {
  user: User;
  org: Org;
  mode: AppMode;
  /** Versión instalada de SysPass */
  version: string | null;
  updateAvailable: boolean;
  onOpenAbout: () => void;
  clients: Client[];
  counts: Map<string, number>;
  totalResources: number;
  issueCount: number;
  view: View;
  onNavigate: (v: View) => void;
  onNewClient: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const isMobile = useIsMobile();
  const [moreOpen, setMoreOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const is = (kind: View['kind']) => view.kind === kind;
  const isClient = (id: string) => view.kind === 'vault' && view.clientId === id;
  // El panel de empresas solo existe en modo multiempresa
  const isPlatform = org.isPlatform && mode === 'multi';

  // Cada opción aparece según los permisos del usuario
  const adminItems: NavItemProps[] = [
    ...(can(user, 'groups.manage') ? [{ icon: FolderTree, label: 'Grupos', active: is('groups'), onClick: () => onNavigate({ kind: 'groups' }) }] : []),
    ...(isAdmin ? [
      { icon: Users, label: 'Usuarios', active: is('users'), onClick: () => onNavigate({ kind: 'users' }) },
      { icon: ScrollText, label: 'Auditoría', active: is('audit'), onClick: () => onNavigate({ kind: 'audit' }) },
    ] : []),
    ...(can(user, 'import') ? [{ icon: FileUp, label: 'Importar', active: is('import'), onClick: () => onNavigate({ kind: 'import' }) }] : []),
    ...(isAdmin ? [{ icon: Palette, label: 'Empresa', active: is('settings'), onClick: () => onNavigate({ kind: 'settings' }) }] : []),
    ...(isPlatform ? [{ icon: Globe, label: 'Empresas', active: is('platform'), onClick: () => onNavigate({ kind: 'platform' }) }] : []),
  ];
  const accountItems: NavItemProps[] = [
    { icon: KeyRound, label: 'Cambiar contraseña', onClick: onChangePassword },
    { icon: LogOut, label: 'Salir', onClick: onLogout },
  ];
  const me = (
    <div className="me">
      <strong>{user.name || user.username}</strong>
      <span>{ROLE_LABEL[user.role]}</span>
    </div>
  );
  // Versión (abre novedades y actualización) y selector de tema
  const systemRow = (close?: () => void) => (
    <div className="sys-row">
      <button type="button" className="version-btn" onClick={() => { close?.(); onOpenAbout(); }}
        title={updateAvailable ? 'Hay una versión nueva de SysPass' : 'Versión y novedades de SysPass'}>
        <span className="mono">{version ? `v${version}` : 'SysPass'}</span>
        {updateAvailable && <span className="update-tag">Actualizar</span>}
      </button>
      <ThemeToggle />
    </div>
  );

  if (isMobile) {
    const inMore = is('users') || is('audit') || is('import') || is('groups') || is('settings') || is('platform');
    const close = (fn: () => void) => () => { setMoreOpen(false); fn(); };
    return (
      <div className="shell mobile">
        <header className="topbar"><OrgBrand name={org.name} logo={org.logo} platform={isPlatform} /></header>
        <main className="main">{children}</main>
        <nav className="tabbar" aria-label="Secciones">
          <TabItem icon={Layers} label="Bóveda" active={is('vault')} onClick={() => onNavigate({ kind: 'vault', clientId: view.kind === 'vault' ? view.clientId : 'all' })} />
          <TabItem icon={ShieldCheck} label="Revisión" active={is('review')} badge={issueCount} onClick={() => onNavigate({ kind: 'review' })} />
          <TabItem icon={Menu} label="Más" active={inMore || moreOpen} badge={updateAvailable ? 1 : undefined} onClick={() => setMoreOpen(true)} />
        </nav>
        {moreOpen && (
          <BottomSheet title="Más" onClose={() => setMoreOpen(false)}>
            {me}
            {adminItems.length > 0 && (
              <div className="nav">
                {adminItems.map((i) => <NavItem key={i.label} {...i} onClick={close(i.onClick)} />)}
                {isAdmin && <NavItem icon={Plus} label="Nuevo cliente" onClick={close(onNewClient)} />}
              </div>
            )}
            <div className="nav sep">
              {accountItems.map((i) => <NavItem key={i.label} {...i} onClick={close(i.onClick)} />)}
            </div>
            {systemRow(() => setMoreOpen(false))}
          </BottomSheet>
        )}
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <OrgBrand name={org.name} logo={org.logo} platform={isPlatform} />
        <div className="nav-label">Bóveda</div>
        <nav className="nav">
          <NavItem icon={Layers} label="Todos los clientes" count={totalResources} active={isClient('all')} onClick={() => onNavigate({ kind: 'vault', clientId: 'all' })} />
          {clients.map((c) => (
            <NavItem key={c.id} icon={Building2} label={c.name} color={c.color} count={counts.get(c.id) ?? 0} active={isClient(c.id)} onClick={() => onNavigate({ kind: 'vault', clientId: c.id })} />
          ))}
          {isAdmin && <NavItem icon={Plus} label="Nuevo cliente" muted onClick={onNewClient} />}
        </nav>
        <div className="nav-label">Control</div>
        <nav className="nav">
          <NavItem icon={ShieldCheck} label="Revisión" count={issueCount || undefined} warn active={is('review')} onClick={() => onNavigate({ kind: 'review' })} />
          {adminItems.map((i) => <NavItem key={i.label} {...i} />)}
        </nav>
        <div className="side-foot">
          {me}
          {accountItems.map((i) => <NavItem key={i.label} {...i} />)}
          {systemRow()}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
