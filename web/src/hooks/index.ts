import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from '../lib/api';

const MOBILE_QUERY = '(max-width: 820px)';

/** true en pantallas de teléfono (misma medida que el CSS móvil) */
export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const h = () => setMobile(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return mobile;
}

/**
 * Envuelve una acción asíncrona con estado de carga y error.
 * `run` devuelve undefined si falló; el mensaje queda en `error`.
 */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}

/** Atajo de teclado global que se ignora mientras se escribe en un campo (salvo con Ctrl/⌘). */
export function useHotkey(match: (e: KeyboardEvent) => boolean, handler: () => void) {
  const ref = useRef({ match, handler });
  ref.current = { match, handler };
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName);
      if (typing && !e.ctrlKey && !e.metaKey) return;
      if (ref.current.match(e)) {
        e.preventDefault();
        ref.current.handler();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
}

/** Cierra la sesión tras `minutes` sin actividad. */
export function useIdle(minutes: number, onIdle: () => void) {
  const last = useRef(Date.now());
  useEffect(() => {
    const bump = () => { last.current = Date.now(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (Date.now() - last.current > minutes * 60_000) onIdle(); }, 15_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [minutes, onIdle]);
}

/** Bloquea el scroll del fondo y cierra con Escape mientras una capa está abierta. */
let openLayers = 0;
export function useLayer(onClose: () => void) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current(); };
    window.addEventListener('keydown', h);
    openLayers++;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      if (--openLayers === 0) document.body.style.overflow = '';
    };
  }, []);
}
