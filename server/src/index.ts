import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
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
const emulatorNestopiaCoreDir = path.join('/usr/local/lib/node_modules', '@emulatorjs', 'core-nestopia');
const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));
app.use('/emulatorjs/data', express.static(emulatorDataDir));
app.use('/emulatorjs/data/cores', express.static(emulatorNestopiaCoreDir));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.use('/api/games', gamesRouter);
app.use('/api/admin', adminRouter);

app.use(express.static(clientDistDir));

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
