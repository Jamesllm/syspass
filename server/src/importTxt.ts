/**
 * Convierte un archivo de texto libre de credenciales (como credenciales.txt) en recursos.
 *
 * Formato que entiende:
 *   WINDOWS SERVER - TESTCONTROL        ← sección en mayúsculas: "TIPO/NOMBRE - CLIENTE"
 *   1. ADMINISTRADOR                    ← elemento numerado: un rol o un recurso propio si tiene IP/URL/ID
 *   usuario: x / user: x / correo: x    ← usuario de la cuenta
 *   pass: x / contraseña: x             ← contraseña (lo que va entre paréntesis queda como nota)
 *   ip: x / id: x / enlace: x           ← host del recurso
 *   tc-gerencia                         ← línea suelta sin espacios: otro usuario
 * Una línea en blanco cierra la cuenta en curso.
 */
import type { TYPES } from './vault.js';

type ResourceType = (typeof TYPES)[number];

export interface ParsedAccount { role: string; username: string; password: string; notes: string }
export interface ParsedResource { client: string; type: ResourceType; name: string; host: string; notes: string; accounts: ParsedAccount[] }

interface Section { title: string; client: string }
interface Block { section: Section; title: string; host: string; notes: string[]; accounts: ParsedAccount[] }

const ROLE_TITLE = /^(administrador(es)?|admin|soporte|root|guest|invitado|usuario|user|gerencia|sistemas?)$/i;

const TYPE_RULES: [ResourceType, RegExp][] = [
  ['remoto', /ANYDESK|TEAMVIEWER|RUSTDESK|\bRDP\b/],
  ['hipervisor', /VMWARE|VWARE|ESXI|VCENTER|PROXMOX|HYPER-?V/],
  ['nas', /\bNAS\b|SYNOLOGY|QNAP/],
  ['vpn', /\bVPN\b/],
  ['correo', /CORREO|E-?MAIL|\bMAIL\b|SMTP|OUTLOOK|GMAIL/],
  ['bd', /MYSQL|POSTGRES|SQL SERVER|\bBD\b|DATABASE|BASE DE DATOS/],
  ['red', /ROUTER|FIREWALL|MIKROTIK|FORTI|SWITCH/],
  ['equipos', /\bPCS?\b|EQUIPOS|LAPTOPS?|ESTACI[OÓ]N/],
  ['servidor', /SERVER|SERVIDOR/],
  ['web', /PLATAFORMA|HTTPS?:|N8N|\.(PE|COM|NET|ORG|IO)\b/],
];

export function inferType(...hints: string[]): ResourceType {
  for (const h of hints) {
    const s = (h || '').toUpperCase();
    for (const [t, re] of TYPE_RULES) if (re.test(s)) return t;
  }
  return 'otro';
}

const ACRONYMS: Record<string, string> = {
  nas: 'NAS', vpn: 'VPN', pc: 'PC', pcs: 'PCs', n8n: 'N8N', ti: 'TI', rdp: 'RDP', bd: 'BD', sql: 'SQL',
  esxi: 'ESXi', ip: 'IP', erp: 'ERP', crm: 'CRM', dns: 'DNS', ssh: 'SSH', ftp: 'FTP', nvr: 'NVR', dvr: 'DVR',
};
const titleCase = (s: string) =>
  s.toLowerCase()
    .replace(/(^|[\s\-/(])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/[\p{L}\d]+/gu, (w) => ACRONYMS[w.toLowerCase()] ?? w);

const isUpper = (s: string) => s === s.toUpperCase() && /\p{Lu}/u.test(s);

export function parseCredentialsTxt(text: string): ParsedResource[] {
  const blocks: Block[] = [];
  let section: Section | null = null;
  let block: Block | null = null;
  let acc: ParsedAccount | null = null;

  const newAcc = (): ParsedAccount => ({ role: '', username: '', password: '', notes: '' });
  const ensureBlock = (): Block => (block ??= { section: section!, title: '', host: '', notes: [], accounts: [] });
  const flushAcc = () => {
    if (acc && block && (acc.username || acc.password)) block.accounts.push(acc);
    acc = null;
  };
  const flushBlock = () => {
    if (block) {
      flushAcc();
      if (block.accounts.length || block.host) blocks.push(block);
    }
    block = null;
    acc = null;
  };
  const setHost = (b: Block, label: string, v: string) => {
    if (!b.host) b.host = v;
    else if (b.host !== v) b.notes.push(`${label}: ${v}`);
  };

  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) { flushAcc(); continue; }

    if (isUpper(t) && / [-–] /.test(t) && !/^\d/.test(t) && !t.includes(':')) {
      flushBlock();
      const parts = t.split(/ [-–] /);
      const client = parts.pop()!.trim();
      section = { title: parts.join(' - ').trim(), client };
      continue;
    }
    if (!section) continue;

    const num = t.match(/^\d+\s*[.)]\s*(.+)$/);
    if (num) {
      flushBlock();
      block = { section, title: num[1].trim(), host: '', notes: [], accounts: [] };
      continue;
    }

    if (/^https?:\/\//i.test(t)) { setHost(ensureBlock(), 'Enlace', t); continue; }

    const kv = t.match(/^([^:]{1,40}?)\s*:\s*(.*)$/);
    if (kv) {
      const b = ensureBlock();
      const label = kv[1].trim();
      const key = label.toLowerCase();
      const value = kv[2].trim();
      const paren = label.match(/\(([^)]*)\)/)?.[1] ?? '';
      if (/^(pass|password|contrase|clave|pwd)/.test(key)) {
        if (acc?.password) flushAcc();
        acc ??= newAcc();
        acc.password = value;
        if (paren) acc.notes = `Aplica a: ${paren}`;
      } else if (/^(user|usuario|correo|email|e-mail|mail|login|cuenta)/.test(key)) {
        if (acc?.username) flushAcc();
        acc ??= newAcc();
        acc.username = value;
      } else if (/^(ip|host|servidor|server|id\b|anydesk|enlace|url|link|web|dominio)/.test(key)) {
        setHost(b, titleCase(label), value);
      } else {
        b.notes.push(`${label}: ${value}`);
      }
      continue;
    }

    if (isUpper(t) && /\s/.test(t) && !block) {
      section = { title: t, client: section.client };
      continue;
    }
    if (!/\s/.test(t) && t.length < 80) {
      ensureBlock();
      if (acc?.username) flushAcc();
      acc ??= newAcc();
      acc.username = t;
      continue;
    }
    ensureBlock().notes.push(t);
  }
  flushBlock();

  // Agrupar bloques en recursos
  const resources: ParsedResource[] = [];
  const bySection = new Map<string, ParsedResource>();
  for (const b of blocks) {
    const client = titleCase(b.section.client);
    const accounts = b.accounts.map((a) => ({ ...a }));
    const ownResource = b.title && !ROLE_TITLE.test(b.title) && b.host;
    if (ownResource) {
      resources.push({
        client, type: inferType(b.title, b.host, b.section.title), name: titleCase(b.title),
        host: b.host, notes: b.notes.join('\n'), accounts,
      });
      continue;
    }
    const key = `${client}|${b.section.title.toLowerCase()}`;
    let r = bySection.get(key);
    if (!r) {
      r = { client, type: inferType(b.section.title, b.host), name: titleCase(b.section.title), host: '', notes: '', accounts: [] };
      bySection.set(key, r);
      resources.push(r);
    }
    if (b.host && !r.host) r.host = b.host;
    else if (b.host && b.host !== r.host) b.notes.unshift(`Host: ${b.host}`);
    if (b.title) for (const a of accounts) a.role = titleCase(b.title);
    r.accounts.push(...accounts);
    if (b.notes.length) r.notes = [r.notes, ...b.notes].filter(Boolean).join('\n');
  }
  return resources;
}
