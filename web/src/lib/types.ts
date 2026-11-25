export type Role = 'admin' | 'editor' | 'lector';

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  mustChange: boolean;
}

export interface Client {
  id: string;
  name: string;
  notes: string;
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
  reusedCount: number;
}

export type ResourceType =
  | 'servidor' | 'nas' | 'vpn' | 'equipos' | 'remoto' | 'hipervisor' | 'correo' | 'web' | 'bd' | 'red' | 'otro';

export interface Resource {
  id: string;
  clientId: string;
  type: ResourceType;
  name: string;
  host: string;
  notes: string;
  updatedAt: string;
  updatedBy: string;
  accounts: Account[];
}

export interface Vault {
  clients: Client[];
  resources: Resource[];
}

/** El color es el LED de la etiqueta de host; no se usa en ningún otro lugar. */
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
