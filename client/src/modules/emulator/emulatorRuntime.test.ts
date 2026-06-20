import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultKeyBindings } from './keyBindings';
import { createEmulatorConfig } from './emulatorRuntime';
import type { Game } from '../../types/game';

function createGame(platform: Game['platform']): Game {
  return {
    id: 1,
    title: 'Test Game',
    slug: 'test-game',
    description: '',
    controlsHelp: '',
    platform,
    coverUrl: '',
    coverCaptureScore: 0,
    coverCaptureStatus: 'unknown',
    coverCaptureError: '',
    romUrl: '/uploads/roms/test.zip',
    biosUrl: '',
    status: 'published',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
  };
}

test('createEmulatorConfig maps MAME platform to mame2003_plus', () => {
  const config = createEmulatorConfig(createGame('mame'), '#player', getDefaultKeyBindings('mame')) as {
    system: string;
    defaultOptions: { retroarch_core: string };
  };

  assert.equal(config.system, 'arcade');
  assert.equal(config.defaultOptions.retroarch_core, 'mame2003_plus');
});

test('createEmulatorConfig maps CPS1 platform to dedicated core', () => {
  const config = createEmulatorConfig(createGame('cps1'), '#player', getDefaultKeyBindings('cps1')) as {
    defaultOptions: { retroarch_core: string };
  };

  assert.equal(config.defaultOptions.retroarch_core, 'fbalpha2012_cps1');
});
