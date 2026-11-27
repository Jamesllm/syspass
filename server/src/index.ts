import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { HttpError, registerAuth } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { adminRoutes } from './routes/admin.js';
import { orgRoutes } from './routes/org.js';
import { systemRoutes } from './routes/system.js';
import { exportRoutes } from './routes/export.js';
import { sessionRoutes } from './routes/session.js';
import { vaultRoutes } from './routes/vault.js';

const app = Fastify({
  trustProxy: config.trustProxy,
  bodyLimit: 1024 * 1024,
  logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.cookie', 'req.body'] },
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.secureCookies ? [] : null,
    },
  },
  hsts: config.secureCookies,
  // Estas dos cabeceras solo tienen efecto con HTTPS; por HTTP el navegador las ignora y avisa en consola
  crossOriginOpenerPolicy: config.secureCookies,
  originAgentCluster: config.secureCookies,
});
if (config.corsOrigins.length) {
  await app.register(cors, { origin: config.corsOrigins, credentials: true, allowedHeaders: ['content-type', 'x-dv'] });
}
await app.register(cookie);
await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
registerAuth(app);

app.setErrorHandler((err, req, reply) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.code(400).send({ error: first?.message ?? 'Datos inválidos', field: first?.path.join('.') });
  }
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message, code: err.code });
  const status = (err as { statusCode?: number }).statusCode;
  if (status === 429) return reply.code(429).send({ error: 'Demasiados intentos. Espera unos minutos' });
  if (status && status < 500) return reply.code(status).send({ error: (err as Error).message });
  req.log.error(err);
  return reply.code(500).send({ error: 'Error interno del servidor' });
});

app.addHook('onSend', async (req, reply) => {
  if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
});

app.get('/api/health', async () => {
  await pool.query('select 1');
  return { ok: true };
});
await app.register(sessionRoutes);
await app.register(vaultRoutes);
await app.register(adminRoutes);
await app.register(orgRoutes);
await app.register(systemRoutes);
await app.register(exportRoutes);

// Si existe el build del frontend, este mismo servidor lo sirve (opcional).
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), import.meta.url.includes('/dist/') ? '../..' : '..');
const webDist = process.env.WEB_DIST ?? resolve(serverRoot, '../web/dist');
if (existsSync(webDist) && process.env.SERVE_WEB !== 'false') {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' });
    return reply.sendFile('index.html');
  });
  app.log.info(`Sirviendo frontend desde ${webDist}`);
}

await app.listen({ port: config.port, host: config.host });
