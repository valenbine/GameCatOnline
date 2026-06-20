import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { coverUploadSingle, romUploadSingle } from '../config/upload.js';
import { ADMIN_COOKIE_NAME, requireAdmin } from '../middlewares/requireAdmin.js';
import { bulkPinGamesToTop, bulkUpdateGameStatus, createGame, deleteGame, listAllGames, pinGameToTop, serializeGame, serializeGames, updateGame, updateGameCoverCapture } from '../services/gameRepository.js';
import type { CoverCaptureStatus, GameRecord } from '../services/gameRepository.js';

type AdminStatusFilter = 'all' | GameRecord['status'];
type AdminSortMode = 'updated-desc' | 'sort-desc' | 'title-asc';

type CreateGameBody = {
  title?: string;
  description?: string;
  controlsHelp?: string;
  platform?: GameRecord['platform'];
  coverPath?: string;
  coverCaptureScore?: number;
  coverCaptureStatus?: CoverCaptureStatus;
  coverCaptureError?: string;
  romPath?: string;
  biosPath?: string;
  status?: 'draft' | 'published';
  sortOrder?: number;
};

type CaptureCoverBody = {
  imageDataUrl?: string;
};

type BulkGameActionBody = {
  ids?: number[];
  action?: 'feature' | 'publish' | 'draft';
};

type CoverCaptureReportBody = {
  coverCaptureScore?: number;
  coverCaptureStatus?: CoverCaptureStatus;
  coverCaptureError?: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const coverUploadDir = path.resolve(__dirname, '../../uploads/covers');

export const adminRouter = Router();

const pageSizes = new Set([10, 20, 50, 100]);

function getGamesQuery(query: Record<string, unknown>) {
  const page = Number(query.page ?? 1);
  const requestedPageSize = Number(query.pageSize ?? 10);
  const status: AdminStatusFilter = query.status === 'published' || query.status === 'draft' ? query.status : 'all';
  const sort: AdminSortMode = query.sort === 'sort-desc' || query.sort === 'title-asc' ? query.sort : 'updated-desc';

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: pageSizes.has(requestedPageSize) ? requestedPageSize : 10,
    search: typeof query.search === 'string' ? query.search : '',
    status,
    sort,
  };
}

function parseGameIds(ids: unknown) {
  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);
}

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

adminRouter.get('/games', requireAdmin, (req, res) => {
  const result = listAllGames(getGamesQuery(req.query));
  res.json({
    success: true,
    data: {
      items: serializeGames(result.items),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    },
  });
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
      controlsHelp: body.controlsHelp ?? '',
      platform: body.platform ?? 'nes',
      coverPath: body.coverPath ?? '',
      coverCaptureScore: Number(body.coverCaptureScore ?? 0),
      coverCaptureStatus: body.coverCaptureStatus ?? 'unknown',
      coverCaptureError: body.coverCaptureError ?? '',
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
      controlsHelp: body.controlsHelp,
      platform: body.platform,
      coverPath: body.coverPath,
      coverCaptureScore: body.coverCaptureScore === undefined ? undefined : Number(body.coverCaptureScore),
      coverCaptureStatus: body.coverCaptureStatus,
      coverCaptureError: body.coverCaptureError,
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

adminRouter.post('/games/bulk', requireAdmin, (req, res) => {
  const body = req.body as BulkGameActionBody;
  const ids = parseGameIds(body.ids);

  if (ids.length === 0) {
    res.status(400).json({ success: false, message: '请至少选择一款游戏' });
    return;
  }

  try {
    const games = body.action === 'feature' ? bulkPinGamesToTop(ids) : body.action === 'publish' ? bulkUpdateGameStatus(ids, 'published') : body.action === 'draft' ? bulkUpdateGameStatus(ids, 'draft') : null;

    if (!games) {
      res.status(400).json({ success: false, message: '批量操作类型无效' });
      return;
    }

    res.json({
      success: true,
      data: {
        count: games.length,
        items: serializeGames(games),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '批量操作失败';
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

adminRouter.post('/games/:id/cover-report', requireAdmin, (req, res) => {
  const body = req.body as CoverCaptureReportBody;

  try {
    const game = updateGameCoverCapture(Number(req.params.id), {
      coverCaptureScore: body.coverCaptureScore === undefined ? undefined : Number(body.coverCaptureScore),
      coverCaptureStatus: body.coverCaptureStatus,
      coverCaptureError: body.coverCaptureError,
    });
    res.json({ success: true, data: serializeGame(game) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '封面记录更新失败';
    res.status(400).json({ success: false, message });
  }
});

adminRouter.post('/upload/rom', requireAdmin, romUploadSingle, (req, res) => {
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

adminRouter.post('/upload/cover', requireAdmin, coverUploadSingle, (req, res) => {
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
