/**
 * Versión instalada, novedades (changelog) y actualización desde la interfaz.
 *
 * La app NO tiene acceso a Docker. Para actualizar deja un archivo de solicitud en una carpeta
 * compartida (SYSPASS_CONTROL_DIR); un servicio del servidor (`syspass ui-update`) lo detecta,
 * ejecuta `syspass upgrade` y escribe el estado en esa misma carpeta.
 */
import { accessSync, constants, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { audit } from '../audit.js';
import { HttpError, requireUser, type SessionUser } from '../auth.js';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));
// server/src/routes (tsx) o server/dist/src/routes (compilado)
const projectRoot = resolve(here, import.meta.url.includes('/dist/') ? '../../../..' : '../../..');

export interface Section { title: string; items: string[] }
export interface Release { version: string; date: string | null; sections: Section[] }

/* ── Versión ───────────────────────── */

function readVersion(): string {
  const env = (process.env.SYSPASS_VERSION ?? '').trim().replace(/^v/, '');
  if (env && env !== 'dev') return env;
  try {
    return JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version ?? 'dev';
  } catch {
    return 'dev';
  }
}
export const VERSION = readVersion();

/** -1, 0 o 1. Las versiones no numéricas (dev) cuentan como 0.0.0 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

/* ── Notas ───────────────────────── */

const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

/** Convierte notas en Markdown simple (### título, - viñeta) en secciones */
export function parseNotes(md: string): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{3,4}\s+(.+)$/);
    if (heading) { current = { title: clean(heading[1]), items: [] }; sections.push(current); continue; }
    const item = line.match(/^[-*]\s+(.+)$/);
    if (!current) { current = { title: 'Cambios', items: [] }; sections.push(current); }
    current.items.push(clean(item ? item[1] : line));
  }
  return sections.filter((s) => s.items.length);
}

/** Lee CHANGELOG.md: secciones "## 1.2.0 — 2026-11-26" */
export function parseChangelog(md: string): Release[] {
  const out: Release[] = [];
  const parts = md.split(/^## /m).slice(1);
  for (const p of parts) {
    const [head, ...rest] = p.split(/\r?\n/);
    const m = head.match(/^v?(\d+\.\d+\.\d+)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?/);
    if (!m) continue;
    out.push({ version: m[1], date: m[2] ?? null, sections: parseNotes(rest.join('\n')) });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

function localChangelog(): Release[] {
  for (const p of [join(projectRoot, 'CHANGELOG.md'), join(projectRoot, '..', 'CHANGELOG.md')]) {
    if (existsSync(p)) return parseChangelog(readFileSync(p, 'utf8'));
  }
  return [];
}
const LOCAL = localChangelog();

/* ── Versiones publicadas en GitHub (con caché) ───────────────────────── */

let remote: { at: number; releases: Release[]; error?: string } | null = null;

async function remoteReleases() {
  if (remote && Date.now() - remote.at < 30 * 60_000) return remote;
  try {
    const r = await fetch(`https://api.github.com/repos/${config.updateRepo}/releases?per_page=30`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'SysPass' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`GitHub respondió ${r.status}`);
    const list = (await r.json()) as { tag_name: string; draft: boolean; prerelease: boolean; body: string | null; published_at: string | null }[];
    const releases = list
      .filter((x) => !x.draft && !x.prerelease && /^v?\d+\.\d+\.\d+$/.test(x.tag_name))
      .map((x) => {
        const version = x.tag_name.replace(/^v/, '');
        const sections = parseNotes(x.body ?? '');
        // Versiones antiguas sin notas en GitHub: usar las del CHANGELOG incluido
        return { version, date: x.published_at?.slice(0, 10) ?? null, sections: sections.length ? sections : LOCAL.find((l) => l.version === version)?.sections ?? [] };
      })
      .sort((a, b) => compareVersions(b.version, a.version));
    remote = { at: Date.now(), releases };
  } catch {
    // Reintentar en 5 minutos (p. ej. servidor sin salida a internet)
    remote = { at: Date.now() - 25 * 60_000, releases: [], error: 'No se pudo consultar las versiones publicadas' };
  }
  return remote;
}

/* ── Actualizador del servidor ───────────────────────── */

function updaterEnabled(): boolean {
  if (!config.controlDir) return false;
  try {
    accessSync(config.controlDir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

interface UpdateStatus { state: 'idle' | 'pending' | 'running' | 'done' | 'failed'; from: string; to: string; started: string; finished: string }

function readStatus(): UpdateStatus {
  const base: UpdateStatus = { state: 'idle', from: '', to: '', started: '', finished: '' };
  if (!config.controlDir) return base;
  if (existsSync(join(config.controlDir, 'update-request'))) return { ...base, state: 'pending' };
  try {
    const kv = Object.fromEntries(
      readFileSync(join(config.controlDir, 'status'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
    );
    const state = (['running', 'done', 'failed'].includes(kv.state) ? kv.state : 'idle') as UpdateStatus['state'];
    return { state, from: kv.from ?? '', to: kv.to ?? '', started: kv.started ?? '', finished: kv.finished ?? '' };
  } catch {
    return base;
  }
}

function readLogTail(lines = 30): string {
  if (!config.controlDir) return '';
  try {
    return readFileSync(join(config.controlDir, 'update.log'), 'utf8')
      // quitar códigos de color de la terminal
      .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
      .split(/\r?\n/).filter((l) => l.trim()).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

/** Una actualización "running" con más de 30 min se da por colgada y se permite reintentar */
const isStale = (s: UpdateStatus) => s.state === 'running' && !!s.started && Date.now() - Date.parse(s.started) > 30 * 60_000;

/** Pueden actualizar: admins de la empresa (modo una empresa) o el dueño de la plataforma (multiempresa) */
const canUpdate = (u: SessionUser) => u.role === 'admin' && (config.mode === 'single' || u.isPlatform);

function requireUpdater(u: SessionUser) {
  if (!canUpdate(u)) throw new HttpError(403, 'Solo un administrador de la instalación puede actualizar SysPass');
}

export async function systemRoutes(app: FastifyInstance) {
  app.get('/api/system/info', async (req) => {
    const u = requireUser(req);
    return { version: VERSION, mode: config.mode, canUpdate: canUpdate(u) };
  });

  /** Novedades de la versión instalada y anteriores (incluidas en la imagen) */
  app.get('/api/system/changelog', async (req) => {
    requireUser(req);
    return { current: VERSION, releases: LOCAL };
  });

  /** ¿Hay una versión nueva? con sus novedades */
  app.get('/api/system/updates', async (req) => {
    requireUpdater(requireUser(req));
    const r = await remoteReleases();
    const newer = r.releases.filter((x) => compareVersions(x.version, VERSION) > 0);
    return {
      current: VERSION,
      latest: r.releases[0]?.version ?? null,
      updateAvailable: newer.length > 0,
      updaterEnabled: updaterEnabled(),
      releases: newer,
      error: r.error ?? null,
    };
  });

  app.get('/api/system/update-status', async (req) => {
    requireUpdater(requireUser(req));
    const s = readStatus();
    return { ...s, state: isStale(s) ? 'failed' : s.state, current: VERSION, log: readLogTail() };
  });

  /** Deja la solicitud para el servicio del servidor */
  app.post('/api/system/update', { config: { rateLimit: { max: 3, timeWindow: '10 minutes' } } }, async (req) => {
    const u = requireUser(req);
    requireUpdater(u);
    if (!updaterEnabled()) {
      throw new HttpError(409, 'Las actualizaciones desde la interfaz no están activadas. En el servidor ejecuta: sudo syspass ui-update enable');
    }
    const s = readStatus();
    if ((s.state === 'pending' || s.state === 'running') && !isStale(s)) throw new HttpError(409, 'Ya hay una actualización en curso');
    const tmp = join(config.controlDir, 'update-request.tmp');
    writeFileSync(tmp, `requested_by=${u.username}\nat=${new Date().toISOString()}\nfrom=${VERSION}\n`);
    renameSync(tmp, join(config.controlDir, 'update-request'));
    await audit(req, 'system.update', { summary: `Actualización pedida desde la versión ${VERSION}` });
    return { ok: true };
  });
}
