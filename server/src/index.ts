import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db/database.js';
import { adminRouter } from './routes/adminRouter.js';
import { gamesRouter } from './routes/gamesRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '../..');
const clientDistDir = path.join(workspaceRoot, 'client', 'dist');
const emulatorDataDir = path.join(workspaceRoot, 'node_modules', '@emulatorjs', 'emulatorjs', 'data');
const emulatorCorePackageRoot = path.join('/usr/local/lib/node_modules', '@emulatorjs');
const emulatorCorePackageNames = [
  'core-fbneo',
  'core-gambatte',
  'core-genesis_plus_gx',
  'core-mednafen_pce',
  'core-mgba',
  'core-nestopia',
  'core-snes9x',
];
const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/emulatorjs/data', express.static(emulatorDataDir));
for (const corePackageName of emulatorCorePackageNames) {
  app.use('/emulatorjs/data/cores', express.static(path.join(emulatorCorePackageRoot, corePackageName)));
}

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/games', gamesRouter);
app.use('/api/admin', adminRouter);

app.use(express.static(clientDistDir));

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (!error) {
    next();
    return;
  }

  if (typeof error === 'object' && error && 'type' in error && error.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: '截图图片过大，请重试或调整截图方案' });
    return;
  }

  if (typeof error === 'object' && error && 'status' in error && typeof error.status === 'number' && 'message' in error) {
    res.status(error.status).json({ success: false, message: String(error.message) });
    return;
  }

  next(error);
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path.startsWith('/emulatorjs/data/')) {
    next();
    return;
  }

  res.sendFile(path.join(clientDistDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`server listening on http://localhost:${port}`);
});
