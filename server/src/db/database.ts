import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.resolve(__dirname, '../../data');

fs.mkdirSync(dataDir, { recursive: true });

export const database = new DatabaseSync(path.join(dataDir, 'game-cat-online.db'));

database.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    controls_help TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT 'nes',
    cover_path TEXT NOT NULL DEFAULT '',
    cover_capture_score REAL NOT NULL DEFAULT 0,
    cover_capture_status TEXT NOT NULL DEFAULT 'unknown',
    cover_capture_error TEXT NOT NULL DEFAULT '',
    rom_path TEXT NOT NULL DEFAULT '',
    bios_path TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const columns = database.prepare('PRAGMA table_info(games)').all() as { name: string }[];
const columnNames = new Set(columns.map((column) => column.name));

if (!columnNames.has('platform')) {
  database.exec("ALTER TABLE games ADD COLUMN platform TEXT NOT NULL DEFAULT 'nes'");
}

if (!columnNames.has('bios_path')) {
  database.exec("ALTER TABLE games ADD COLUMN bios_path TEXT NOT NULL DEFAULT ''");
}

if (!columnNames.has('controls_help')) {
  database.exec("ALTER TABLE games ADD COLUMN controls_help TEXT NOT NULL DEFAULT ''");
}

if (!columnNames.has('cover_capture_score')) {
  database.exec("ALTER TABLE games ADD COLUMN cover_capture_score REAL NOT NULL DEFAULT 0");
}

if (!columnNames.has('cover_capture_status')) {
  database.exec("ALTER TABLE games ADD COLUMN cover_capture_status TEXT NOT NULL DEFAULT 'unknown'");
}

if (!columnNames.has('cover_capture_error')) {
  database.exec("ALTER TABLE games ADD COLUMN cover_capture_error TEXT NOT NULL DEFAULT ''");
}

database.exec('CREATE INDEX IF NOT EXISTS idx_games_status_updated_at ON games(status, updated_at DESC, id DESC)');
database.exec('CREATE INDEX IF NOT EXISTS idx_games_status_sort_order ON games(status, sort_order DESC, id DESC)');
database.exec('CREATE INDEX IF NOT EXISTS idx_games_title_nocase ON games(title COLLATE NOCASE)');
database.exec('CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform)');
