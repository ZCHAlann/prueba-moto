// lib/native-notify.ts
// ─────────────────────────────────────────────────────────────────────
// Helper para enviar notificaciones nativas del browser (estilo Chrome
// "esta página quiere enviarte notificaciones"). El permiso se pide
// LA PRIMERA VEZ que se llama `requestPermissionAndNotify()`; si el
// usuario lo denegó, las llamadas siguientes son no-ops silenciosas.
//
// Si el browser no soporta la Notification API (ej. Safari viejo),
// también es no-op — ApliSmart sigue mostrando el toast in-page.
//
// No nos logueamos en localStorage: la decisión de permiso es del
// usuario y vive en el browser; si se limpia, se vuelve a pedir.
// ─────────────────────────────────────────────────────────────────────

type Detail = {
  title: string;
  body?: string;
  /** URL del icono a mostrar en la notificación nativa. */
  icon?: string;
  /** Texto de la etiqueta (visible en algunas versiones de Chrome). */
  tag?: string;
  /** Si true, al hacer click la pestaña vuelve al frente y se navega a `url`. */
  url?: string;
};

function getNS(): typeof Notification | null {
  if (typeof window === 'undefined') return null;
  // El browser puede definir Notification en window directamente o
  // exigirla a través de WebKit (Safari viejo). Cubre ambos casos.
  if ('Notification' in window) return (window as any).Notification;
  return null;
}

/** Estado del permiso: "granted" | "denied" | "default" | "unsupported". */
export function permissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
  const NS = getNS();
  if (!NS) return 'unsupported';
  return NS.permission as 'granted' | 'denied' | 'default';
}

/**
 * Pide permiso si hace falta. Devuelve el estado final.
 * - Si ya está granted → devuelve "granted" sin molestar.
 * - Si ya está denied → devuelve "denied" sin repreguntar.
 * - Si está default → dispara el prompt del browser.
 */
export async function ensurePermission(): Promise<ReturnType<typeof permissionState>> {
  const NS = getNS();
  if (!NS) return 'unsupported';
  if (NS.permission === 'granted' || NS.permission === 'denied') {
    return NS.permission;
  }
  try {
    const result = await NS.requestPermission();
    return result as 'granted' | 'denied';
  } catch {
    return 'denied';
  }
}

/**
 * Envía una notificación nativa si el permiso está granted y el browser
 * lo soporta. Si no, es no-op.
 *
 * Si llega una notificación con `tag` igual al de una ya visible, el
 * browser la reemplaza (no acumula spam).
 */
export function nativeNotify(detail: Detail): void {
  const NS = getNS();
  if (!NS || NS.permission !== 'granted') return;
  try {
    const n = new NS(detail.title, {
      body: detail.body ?? '',
      icon: detail.icon ?? '/images/logo/logo-icon.png',
      tag: detail.tag,
      // Chrome exige "silent: false" para que la notificación nativa del SO
      // haga su propio sonido. El sonido interno se reproduce por separado
      // (WebAudio / HTMLAudio) para que también suene si el browser no
      // hace ruido por algún motivo.
      silent: false,
    });
    if (detail.url) {
      n.onclick = () => {
        try {
          window.focus();
        } catch {}
        if (detail.url) {
          try {
            window.location.assign(detail.url);
          } catch {}
        }
        try {
          n.close();
        } catch {}
      };
    }
    // Autocierre en 8 segundos (algunos OS no cierran por sí mismos).
    setTimeout(() => {
      try {
        n.close();
      } catch {}
    }, 8000);
  } catch (err) {
    // Si falla la creación (raro: políticas, foco perdido, etc.), silencioso.
    // eslint-disable-next-line no-console
    console.warn('[nativeNotify] create falló:', err);
  }
}

/**
 * Beep corto vía WebAudio (no necesita archivo .wav). Se usa cuando
 * llega una notificación in-page y como acompañamiento a la nativa.
 */
export function playBeep(): void {
  if (typeof window === 'undefined') return;
  try {
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1318, ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    o.start();
    o.stop(ctx.currentTime + 0.34);
    // Limpia el contexto después de reproducir.
    setTimeout(() => {
      try { ctx.close(); } catch {}
    }, 600);
  } catch {
    // Si WebAudio no está disponible (HTTPS raro), fallback a <audio>.
    try {
      const audio = new Audio('/sounds/notification.wav');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }
}
