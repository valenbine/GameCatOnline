import { database } from '../db/database.js';

export type CoverCaptureStatus = 'unknown' | 'auto-ok' | 'needs-review' | 'failed' | 'manual';

export type GameRecord = {
  id: number;
  title: string;
  slug: string;
  description: string;
  controls_help: string;
  platform: 'nes' | 'arcade' | 'mame' | 'cps1' | 'cps2' | 'snes' | 'gba' | 'gb' | 'gbc' | 'segaMD' | 'pce';
  cover_path: string;
  cover_capture_score: number;
  cover_capture_status: CoverCaptureStatus;
  cover_capture_error: string;
  rom_path: string;
  bios_path: string;
  status: 'draft' | 'published';
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GameListOptions = {
  page: number;
  pageSize: number;
  search?: string;
  featuredOnly?: boolean;
  status?: 'all' | GameRecord['status'];
  sort?: 'updated-desc' | 'sort-desc' | 'title-asc';
};

export type PaginatedGames = {
  items: GameRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type GameInput = {
  title: string;
  slug?: string;
  description: string;
  controlsHelp: string;
  platform: GameRecord['platform'];
  coverPath: string;
  coverCaptureScore: number;
  coverCaptureStatus: CoverCaptureStatus;
  coverCaptureError: string;
  romPath: string;
  biosPath: string;
  status: 'draft' | 'published';
  sortOrder: number;
};

type GameUpdateInput = Partial<GameInput>;

function mapGame(game: GameRecord) {
  return {
    id: game.id,
    title: game.title,
    slug: game.slug,
    description: game.description,
    controlsHelp: game.controls_help,
    platform: game.platform,
    coverUrl: game.cover_path,
    coverCaptureScore: game.cover_capture_score,
    coverCaptureStatus: game.cover_capture_status,
    coverCaptureError: game.cover_capture_error,
    romUrl: game.rom_path,
    biosUrl: game.bios_path,
    status: game.status,
    sortOrder: game.sort_order,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

function buildListQuery(options: GameListOptions, publishedOnly: boolean) {
  const whereClauses: string[] = [];
  const params: Array<string | number> = [];

  if (publishedOnly) {
    whereClauses.push("status = 'published'");
  } else if (options.status && options.status !== 'all') {
    whereClauses.push('status = ?');
    params.push(options.status);
  }

  if (options.featuredOnly) {
    whereClauses.push('sort_order > 0');
  }

  const search = options.search?.trim();
  if (search) {
    whereClauses.push('(title LIKE ? OR description LIKE ? OR CAST(id AS TEXT) LIKE ?)');
    const keyword = `%${search}%`;
    params.push(keyword, keyword, keyword);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderSql = options.sort === 'title-asc' ? 'ORDER BY title COLLATE NOCASE ASC, id ASC' : options.sort === 'sort-desc' ? 'ORDER BY sort_order DESC, id DESC' : 'ORDER BY updated_at DESC, id DESC';

  return { whereSql, orderSql, params };
}

export function listPublishedGames(options: GameListOptions) {
  return listGames(options, true);
}

export function listAllGames(options: GameListOptions) {
  return listGames(options, false);
}

function listGames(options: GameListOptions, publishedOnly: boolean): PaginatedGames {
  const page = Math.max(1, options.page);
  const pageSize = Math.max(1, options.pageSize);
  const { whereSql, orderSql, params } = buildListQuery(options, publishedOnly);
  const total = (database.prepare(`SELECT COUNT(*) AS total FROM games ${whereSql}`).get(...params) as { total: number }).total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const safeOffset = (safePage - 1) * pageSize;

  const items = database
    .prepare(`
      SELECT *
      FROM games
      ${whereSql}
      ${orderSql}
      LIMIT ? OFFSET ?
    `)
    .all(...params, pageSize, safeOffset) as GameRecord[];

  return { items, total, page: safePage, pageSize, totalPages };
}

export function findPublishedGameById(id: number) {
  const statement = database.prepare(`
    SELECT *
    FROM games
    WHERE id = ? AND status = 'published'
    LIMIT 1
  `);

  return (statement.get(id) as GameRecord | undefined) ?? null;
}

function slugifyTitle(title: string) {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'game';
}

function buildUniqueSlug(baseSlug: string, excludedId?: number) {
  let nextSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = database.prepare('SELECT id FROM games WHERE slug = ? LIMIT 1').get(nextSlug) as { id: number } | undefined;
    if (!existing || existing.id === excludedId) {
      return nextSlug;
    }

    nextSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function normalizeGameIds(ids: number[]) {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

export function createGame(input: GameInput) {
  const now = new Date().toISOString();
  const slug = buildUniqueSlug(slugifyTitle(input.slug ?? input.title));
  const statement = database.prepare(`
    INSERT INTO games (
      title,
      slug,
      description,
      controls_help,
      platform,
      cover_path,
      cover_capture_score,
      cover_capture_status,
      cover_capture_error,
      rom_path,
      bios_path,
      status,
      sort_order,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    input.title,
    slug,
    input.description,
    input.controlsHelp,
    input.platform,
    input.coverPath,
    input.coverCaptureScore,
    input.coverCaptureStatus,
    input.coverCaptureError,
    input.romPath,
    input.biosPath,
    input.status,
    input.sortOrder,
    now,
    now,
  );

  const created = database
    .prepare('SELECT * FROM games WHERE id = ? LIMIT 1')
    .get(Number(result.lastInsertRowid)) as GameRecord;

  return created;
}

export function updateGame(id: number, input: GameUpdateInput) {
  const existing = database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord | undefined;

  if (!existing) {
    throw new Error('游戏不存在');
  }

  const next = {
    title: input.title ?? existing.title,
    slug: input.slug ? buildUniqueSlug(slugifyTitle(input.slug), id) : existing.slug,
    description: input.description ?? existing.description,
    controlsHelp: input.controlsHelp ?? existing.controls_help,
    platform: input.platform ?? existing.platform,
    coverPath: input.coverPath ?? existing.cover_path,
    coverCaptureScore: input.coverCaptureScore ?? existing.cover_capture_score,
    coverCaptureStatus: input.coverCaptureStatus ?? existing.cover_capture_status,
    coverCaptureError: input.coverCaptureError ?? existing.cover_capture_error,
    romPath: input.romPath ?? existing.rom_path,
    biosPath: input.biosPath ?? existing.bios_path,
    status: input.status ?? existing.status,
    sortOrder: input.sortOrder ?? existing.sort_order,
  };

  database
    .prepare(`
      UPDATE games
      SET title = ?, slug = ?, description = ?, controls_help = ?, platform = ?, cover_path = ?, cover_capture_score = ?, cover_capture_status = ?, cover_capture_error = ?, rom_path = ?, bios_path = ?, status = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      next.title,
      next.slug,
      next.description,
      next.controlsHelp,
      next.platform,
      next.coverPath,
      next.coverCaptureScore,
      next.coverCaptureStatus,
      next.coverCaptureError,
      next.romPath,
      next.biosPath,
      next.status,
      next.sortOrder,
      new Date().toISOString(),
      id,
    );

  return database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord;
}

export function deleteGame(id: number) {
  const existing = database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord | undefined;

  if (!existing) {
    throw new Error('游戏不存在');
  }

  database.prepare('DELETE FROM games WHERE id = ?').run(id);
  return existing;
}

export function pinGameToTop(id: number) {
  const existing = database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord | undefined;

  if (!existing) {
    throw new Error('游戏不存在');
  }

  const row = database.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM games').get() as { maxSortOrder: number };
  const nextSortOrder = Number(row.maxSortOrder) + 1;

  database
    .prepare(`
      UPDATE games
      SET sort_order = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(nextSortOrder, new Date().toISOString(), id);

  return database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord;
}

export function updateGameCoverCapture(
  id: number,
  input: {
    coverCaptureScore?: number;
    coverCaptureStatus?: CoverCaptureStatus;
    coverCaptureError?: string;
  },
) {
  const existing = database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord | undefined;

  if (!existing) {
    throw new Error('游戏不存在');
  }

  database
    .prepare(`
      UPDATE games
      SET cover_capture_score = ?, cover_capture_status = ?, cover_capture_error = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      input.coverCaptureScore ?? existing.cover_capture_score,
      input.coverCaptureStatus ?? existing.cover_capture_status,
      input.coverCaptureError ?? existing.cover_capture_error,
      new Date().toISOString(),
      id,
    );

  return database.prepare('SELECT * FROM games WHERE id = ? LIMIT 1').get(id) as GameRecord;
}

export function bulkUpdateGameStatus(ids: number[], status: GameRecord['status']) {
  const normalizedIds = normalizeGameIds(ids);
  if (normalizedIds.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  const placeholders = normalizedIds.map(() => '?').join(', ');
  database.prepare(`UPDATE games SET status = ?, updated_at = ? WHERE id IN (${placeholders})`).run(status, now, ...normalizedIds);
  return database.prepare(`SELECT * FROM games WHERE id IN (${placeholders}) ORDER BY id ASC`).all(...normalizedIds) as GameRecord[];
}

export function bulkPinGamesToTop(ids: number[]) {
  const normalizedIds = normalizeGameIds(ids);
  if (normalizedIds.length === 0) {
    return [];
  }

  const row = database.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxSortOrder FROM games').get() as { maxSortOrder: number };
  let nextSortOrder = Number(row.maxSortOrder);
  const updateStatement = database.prepare(`
    UPDATE games
    SET sort_order = ?, updated_at = ?
    WHERE id = ?
  `);
  const now = new Date().toISOString();

  for (const id of normalizedIds) {
    nextSortOrder += 1;
    updateStatement.run(nextSortOrder, now, id);
  }

  const placeholders = normalizedIds.map(() => '?').join(', ');
  return database.prepare(`SELECT * FROM games WHERE id IN (${placeholders}) ORDER BY sort_order DESC, id DESC`).all(...normalizedIds) as GameRecord[];
}

export function serializeGame(game: GameRecord) {
  return mapGame(game);
}

export function serializeGames(games: GameRecord[]) {
  return games.map(mapGame);
}
