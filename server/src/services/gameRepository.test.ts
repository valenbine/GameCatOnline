import assert from 'node:assert/strict';
import test from 'node:test';
import { serializeGame, type GameRecord } from './gameRepository.js';

test('serializeGame exposes cover capture metadata', () => {
  const serialized = serializeGame({
    id: 7,
    title: 'Cover Test',
    slug: 'cover-test',
    description: 'desc',
    controls_help: 'jump',
    platform: 'nes',
    cover_path: '/uploads/covers/test.png',
    cover_capture_score: 321.12,
    cover_capture_status: 'needs-review',
    cover_capture_error: 'score too low',
    rom_path: '/uploads/roms/test.nes',
    bios_path: '',
    status: 'published',
    sort_order: 3,
    created_at: '2026-06-17T00:00:00.000Z',
    updated_at: '2026-06-17T00:00:00.000Z',
  } satisfies GameRecord);

  assert.equal(serialized.coverCaptureScore, 321.12);
  assert.equal(serialized.coverCaptureStatus, 'needs-review');
  assert.equal(serialized.coverCaptureError, 'score too low');
  assert.equal(serialized.coverUrl, '/uploads/covers/test.png');
});
