import { HttpError, type SessionUser } from './auth.js';

/** Permisos que se marcan con casillas en cada usuario. Los administradores los tienen todos. */
export const PERMISSIONS = [
  'passwords.view',
  'passwords.copy',
  'resources.create',
  'resources.edit',
  'resources.delete',
  'groups.manage',
  'export',
  'export.passwords',
  'import',
  'history.view',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Casillas que marca cada rol por defecto */
export const ROLE_DEFAULTS: Record<'editor' | 'lector', Permission[]> = {
  editor: ['passwords.view', 'passwords.copy', 'resources.create', 'resources.edit', 'resources.delete', 'export'],
  lector: ['passwords.view', 'passwords.copy'],
};

export const isPermission = (p: string): p is Permission => (PERMISSIONS as readonly string[]).includes(p);

/** Permisos efectivos del usuario */
export const effectivePermissions = (role: string, stored: string[]): Permission[] =>
  role === 'admin' ? [...PERMISSIONS] : stored.filter(isPermission);

export const can = (u: SessionUser, p: Permission) => u.role === 'admin' || u.permissions.includes(p);

const MESSAGES: Record<Permission, string> = {
  'passwords.view': 'No tienes permiso para ver contraseñas',
  'passwords.copy': 'No tienes permiso para copiar contraseñas',
  'resources.create': 'No tienes permiso para crear recursos o cuentas',
  'resources.edit': 'No tienes permiso para editar',
  'resources.delete': 'No tienes permiso para eliminar',
  'groups.manage': 'No tienes permiso para administrar grupos',
  export: 'No tienes permiso para exportar',
  'export.passwords': 'No tienes permiso para exportar contraseñas',
  import: 'No tienes permiso para importar',
  'history.view': 'No tienes permiso para ver el historial',
};

export function requirePerm(u: SessionUser, p: Permission) {
  if (!can(u, p)) throw new HttpError(403, MESSAGES[p]);
}
