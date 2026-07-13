import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import authRouter from './routes/auth';
import platformRouter from './routes/platform/index';
import companyRouter from './routes/company/index';
import uploadRouter from './routes/upload';
import oilCheckRouter from './routes/oil-check';
import publicRouter from './routes/public';
import { errorHandler } from './middlewares/errorHandler';
import { sanitizeRequest } from './middlewares/sanitize';
import { rateLimitDefault } from './middlewares/rateLimit';
import cookieParser from "cookie-parser";
import { join } from 'path';

const app = express();

// ─── Trust proxy ──────────────────────────────────────────────────────────────
// En producción el backend corre detrás de un proxy (nginx / fly.io / load
// balancer). Esto hace que req.ip refleje la IP real del cliente en vez de
// la del proxy. SIN esto, express-rate-limit agruparía a TODOS los
// usuarios detrás del proxy en una sola key (todos se bloquearían al
// primer match). Importante: usar '1' (confiar en 1 hop) o configurar
// explícitamente las IPs de proxies conocidos para no aceptar X-Forwarded-For
// arbitrarios (riesgo de spoofing).
app.set('trust proxy', 1);

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));
app.use(cookieParser());

// Compresión gzip de responses JSON. Reduce ~70% el ancho de banda en
// listados grandes (mantenimientos, combustibles, reportes). El threshold
// de 1 KB evita comprimir responses minúsculos (no vale la pena el CPU).
// NO comprime uploads ni streams binarios (esos ya están comprimidos).
// Lo ubicamos DESPUÉS de morgan para que los logs muestren el tamaño real
// (sin Content-Encoding) y ANTES de las routes para que aplique a todo.
app.use(compression({
  level: 6,                  // balance entre CPU y ratio (1=rápido, 9=máx ratio)
  threshold: 1024,           // solo responses ≥ 1 KB
  filter: (req, res) => {
    // No comprimir si el cliente no acepta gzip
    if (!req.headers['accept-encoding']?.includes('gzip')) return false;
    // No comprimir responses binarios (ya vienen comprimidos: jpg/png/mp4)
    const ct = res.getHeader('Content-Type');
    if (typeof ct === 'string' && /^(image|video|audio)\//i.test(ct)) return false;
    return compression.filter(req, res); // default filter
  },
}));

// Sanitización global — bloquea XSS / SQLi / code-execution en TODOS los requests
app.use(sanitizeRequest);

// ─── Static files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(
  process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads')
));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
// /public es público (sin auth) — sirve datos a la landing page
app.use('/public', publicRouter);
app.use('/platform', platformRouter);
app.use('/company/:id', companyRouter);
app.use('/upload', uploadRouter);
app.use('/oil-check', oilCheckRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Prometheus-style metrics (texto plano, scrapeable por Prometheus/Grafana).
import { renderMetrics } from './lib/ai/metrics';
app.get('/metrics', (_req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4');
  res.send(renderMetrics());
});

// WebSocket stats (debug) — cuántas conexiones hay, agrupadas por empresa
app.get('/ws-stats', (_req, res) => {
  // lazy import para evitar ciclo
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { wsStats } = require('./services/websocket') as typeof import('./services/websocket');
  res.json(wsStats());
});

// Rate-limit "default" para endpoints sueltos (oil-check, /health, /metrics,
// /ws-stats). 120/min por (user+IP). NOTA: va DESPUÉS de las routes para
// no aplicar dos veces a las routes que ya tienen su propio limitador
// (auth/upload/public/company/platform). /health y /metrics quedan
// excluidos implícitamente porque ya respondieron antes de llegar acá.
// oil-check SÍ pasa por acá y queda cubierto.
app.use(rateLimitDefault);


// ─── Error handler (siempre al final) ─────────────────────────────────────────
app.use(errorHandler);

export default app;