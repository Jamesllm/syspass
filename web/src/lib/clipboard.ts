let clearTimer: ReturnType<typeof setTimeout> | undefined;

/** Copia texto. Si es secreto, intenta vaciar el portapapeles a los 30 s. */
export async function copyToClipboard(text: string, secret = false) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  if (secret) {
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => { navigator.clipboard?.writeText('').catch(() => {}); }, 30_000);
  }
}
