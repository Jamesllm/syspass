function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name} (revisa .env)`);
  return v;
}

const vaultKey = Buffer.from(need('VAULT_KEY'), 'base64');
if (vaultKey.length !== 32) {
  throw new Error('VAULT_KEY debe ser de 32 bytes en base64. Genera una con: npm run keygen');
}

export const config = {
  databaseUrl: need('DATABASE_URL'),
  vaultKey,
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? '0.0.0.0',
  /** Orígenes permitidos para el frontend en otro dominio/puerto (CORS), separados por coma */
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  /** true si el servidor se sirve detrás de HTTPS (cookie Secure) */
  secureCookies: (process.env.SECURE_COOKIES ?? 'false') === 'true',
  trustProxy: (process.env.TRUST_PROXY ?? 'false') === 'true',
  /** minutos sin actividad antes de cerrar la sesión */
  idleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? 30),
  /** horas máximas de una sesión aunque haya actividad */
  maxHours: Number(process.env.SESSION_MAX_HOURS ?? 12),
};
