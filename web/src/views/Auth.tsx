import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Field, FormError, Input, Logo, Modal, OrgMark, PasswordInput, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { applyAccent, rememberOrg, rememberedOrg, slugify } from '../lib/brand';
import { navigate } from '../lib/router';
import type { User } from '../lib/types';

type PublicOrg = { name: string; logo: string | null; accent: string | null };

/** Pantalla centrada: login, registro y cambio obligatorio de contraseña. */
function AuthLayout({ brand, title, text, children, foot }: {
  brand?: ReactNode; title: string; text: string; children: ReactNode; foot?: ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth-card">
        {brand ?? <Logo />}
        <div>
          <h1>{title}</h1>
          <p>{text}</p>
        </div>
        {children}
        {foot && <div className="auth-foot">{foot}</div>}
      </div>
    </main>
  );
}

/** Busca la marca pública de una empresa mientras se escribe su código. */
function usePublicOrg(slug: string) {
  const [org, setOrg] = useState<PublicOrg | null>(null);
  useEffect(() => {
    const s = slug.trim().toLowerCase();
    if (s.length < 3) { setOrg(null); return; }
    const t = setTimeout(() => {
      api<PublicOrg>(`/api/public/orgs/${encodeURIComponent(s)}`).then(setOrg).catch(() => setOrg(null));
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);
  useEffect(() => { applyAccent(org?.accent ?? null); }, [org]);
  return org;
}

export function Login({ onLogin }: { onLogin: () => void }) {
  const { run, busy, error } = useAction();
  const [org, setOrg] = useState(rememberedOrg);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const brand = usePublicOrg(org);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api('/api/auth/login', { body: { org, username, password } }));
    if (ok) { rememberOrg(org.trim().toLowerCase()); onLogin(); } else setPassword('');
  }

  return (
    <AuthLayout
      brand={brand ? <span className="auth-org"><OrgMark name={brand.name} logo={brand.logo} size={40} /><Logo /></span> : undefined}
      title={brand ? `Entrar a ${brand.name}` : 'Entrar a SysPass'}
      text="Los accesos de tus clientes y plataformas, cifrados y auditados"
      foot={<>¿Tu empresa aún no usa SysPass? <a href="/registro" onClick={(e) => { e.preventDefault(); navigate('/registro'); }}>Regístrala</a></>}
    >
      <form onSubmit={submit} className="stack">
        <Field label="Empresa" hint={!org ? 'El código que tu administrador te dio, por ejemplo drago' : undefined}>
          <Input mono required autoCapitalize="off" autoCorrect="off" spellCheck={false} autoComplete="organization"
            autoFocus={!org} placeholder="codigo-empresa" value={org} onChange={(e) => setOrg(e.target.value.toLowerCase())} />
        </Field>
        <Field label="Usuario">
          <Input autoComplete="username" autoCapitalize="off" autoCorrect="off" autoFocus={!!org} required value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <PasswordInput autoComplete="current-password" required value={password} onChange={setPassword} />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Verificando…">Entrar</Button>
      </form>
    </AuthLayout>
  );
}

export function Register({ onRegistered }: { onRegistered: () => void }) {
  const { run, busy, error, setError } = useAction();
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ ok: boolean; text: string } | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');

  useEffect(() => { if (!slugTouched) setSlug(slugify(orgName)); }, [orgName, slugTouched]);

  useEffect(() => {
    if (slug.length < 3) { setSlugState(null); return; }
    const t = setTimeout(() => {
      api<{ available: boolean; reason?: string }>(`/api/public/slug-available?slug=${encodeURIComponent(slug)}`)
        .then((r) => setSlugState(r.available ? { ok: true, text: 'Disponible' } : { ok: false, text: r.reason ?? 'No disponible' }))
        .catch(() => setSlugState(null));
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 12) return setError('La contraseña debe tener al menos 12 caracteres');
    if (password !== repeat) return setError('Las contraseñas no coinciden');
    const ok = await run(() => api('/api/auth/register', { body: { orgName, slug, name, username, password } }));
    if (ok) { rememberOrg(slug); navigate('/'); onRegistered(); }
  }

  return (
    <AuthLayout
      title="Registra tu empresa"
      text="Crea el espacio de tu equipo en SysPass. Tú serás su primer administrador"
      foot={<>¿Ya tienes cuenta? <a href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }}>Entrar</a></>}
    >
      <form onSubmit={submit} className="stack">
        <Field label="Nombre de la empresa">
          <Input required maxLength={80} autoFocus placeholder="Mi Empresa SAC" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        </Field>
        <Field
          label="Código para entrar"
          hint={slugState ? <span className={slugState.ok ? 'ok' : 'flag neg'}>{slugState.text}</span> : 'Tu equipo lo escribirá al iniciar sesión'}
        >
          <Input mono required minLength={3} maxLength={32} autoCapitalize="off" autoCorrect="off" spellCheck={false}
            placeholder="mi-empresa" value={slug}
            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }} />
        </Field>
        <Field label="Tu nombre">
          <Input required maxLength={120} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Usuario">
          <Input required minLength={3} maxLength={60} autoComplete="username" autoCapitalize="off" autoCorrect="off"
            placeholder="admin" value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Contraseña">
          <PasswordInput required autoComplete="new-password" showMeter value={password} onChange={setPassword} />
        </Field>
        <Field label="Repite la contraseña">
          <PasswordInput required autoComplete="new-password" value={repeat} onChange={setRepeat} />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Creando…" disabled={slugState?.ok === false}>
          Crear empresa
        </Button>
      </form>
    </AuthLayout>
  );
}

function PasswordForm({ onDone, submitLabel }: { onDone: () => void; submitLabel: string }) {
  const { run, busy, error, setError } = useAction();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 12) return setError('Usa al menos 12 caracteres');
    if (next !== repeat) return setError('Las contraseñas nuevas no coinciden');
    const ok = await run(() => api('/api/auth/password', { body: { current, next } }));
    if (ok) onDone();
  }

  return (
    <form onSubmit={submit} className="stack">
      <Field label="Contraseña actual">
        <PasswordInput autoComplete="current-password" required value={current} onChange={setCurrent} />
      </Field>
      <Field label="Nueva contraseña">
        <PasswordInput autoComplete="new-password" required showMeter value={next} onChange={setNext} />
      </Field>
      <Field label="Repite la nueva contraseña">
        <PasswordInput autoComplete="new-password" required value={repeat} onChange={setRepeat} />
      </Field>
      <FormError>{error}</FormError>
      <Button type="submit" variant="primary" size="lg" block loading={busy} loadingText="Guardando…">{submitLabel}</Button>
    </form>
  );
}

export function ForcedPasswordChange({ user, onDone, onLogout }: { user: User; onDone: () => void; onLogout: () => void }) {
  return (
    <AuthLayout
      title="Crea tu contraseña"
      text={`${user.name || user.username}, entraste con una contraseña temporal. Elige una propia de al menos 12 caracteres`}
    >
      <PasswordForm onDone={onDone} submitLabel="Guardar y continuar" />
      <Button variant="ghost" onClick={onLogout}>Salir</Button>
    </AuthLayout>
  );
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal title="Cambiar mi contraseña" onClose={onClose}>
      <PasswordForm submitLabel="Cambiar contraseña" onDone={() => { toast('Contraseña actualizada'); onClose(); }} />
    </Modal>
  );
}
