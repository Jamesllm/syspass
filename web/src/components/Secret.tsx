import { ExternalLink } from 'lucide-react';
import { charKind } from '../lib/password';
import { typeInfo, type ResourceType } from '../lib/types';
import { CopyButton } from './Button';

/** Etiqueta de rack con LED: la firma de la app para IP, URL o ID. */
export function HostTag({ host, type }: { host: string; type: ResourceType }) {
  if (!host) return null;
  const isUrl = /^https?:\/\//i.test(host);
  return (
    <span className="host" title={host}>
      <span className="led" style={{ background: typeInfo(type).led }} />
      <span className="txt">{isUrl ? host.replace(/^https?:\/\//i, '').replace(/\/$/, '') : host}</span>
      <CopyButton value={host} label="Copiar host" done="Host copiado" />
      {isUrl && (
        <a className="icon-btn" href={host} target="_blank" rel="noopener noreferrer" aria-label="Abrir enlace" title="Abrir enlace">
          <ExternalLink size={16} strokeWidth={1.5} />
        </a>
      )}
    </span>
  );
}

/** Contraseña en mono con dígitos y símbolos teñidos, como se lee en una consola. */
export function PasswordText({ value }: { value: string }) {
  return (
    <>
      {[...value].map((c, i) => {
        const k = charKind(c);
        return k === 'l' ? c : <span key={i} className={k}>{c}</span>;
      })}
    </>
  );
}
