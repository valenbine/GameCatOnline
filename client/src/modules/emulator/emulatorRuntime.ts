import type { Game } from '../../types/game';
import { createDefaultControllers, type PlayerKeyBindings } from './keyBindings';

export type EmulatorJsInstance = {
  on?: (event: string, callback: () => void) => void;
  elements?: {
    parent?: HTMLElement;
  };
  gameManager: {
    getState: () => Uint8Array;
    loadState: (state: Uint8Array) => void;
    restart: () => void;
    screenshot: () => Promise<Uint8Array>;
    simulateInput: (player: number, index: number, value: number) => void;
  };
  displayMessage?: (message: string, duration?: number) => void;
  pause?: () => void;
  play?: () => void;
  paused?: boolean;
};

export type ClosableEmulatorJsInstance = EmulatorJsInstance & {
  exit?: () => void;
  destroy?: () => void;
  stop?: () => void;
  pause?: () => void;
};

export type EmulatorJsRuntimeInstance = EmulatorJsInstance & {
  controls?: Record<number, Record<number, { value?: number; value2?: string }>>;
  defaultControllers?: Record<number, Record<number, { value?: number; value2?: string }>>;
  __gameCatLifecycleLogsAttached?: boolean;
  __gameCatRunningAttached?: boolean;
  __gameCatStartListenerAttached?: boolean;
  saveSettings?: () => void;
  getLocalStorageKey?: () => string;
};

export type EmulatorJsWindow = Window & typeof globalThis & {
  EmulatorJS?: new (element: string, config: Record<string, unknown>) => EmulatorJsInstance;
  EJS_player?: string;
  EJS_core?: string;
  EJS_gameUrl?: string;
  EJS_gameName?: string;
  EJS_pathtodata?: string;
  EJS_startOnLoaded?: boolean;
  EJS_askBeforeExit?: boolean;
  EJS_noAutoFocus?: boolean;
  EJS_defaultOptions?: Record<string, string>;
  EJS_defaultControls?: Record<number, Record<string, { value: string }>>;
  EJS_emulator?: EmulatorJsInstance;
  EJS_onGameStart?: () => void;
  EJS_onLoadState?: () => void;
  EJS_onError?: (message: string) => void;
};

const emulatorAssetPrefix = '/emulatorjs/data';
const emulatorStyleId = 'emulatorjs-style';
const emulatorScriptIds = {
  emulator: 'emulatorjs-script-emulator',
  nipplejs: 'emulatorjs-script-nipplejs',
  shaders: 'emulatorjs-script-shaders',
  storage: 'emulatorjs-script-storage',
  gamepad: 'emulatorjs-script-gamepad',
  gameManager: 'emulatorjs-script-gamemanager',
  socketIo: 'emulatorjs-script-socketio',
  compression: 'emulatorjs-script-compression',
} as const;

export function getEmulatorSystem(game: Game) {
  const systemByPlatform: Record<Game['platform'], string> = {
    arcade: 'arcade',
    cps1: 'arcade',
    cps2: 'arcade',
    gb: 'gb',
    gba: 'gba',
    gbc: 'gb',
    mame: 'arcade',
    nes: 'nes',
    pce: 'pce',
    segaMD: 'segaMD',
    snes: 'snes',
  };

  return systemByPlatform[game.platform];
}

export function getRetroArchCore(game: Game) {
  const coreByPlatform: Record<Game['platform'], string> = {
    arcade: 'fbneo',
    cps1: 'fbalpha2012_cps1',
    cps2: 'fbalpha2012_cps2',
    gb: 'gambatte',
    gba: 'mgba',
    gbc: 'gambatte',
    mame: 'mame2003_plus',
    nes: 'nestopia',
    pce: 'mednafen_pce',
    segaMD: 'genesis_plus_gx',
    snes: 'snes9x',
  };

  return coreByPlatform[game.platform];
}

export function getCoreOptionSettings(game: Game): Record<string, string> {
  if (game.platform === 'arcade') {
    return {
      fbneo_neogeo_mode: 'MVS',
      'fbneo-allow-patched-romsets': 'enabled',
      'fbneo-vertical-mode': 'disabled',
    };
  }

  return {};
}

export function createEmulatorConfig(game: Game, playerSelector: string, keyBindings: PlayerKeyBindings) {
  return {
    gameUrl: game.romUrl,
    biosUrl: game.biosUrl || undefined,
    dataPath: '/emulatorjs/data/',
    disableLocalStorage: true,
    system: getEmulatorSystem(game),
    gameName: `game-${game.id}`,
    startOnLoad: true,
    noAutoFocus: false,
    defaultOptions: {
      retroarch_core: getRetroArchCore(game),
      ...getCoreOptionSettings(game),
    },
    defaultControllers: createDefaultControllers(keyBindings),
    alignStartButton: 'bottom',
    gameId: playerSelector,
  };
}

export function forceCloseActiveEmulator(host?: HTMLElement | null, targetWindow: EmulatorJsWindow = window as EmulatorJsWindow) {
  const emulatorWindow = targetWindow;
  const activeEmulator = emulatorWindow.EJS_emulator as ClosableEmulatorJsInstance | undefined;

  try {
    activeEmulator?.pause?.();
    activeEmulator?.stop?.();
    activeEmulator?.exit?.();
    activeEmulator?.destroy?.();
  } catch {
    // EmulatorJS cleanup can throw while a core is still booting.
  }

  if (host) {
    host.innerHTML = '';
  }

  delete emulatorWindow.EJS_onGameStart;
  delete emulatorWindow.EJS_onError;
  delete emulatorWindow.EJS_emulator;
  delete emulatorWindow.EJS_player;
  delete emulatorWindow.EJS_gameUrl;
  delete emulatorWindow.EJS_gameName;
}

export function attachLifecycleLogs(instance: EmulatorJsInstance, game: Game) {
  const runtimeInstance = instance as EmulatorJsRuntimeInstance;
  if (runtimeInstance.__gameCatLifecycleLogsAttached) {
    return;
  }

  runtimeInstance.__gameCatLifecycleLogsAttached = true;
  instance.on?.('ready', () => {
    console.log('[EmulatorPlayer] ready', { gameId: game.id, title: game.title });
  });
  instance.on?.('start', () => {
    console.log('[EmulatorPlayer] start', { gameId: game.id, title: game.title });
  });
}

function loadStyleOnce(targetWindow: Window, id: string, href: string) {
  return new Promise<void>((resolve, reject) => {
    const existingLink = targetWindow.document.getElementById(id) as HTMLLinkElement | null;
    if (existingLink) {
      if (existingLink.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existingLink.addEventListener('load', () => resolve(), { once: true });
      existingLink.addEventListener('error', () => reject(new Error(`资源加载失败: ${href}`)), { once: true });
      return;
    }

    const link = targetWindow.document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      link.dataset.loaded = 'true';
      resolve();
    };
    link.onerror = () => reject(new Error(`资源加载失败: ${href}`));
    targetWindow.document.head.appendChild(link);
  });
}

function loadScriptOnce(targetWindow: Window, id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existingScript = targetWindow.document.getElementById(id) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`资源加载失败: ${src}`)), { once: true });
      return;
    }

    const script = targetWindow.document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`资源加载失败: ${src}`));
    targetWindow.document.body.appendChild(script);
  });
}

export async function loadEmulatorAssets(targetWindow: Window = window) {
  await loadStyleOnce(targetWindow, emulatorStyleId, `${emulatorAssetPrefix}/emulator.css`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.emulator, `${emulatorAssetPrefix}/src/emulator.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.nipplejs, `${emulatorAssetPrefix}/src/nipplejs.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.shaders, `${emulatorAssetPrefix}/src/shaders.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.storage, `${emulatorAssetPrefix}/src/storage.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.gamepad, `${emulatorAssetPrefix}/src/gamepad.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.gameManager, `${emulatorAssetPrefix}/src/GameManager.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.socketIo, `${emulatorAssetPrefix}/src/socket.io.min.js`);
  await loadScriptOnce(targetWindow, emulatorScriptIds.compression, `${emulatorAssetPrefix}/src/compression.js`);
}
