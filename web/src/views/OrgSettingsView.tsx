import { useEffect, useState, type FormEvent } from 'react';
import { ImageUp, Trash2 } from 'lucide-react';
import { Button, CopyButton, Field, FormError, Input, OrgBrand, PageHeader, Panel, PasswordText, useToast } from '../components';
import { useAction } from '../hooks';
import { api } from '../lib/api';
import { PRESET_ACCENTS, accentVariants, applyAccent } from '../lib/brand';
import { cx } from '../lib/format';
import type { Org } from '../lib/types';

const MAX_LOGO = 200 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

const readAsDataUrl = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

export function OrgSettingsView({ org, onSaved }: { org: Org; onSaved: (o: Org) => void }) {
  const toast = useToast();
  const { run, busy, error, setError } = useAction();
  const [name, setName] = useState(org.name);
  const [accent, setAccent] = useState<string | null>(org.accent);
  const [logo, setLogo] = useState<string | null>(org.logo);

  // Vista previa en vivo del color; al salir sin guardar se restaura el de la empresa
  useEffect(() => { applyAccent(accent); }, [accent]);
  useEffect(() => () => applyAccent(org.accent), [org.accent]);

  async function pickLogo(f: File) {
    if (!LOGO_TYPES.includes(f.type)) return setError('El logo debe ser PNG, JPG, WEBP o SVG');
    if (f.size > MAX_LOGO) return setError('El logo debe pesar menos de 200 KB');
    setError('');
    setLogo(await readAsDataUrl(f));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const saved = await run(() => api<Org>('/api/org', { method: 'PUT', body: { name, accent, logo } }));
    if (saved) { toast('Marca de la empresa actualizada'); onSaved(saved); }
  }

  const variants = accentVariants(accent);

  return (
    <>
      <PageHeader title="Empresa" meta="Cómo ve tu equipo la plataforma: nombre, logo y color" />
      <div className="settings-grid">
        <Panel title="Marca">
          <form className="panel-body stack" onSubmit={save}>
            <Field label="Nombre de la empresa">
              <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </Field>

            <div className="field">
              <span>Logo</span>
              <div className="logo-row">
                {logo ? <img className="logo-preview" src={logo} alt="Logo actual" /> : <span className="logo-preview empty">Sin logo</span>}
                <label className="btn">
                  <ImageUp size={16} strokeWidth={1.5} />
                  {logo ? 'Cambiar' : 'Subir logo'}
                  <input type="file" accept={LOGO_TYPES.join(',')} className="sr"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); e.target.value = ''; }} />
                </label>
                {logo && <Button variant="ghost" icon={Trash2} onClick={() => setLogo(null)}>Quitar</Button>}
              </div>
              <small className="hint">Cuadrado, PNG o SVG, hasta 200 KB</small>
            </div>

            <div className="field">
              <span>Color de marca</span>
              <div className="swatches" role="radiogroup" aria-label="Color de marca">
                {PRESET_ACCENTS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={accent === c} aria-label={c}
                    className={cx('swatch', accent === c && 'on')} style={{ background: c }} onClick={() => setAccent(c)} />
                ))}
                <label className={cx('swatch custom', accent && !PRESET_ACCENTS.includes(accent) && 'on')} title="Otro color">
                  <input type="color" value={accent ?? '#0f766e'} onChange={(e) => setAccent(e.target.value)} aria-label="Elegir otro color" />
                </label>
                <Button size="sm" variant="ghost" onClick={() => setAccent(null)} disabled={!accent}>Predeterminado</Button>
              </div>
              <small className="hint">Se ajusta solo para leerse bien en tema claro ({variants.light}) y oscuro ({variants.dark})</small>
            </div>

            <FormError>{error}</FormError>
            <div><Button type="submit" variant="primary" loading={busy} loadingText="Guardando…">Guardar cambios</Button></div>
          </form>
        </Panel>

        <div className="stack">
          <Panel title="Vista previa">
            <div className="panel-body brand-preview">
              <OrgBrand name={name || org.name} logo={logo} />
              <div className="preview-row">
                <span className="nav-item active"><span className="label">Testcontrol</span><span className="count">6</span></span>
                <Button variant="primary" size="sm">Nuevo recurso</Button>
              </div>
              <span className="pw shown"><PasswordText value="Kq7#vXm2-Lpw9Rz" /></span>
            </div>
          </Panel>
          <Panel title="Acceso del equipo">
            <div className="panel-body stack">
              <p className="sec">Tu equipo entra con este código de empresa, su usuario y su contraseña</p>
              <div className="code-row">
                <code>{org.slug}</code>
                <CopyButton value={org.slug} label="Copiar código" done="Código copiado" />
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
