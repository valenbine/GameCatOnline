import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { coverUpload, romUpload } from '../config/upload.js';
import { ADMIN_COOKIE_NAME, requireAdmin } from '../middlewares/requireAdmin.js';
import { createGame, deleteGame, listAllGames, pinGameToTop, serializeGame, serializeGames, updateGame } from '../services/gameRepository.js';
import type { GameRecord } from '../services/gameRepository.js';

type CreateGameBody = {
  title?: string;
  description?: string;
  platform?: GameRecord['platform'];
  coverPath?: string;
  romPath?: string;
  biosPath?: string;
  status?: 'draft' | 'published';
  sortOrder?: number;
};

type CaptureCoverBody = {
  imageDataUrl?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coverUploadDir = path.resolve(__dirname, '../../uploads/covers');

export const adminRouter = Router();

adminRouter.get('/session', (req, res) => {
  const authenticated = req.cookies[ADMIN_COOKIE_NAME] === 'active';
  res.json({ success: true, data: { authenticated } });
});

adminRouter.post('/session', (req, res) => {
  const { password } = req.body as { password?: string };

  if (!password || password !== (process.env.ADMIN_PASSWORD ?? 'admin123')) {
    res.status(401).json({ success: false, message: '管理员密码错误' });
    return;
  }

  res.cookie(ADMIN_COOKIE_NAME, 'active', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8,
  });

  res.json({ success: true, data: { authenticated: true } });
});

adminRouter.post('/logout', (_req, res) => {
  res.clearCookie(ADMIN_COOKIE_NAME);
  res.json({ success: true, data: { authenticated: false } });
});

adminRouter.get('/games', requireAdmin, (_req, res) => {
  res.json({ success: true, data: serializeGames(listAllGames()) });
});

adminRouter.post('/games', requireAdmin, (req, res) => {
  const body = req.body as CreateGameBody;

  if (!body.title || !body.romPath) {
    res.status(400).json({ success: false, message: '标题和 ROM 文件必填' });
    return;
  }

  try {
    const game = createGame({
      title: body.title,
      description: body.description ?? '',
      platform: body.platform ?? 'nes',
      coverPath: body.coverPath ?? '',
      romPath: body.romPath,
      biosPath: body.biosPath ?? '',
      status: body.status ?? 'draft',
      sortOrder: Number(body.sortOrder ?? 0),
    });

    res.status(201).json({ success: true, data: game });
  } catch (error) {
    const message = error instanceof Error ? error.message : '创建游戏失败';
    res.status(400).json({ success: false, message });
  }
});

adminRouter.put('/games/:id', requireAdmin, (req, res) => {
  const body = req.body as CreateGameBody;

  try {
    const game = updateGame(Number(req.params.id), {
      title: body.title,
      description: body.description,
      platform: body.platform,
      coverPath: body.coverPath,
      romPath: body.romPath,
      biosPath: body.biosPath,
      status: body.status,
      sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
    });

    res.json({ success: true, data: serializeGame(game) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新游戏失败';
    res.status(400).json({ success: false, message });
  }
});

adminRouter.post('/games/:id/pin', requireAdmin, (req, res) => {
  try {
    const game = pinGameToTop(Number(req.params.id));
    res.json({ success: true, data: serializeGame(game) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '置顶游戏失败';
    res.status(400).json({ success: false, message });
  }
});

adminRouter.delete('/games/:id', requireAdmin, (req, res) => {
  try {
    const game = deleteGame(Number(req.params.id));
    res.json({ success: true, data: serializeGame(game) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除游戏失败';
    res.status(400).json({ success: false, message });
  }
});

adminRouter.post('/upload/rom', requireAdmin, romUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'ROM 文件上传失败' });
    return;
  }

  res.json({
    success: true,
    data: {
      path: `/uploads/roms/${req.file.filename}`,
      filename: req.file.originalname,
    },
  });
});

adminRouter.post('/capture-cover', requireAdmin, (req, res) => {
  const body = req.body as CaptureCoverBody;
  if (!body.imageDataUrl || !body.imageDataUrl.startsWith('data:image/png;base64,')) {
    res.status(400).json({ success: false, message: '截图数据无效' });
    return;
  }

  const fileName = `${Date.now()}-generated-cover.png`;
  const filePath = path.join(coverUploadDir, fileName);

  try {
    const base64 = body.imageDataUrl.replace('data:image/png;base64,', '');
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
    res.json({
      success: true,
      data: {
        path: `/uploads/covers/${fileName}`,
        filename: fileName,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : '保存封面失败' });
  }
});

adminRouter.post('/upload/cover', requireAdmin, coverUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '封面上传失败' });
    return;
  }

  res.json({
    success: true,
    data: {
      path: `/uploads/covers/${req.file.filename}`,
      filename: req.file.originalname,
    },
  });
});
