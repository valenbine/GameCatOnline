import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'node:fs';
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
const uploadsDir = path.resolve(__dirname, '../uploads');
const romUploadDir = path.join(uploadsDir, 'roms');
const emulatorCorePackageRoot = path.join('/usr/local/lib/node_modules', '@emulatorjs');
const emulatorCorePackageNames = [
  'core-fbalpha2012_cps1',
  'core-fbalpha2012_cps2',
  'core-fbneo',
  'core-gambatte',
  'core-genesis_plus_gx',
  'core-mame2003_plus',
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
app.get('/uploads/roms/:fileName', (req, res, next) => {
  const fileName = path.basename(req.params.fileName).replace(/[^a-zA-Z0-9-_.]/g, '-');
  const directPath = path.join(romUploadDir, fileName);

  if (fs.existsSync(directPath)) {
    res.sendFile(directPath);
    return;
  }

  const matchingFiles = fs
    .readdirSync(romUploadDir)
    .filter((candidate) => candidate.endsWith(`-${fileName}`))
    .sort();
  const matchingFile = matchingFiles[matchingFiles.length - 1];

  if (!matchingFile) {
    next();
    return;
  }

  res.sendFile(path.join(romUploadDir, matchingFile));
});
app.use('/uploads', express.static(uploadsDir));
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
