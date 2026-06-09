import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRouter from './routes/auth';
import platformRouter from './routes/platform/index';
import companyRouter from './routes/company/index';
import uploadRouter from './routes/upload';
import oilCheckRouter from './routes/oil-check';
import { errorHandler } from './middlewares/errorHandler';
import { sanitizeRequest } from './middlewares/sanitize';
import cookieParser from "cookie-parser";
import { join } from 'path';

const app = express();

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('combined'));
app.use(cookieParser());

// Sanitización global — bloquea XSS / SQLi / code-execution en TODOS los requests
app.use(sanitizeRequest);

// ─── Static files ─────────────────────────────────────────────────────────────
app.use('/uploads', express.static(
  process.env.UPLOAD_DIR ?? join(process.cwd(), '..', '..', 'uploads')
));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/platform', platformRouter);
app.use('/company/:id', companyRouter);
app.use('/upload', uploadRouter);
app.use('/oil-check', oilCheckRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});


// ─── Error handler (siempre al final) ─────────────────────────────────────────
app.use(errorHandler);

export default app;