import { database } from '../db/database.js';

export type GameRecord = {
  id: number;
  title: string;
  slug: string;
  description: string;
  platform: 'nes' | 'arcade' | 'snes' | 'gba' | 'gb' | 'gbc' | 'segaMD' | 'pce';
  cover_path: string;
  rom_path: string;
  bios_path: string;
  status: 'draft' | 'published';
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type GameInput = {
  title: string;
  slug?: string;
  description: string;
  platform: GameRecord['platform'];
  coverPath: string;
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
    platform: game.platform,
    coverUrl: game.cover_path,
    romUrl: game.rom_path,
    biosUrl: game.bios_path,
    status: game.status,
    sortOrder: game.sort_order,
    createdAt: game.created_at,
    updatedAt: game.updated_at,
  };
}

export function listPublishedGames() {
  const statement = database.prepare(`
    SELECT *
    FROM games
    WHERE status = 'published'
    ORDER BY sort_order DESC, id DESC
  `);

  return statement.all() as GameRecord[];
}

export function listAllGames() {
  const statement = database.prepare(`
    SELECT *
    FROM games
    ORDER BY sort_order DESC, id DESC
  `);

  return statement.all() as GameRecord[];
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

export function createGame(input: GameInput) {
  const now = new Date().toISOString();
  const slug = buildUniqueSlug(slugifyTitle(input.slug ?? input.title));
  const statement = database.prepare(`
    INSERT INTO games (
      title,
      slug,
      description,
      platform,
      cover_path,
      rom_path,
      bios_path,
      status,
      sort_order,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    input.title,
    slug,
    input.description,
    input.platform,
    input.coverPath,
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
    platform: input.platform ?? existing.platform,
    coverPath: input.coverPath ?? existing.cover_path,
    romPath: input.romPath ?? existing.rom_path,
    biosPath: input.biosPath ?? existing.bios_path,
    status: input.status ?? existing.status,
    sortOrder: input.sortOrder ?? existing.sort_order,
  };

  database
    .prepare(`
      UPDATE games
      SET title = ?, slug = ?, description = ?, platform = ?, cover_path = ?, rom_path = ?, bios_path = ?, status = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      next.title,
      next.slug,
      next.description,
      next.platform,
      next.coverPath,
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

export function serializeGame(game: GameRecord) {
  return mapGame(game);
}

export function serializeGames(games: GameRecord[]) {
  return games.map(mapGame);
}
