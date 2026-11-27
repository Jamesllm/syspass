export type Role = 'admin' | 'editor' | 'lector';

/* ── Permisos (casillas por usuario; los admin tienen todos) ── */
export type Permission =
  | 'passwords.view' | 'passwords.copy'
  | 'resources.create' | 'resources.edit' | 'resources.delete'
  | 'groups.manage' | 'export' | 'export.passwords' | 'import' | 'history.view';

export const PERMISSIONS: { key: Permission; label: string; hint: string }[] = [
  { key: 'passwords.view', label: 'Ver contraseñas', hint: 'Mostrar la contraseña en pantalla' },
  { key: 'passwords.copy', label: 'Copiar contraseñas', hint: 'Copiar al portapapeles' },
  { key: 'resources.create', label: 'Crear', hint: 'Recursos y cuentas nuevas' },
  { key: 'resources.edit', label: 'Editar', hint: 'Datos, usuarios y contraseñas' },
  { key: 'resources.delete', label: 'Eliminar', hint: 'Recursos y cuentas' },
  { key: 'groups.manage', label: 'Administrar grupos', hint: 'Crear, renombrar y borrar grupos' },
  { key: 'export', label: 'Exportar a Excel', hint: 'Sin contraseñas' },
  { key: 'export.passwords', label: 'Exportar con contraseñas', hint: 'Queda en la auditoría' },
  { key: 'import', label: 'Importar', hint: 'Desde un archivo de texto, en sus clientes' },
  { key: 'history.view', label: 'Ver historial', hint: 'Quién creó o modificó cada cuenta' },
];

export const ROLE_DEFAULTS: Record<'editor' | 'lector', Permission[]> = {
  editor: ['passwords.view', 'passwords.copy', 'resources.create', 'resources.edit', 'resources.delete', 'export'],
  lector: ['passwords.view', 'passwords.copy'],
};

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  mustChange: boolean;
  /** Permisos efectivos (un admin los trae todos) */
  permissions: Permission[];
}

export const can = (u: Pick<User, 'role' | 'permissions'>, p: Permission) => u.role === 'admin' || u.permissions.includes(p);

export interface Client {
  id: string;
  name: string;
  notes: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  position: number;
  resourceCount: number;
}

export interface Account {
  id: string;
  resourceId: string;
  role: string;
  username: string;
  notes: string;
  strength: number;
  hasPassword: boolean;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Solo llega a quien puede ver el historial */
  updatedBy: string | null;
  reusedCount: number;
}

export interface Resource {
  id: string;
  clientId: string;
  groupId: string;
  name: string;
  host: string;
  notes: string;
  updatedAt: string;
  updatedBy: string | null;
  accounts: Account[];
}

export interface Vault {
  clients: Client[];
  groups: Group[];
  resources: Resource[];
}

/** Evento de la línea de tiempo de una cuenta */
export interface HistoryEvent {
  action: string;
  text: string;
  detail: string;
  at: string;
  who: string;
  ip: string;
}

/** Tipos que reconoce el importador de texto (se convierten en grupos al importar) */
export type ResourceType =
  | 'servidor' | 'nas' | 'vpn' | 'equipos' | 'remoto' | 'hipervisor' | 'correo' | 'web' | 'bd' | 'red' | 'otro';

export const TYPES: { id: ResourceType; label: string; led: string }[] = [
  { id: 'servidor', label: 'Servidor', led: '#4f86c6' },
  { id: 'nas', label: 'NAS', led: '#3aa39a' },
  { id: 'vpn', label: 'VPN', led: '#c08a2e' },
  { id: 'equipos', label: 'Equipos', led: '#8b96a5' },
  { id: 'remoto', label: 'Acceso remoto', led: '#d0613f' },
  { id: 'hipervisor', label: 'Hipervisor', led: '#6f7fd6' },
  { id: 'correo', label: 'Correo', led: '#b6648f' },
  { id: 'web', label: 'Plataforma web', led: '#3f9c5a' },
  { id: 'bd', label: 'Base de datos', led: '#a6723d' },
  { id: 'red', label: 'Red y firewall', led: '#5f9ea0' },
  { id: 'otro', label: 'Otro', led: '#8a8a8a' },
];
export const typeInfo = (t: ResourceType) => TYPES.find((x) => x.id === t) ?? TYPES[TYPES.length - 1];

/** Colores para los LED de los grupos */
export const GROUP_COLORS = ['#4f86c6', '#3aa39a', '#c08a2e', '#8b96a5', '#d0613f', '#6f7fd6', '#b6648f', '#3f9c5a', '#a6723d', '#5f9ea0', '#8a8a8a', '#c2410c'];

export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', editor: 'Editor', lector: 'Solo lectura' };

/** Días tras los cuales una contraseña se considera vieja en la revisión. */
export const STALE_DAYS = 180;

export function accountIssues(a: Account) {
  const weak = a.hasPassword && a.strength === 1;
  const reused = a.reusedCount > 1;
  const stale = !!a.passwordChangedAt && Date.now() - new Date(a.passwordChangedAt).getTime() > STALE_DAYS * 864e5;
  return { weak, reused, stale, any: weak || reused || stale };
}

export interface Org {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  accent: string | null;
  isPlatform: boolean;
}

/** Modo de la instalación: una sola empresa o varias (SaaS) */
export type AppMode = 'single' | 'multi';
export interface AppConfig {
  mode: AppMode;
  /** Marca de la empresa única (modo single) */
  org: { name: string; logo: string | null; accent: string | null } | null;
}
