import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteGameState, listGameStates, loadGameState, saveGameState } from '../../services/saveStorage';
import type { Game } from '../../types/game';

type EmulatorPlayerProps = {
  game: Game;
};

type SaveSlot = {
  slot: number;
  updatedAt: string | null;
  screenshotDataUrl: string | null;
};

type TurboKey = 'p1a' | 'p1b' | 'p2a' | 'p2b';

export type EmulatorJsInstance = {
  on?: (event: string, callback: () => void) => void;
  gameManager: {
    getState: () => Uint8Array;
    loadState: (state: Uint8Array) => void;
    restart: () => void;
    screenshot: () => Promise<Uint8Array>;
    simulateInput: (player: number, index: number, value: number) => void;
  };
  displayMessage?: (message: string, duration?: number) => void;
};

type ClosableEmulatorJsInstance = EmulatorJsInstance & {
  exit?: () => void;
  destroy?: () => void;
  stop?: () => void;
  pause?: () => void;
};

type EmulatorJsRuntimeInstance = EmulatorJsInstance & {
  controls?: Record<number, Record<number, { value?: number; value2?: string }>>;
  defaultControllers?: Record<number, Record<number, { value?: number; value2?: string }>>;
  saveSettings?: () => void;
  getLocalStorageKey?: () => string;
};

const NES_BUTTON_B = 0;
const NES_BUTTON_A = 8;
const TURBO_INTERVAL_MS = 50;
const RESERVED_HOTKEY_BUTTONS = [24, 25, 26, 27, 28, 29] as const;
const PLAYER_ONE = 0;
const PLAYER_TWO = 1;

function getEmulatorSystem(game: Game) {
  const systemByPlatform: Record<Game['platform'], string> = {
    arcade: 'arcade',
    gb: 'gb',
    gba: 'gba',
    gbc: 'gb',
    nes: 'nes',
    pce: 'pce',
    segaMD: 'segaMD',
    snes: 'snes',
  };

  return systemByPlatform[game.platform];
}

function getRetroArchCore(game: Game) {
  const coreByPlatform: Record<Game['platform'], string> = {
    arcade: 'fbneo',
    gb: 'gambatte',
    gba: 'mgba',
    gbc: 'gambatte',
    nes: 'nestopia',
    pce: 'mednafen_pce',
    segaMD: 'genesis_plus_gx',
    snes: 'snes9x',
  };

  return coreByPlatform[game.platform];
}

function getPlatformLabel(platform: Game['platform']) {
  const labels: Record<Game['platform'], string> = {
    arcade: '街机 / FBNeo',
    gb: 'GB',
    gba: 'GBA',
    gbc: 'GBC',
    nes: 'FC / NES',
    pce: 'PCE',
    segaMD: 'MD / Genesis',
    snes: 'SFC / SNES',
  };

  return labels[platform];
}

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

function getRecentSlotStorageKey(gameId: number) {
  return `game-cat-online:recent-slot:${gameId}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export function pngBytesToDataUrl(bytes: Uint8Array) {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

export function createEmulatorConfig(game: Game, playerSelector: string) {
  return {
    gameUrl: game.romUrl,
    biosUrl: game.biosUrl || undefined,
    dataPath: '/emulatorjs/data/',
    system: getEmulatorSystem(game),
    gameName: `game-${game.id}`,
    startOnLoad: true,
    noAutoFocus: false,
    defaultOptions: {
      retroarch_core: getRetroArchCore(game),
    },
    defaultControllers: {
      0: {
        0: { value: 75 },
        2: { value: 16 },
        3: { value: 13 },
        4: { value: 87 },
        5: { value: 83 },
        6: { value: 65 },
        7: { value: 68 },
        8: { value: 74 },
        9: { value: 76 },
        10: { value: 79 },
        11: { value: 80 },
      },
      1: {
        0: { value: 98 },
        2: { value: 96 },
        3: { value: 13 },
        4: { value: 38 },
        5: { value: 40 },
        6: { value: 37 },
        7: { value: 39 },
        8: { value: 97 },
        9: { value: 99 },
        10: { value: 102 },
        11: { value: 103 },
      },
      2: {},
      3: {},
    },
    alignStartButton: 'bottom',
    gameId: playerSelector,
  };
}

export function stripReservedHotkeys(instance: EmulatorJsInstance) {
  const runtimeInstance = instance as EmulatorJsRuntimeInstance;

  for (const buttonIndex of RESERVED_HOTKEY_BUTTONS) {
    if (runtimeInstance.controls?.[0]?.[buttonIndex]) {
      delete runtimeInstance.controls[0][buttonIndex];
    }

    if (runtimeInstance.defaultControllers?.[0]?.[buttonIndex]) {
      delete runtimeInstance.defaultControllers[0][buttonIndex];
    }
  }

  const localStorageKey = runtimeInstance.getLocalStorageKey?.();
  if (localStorageKey) {
    const rawValue = window.localStorage.getItem(localStorageKey);
    if (rawValue) {
      try {
        const coreSpecific = JSON.parse(rawValue) as {
          controlSettings?: Record<number, Record<number, { value?: number; value2?: string }>>;
        };
        for (const buttonIndex of RESERVED_HOTKEY_BUTTONS) {
          if (coreSpecific.controlSettings?.[0]?.[buttonIndex]) {
            delete coreSpecific.controlSettings[0][buttonIndex];
          }
        }
        window.localStorage.setItem(localStorageKey, JSON.stringify(coreSpecific));
      } catch {
        window.localStorage.removeItem(localStorageKey);
      }
    }
  }

  runtimeInstance.saveSettings?.();
}

function attachLifecycleLogs(instance: EmulatorJsInstance, game: Game) {
  instance.on?.('ready', () => {
    console.log('[EmulatorPlayer] ready', { gameId: game.id, title: game.title });
  });
  instance.on?.('start', () => {
    console.log('[EmulatorPlayer] start', { gameId: game.id, title: game.title });
  });
}

function loadStyleOnce(id: string, href: string) {
  return new Promise<void>((resolve, reject) => {
    const existingLink = document.getElementById(id) as HTMLLinkElement | null;
    if (existingLink) {
      if (existingLink.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existingLink.addEventListener('load', () => resolve(), { once: true });
      existingLink.addEventListener('error', () => reject(new Error(`资源加载失败: ${href}`)), { once: true });
      return;
    }

    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => {
      link.dataset.loaded = 'true';
      resolve();
    };
    link.onerror = () => reject(new Error(`资源加载失败: ${href}`));
    document.head.appendChild(link);
  });
}

function loadScriptOnce(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(id) as HTMLScriptElement | null;
    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error(`资源加载失败: ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`资源加载失败: ${src}`));
    document.body.appendChild(script);
  });
}

export async function loadEmulatorAssets() {
  await loadStyleOnce(emulatorStyleId, `${emulatorAssetPrefix}/emulator.css`);
  await loadScriptOnce(emulatorScriptIds.emulator, `${emulatorAssetPrefix}/src/emulator.js`);
  await loadScriptOnce(emulatorScriptIds.nipplejs, `${emulatorAssetPrefix}/src/nipplejs.js`);
  await loadScriptOnce(emulatorScriptIds.shaders, `${emulatorAssetPrefix}/src/shaders.js`);
  await loadScriptOnce(emulatorScriptIds.storage, `${emulatorAssetPrefix}/src/storage.js`);
  await loadScriptOnce(emulatorScriptIds.gamepad, `${emulatorAssetPrefix}/src/gamepad.js`);
  await loadScriptOnce(emulatorScriptIds.gameManager, `${emulatorAssetPrefix}/src/GameManager.js`);
  await loadScriptOnce(emulatorScriptIds.socketIo, `${emulatorAssetPrefix}/src/socket.io.min.js`);
  await loadScriptOnce(emulatorScriptIds.compression, `${emulatorAssetPrefix}/src/compression.js`);
}

export function EmulatorPlayer({ game }: EmulatorPlayerProps) {
  const playerShellRef = useRef<HTMLElement | null>(null);
  const emulatorHostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<EmulatorJsInstance | null>(null);
  const turboIntervalsRef = useRef<Record<TurboKey, number | null>>({ p1a: null, p1b: null, p2a: null, p2b: null });
  const [status, setStatus] = useState('正在加载模拟器...');
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [slotDialogMode, setSlotDialogMode] = useState<'save' | 'load' | null>(null);
  const [recentSlot, setRecentSlot] = useState<number | null>(null);

  function focusEmulatorHost() {
    emulatorHostRef.current?.focus();
  }

  function closeEmulator() {
    const emulatorWindow = window as EmulatorJsWindow;
    const emulator = instanceRef.current as ClosableEmulatorJsInstance | null;

    stopAllTurbo();

    try {
      emulator?.pause?.();
      emulator?.stop?.();
      emulator?.exit?.();
      emulator?.destroy?.();
    } catch {
      // Ignore cleanup errors while leaving the play page.
    }

    if (emulatorHostRef.current) {
      emulatorHostRef.current.innerHTML = '';
    }

    instanceRef.current = null;
    delete emulatorWindow.EJS_onGameStart;
    delete emulatorWindow.EJS_onError;
    delete emulatorWindow.EJS_emulator;
  }

  function getTurboTarget(turboKey: TurboKey) {
    return {
      player: turboKey.startsWith('p1') ? PLAYER_ONE : PLAYER_TWO,
      buttonIndex: turboKey.endsWith('a') ? NES_BUTTON_A : NES_BUTTON_B,
    };
  }

  function stopTurbo(turboKey: TurboKey) {
    const turboInterval = turboIntervalsRef.current[turboKey];
    if (turboInterval !== null) {
      window.clearInterval(turboInterval);
      turboIntervalsRef.current[turboKey] = null;
    }

    const emulator = instanceRef.current;
    if (!emulator) {
      return;
    }

    const target = getTurboTarget(turboKey);
    emulator.gameManager.simulateInput(target.player, target.buttonIndex, 0);
  }

  function stopAllTurbo() {
    stopTurbo('p1a');
    stopTurbo('p1b');
    stopTurbo('p2a');
    stopTurbo('p2b');
  }

  function startTurbo(turboKey: TurboKey) {
    const emulator = instanceRef.current;
    if (!emulator || turboIntervalsRef.current[turboKey] !== null) {
      return;
    }

    const target = getTurboTarget(turboKey);
    let pressed = false;
    turboIntervalsRef.current[turboKey] = window.setInterval(() => {
      const activeEmulator = instanceRef.current;
      if (!activeEmulator) {
        stopTurbo(turboKey);
        return;
      }

      pressed = !pressed;
      activeEmulator.gameManager.simulateInput(target.player, target.buttonIndex, pressed ? 1 : 0);
    }, TURBO_INTERVAL_MS);
  }

  function rememberRecentSlot(slot: number) {
    setRecentSlot(slot);
    window.localStorage.setItem(getRecentSlotStorageKey(game.id), String(slot));
  }

  function clearRecentSlot() {
    setRecentSlot(null);
    window.localStorage.removeItem(getRecentSlotStorageKey(game.id));
  }

  function getLatestSavedSlot(slots: SaveSlot[]) {
    return slots
      .filter((slot) => slot.updatedAt)
      .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())[0]?.slot ?? null;
  }

  function getFirstEmptySlot(slots: SaveSlot[]) {
    return slots.find((slot) => !slot.updatedAt)?.slot ?? null;
  }

  function getActiveSlot(mode: 'save' | 'load' | null, slots: SaveSlot[]) {
    if (mode === 'save') {
      return getFirstEmptySlot(slots) ?? recentSlot ?? 1;
    }

    if (mode === 'load') {
      return getLatestSavedSlot(slots);
    }

    return null;
  }

  const activeSlot = getActiveSlot(slotDialogMode, saveSlots);
  const hasRecentSlot = recentSlot !== null && saveSlots.some((slot) => slot.slot === recentSlot && slot.updatedAt);

  async function refreshSaveSlots() {
    const rows = await listGameStates(game.id);
    const slotMap = new Map(rows.map((item) => [item.slot, item]));
    const nextSlots: SaveSlot[] = Array.from({ length: 10 }, (_, index) => {
      const slot = index + 1;
      const record = slotMap.get(slot);

      return {
        slot,
        updatedAt: record?.updatedAt ?? null,
        screenshotDataUrl: record?.screenshotDataUrl ?? null,
      };
    });

    setSaveSlots(nextSlots);
  }

  useEffect(() => {
    void refreshSaveSlots();
  }, [game.id]);

  useEffect(() => {
    const stored = window.localStorage.getItem(getRecentSlotStorageKey(game.id));
    const slot = stored ? Number(stored) : NaN;
    setRecentSlot(Number.isInteger(slot) && slot >= 1 && slot <= 10 ? slot : null);
  }, [game.id]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const emulatorHost = emulatorHostRef.current;
    if (!emulatorHost) {
      return;
    }

    let disposed = false;
    const emulatorWindow = window as EmulatorJsWindow;
    const playerSelector = `#emulator-player-${game.id}`;
    emulatorHost.id = `emulator-player-${game.id}`;
    emulatorHost.tabIndex = 0;
    emulatorHost.innerHTML = '';
    instanceRef.current = null;

    const initialize = async () => {
      setStatus('正在加载模拟器...');
      console.log('[EmulatorPlayer] initialize', {
        gameId: game.id,
        title: game.title,
        romUrl: game.romUrl,
        playerSelector,
      });

      emulatorWindow.EJS_player = playerSelector;
      emulatorWindow.EJS_core = 'nes';
      emulatorWindow.EJS_gameUrl = game.romUrl;
      emulatorWindow.EJS_gameName = `game-${game.id}`;
      emulatorWindow.EJS_pathtodata = '/emulatorjs/data/';
      emulatorWindow.EJS_startOnLoaded = true;
      emulatorWindow.EJS_askBeforeExit = false;
      emulatorWindow.EJS_noAutoFocus = false;
      emulatorWindow.EJS_defaultOptions = {
        retroarch_core: 'nestopia',
      };
      emulatorWindow.EJS_onGameStart = () => {
        console.log('[EmulatorPlayer] onGameStart', { gameId: game.id, title: game.title });
        if (disposed) {
          return;
        }

        instanceRef.current = emulatorWindow.EJS_emulator ?? null;
        if (instanceRef.current) {
          stripReservedHotkeys(instanceRef.current);
        }
        window.requestAnimationFrame(() => focusEmulatorHost());
        setStatus('运行中');
      };
      emulatorWindow.EJS_onError = (message) => {
        console.error('[EmulatorPlayer] onError', { gameId: game.id, title: game.title, message });
        if (!disposed) {
          setStatus(message || '模拟器启动失败');
        }
      };

      await loadEmulatorAssets();
      console.log('[EmulatorPlayer] emulator assets ready', { gameId: game.id, title: game.title, hasConstructor: Boolean(emulatorWindow.EmulatorJS) });
      const EmulatorConstructor = emulatorWindow.EmulatorJS;
      if (!EmulatorConstructor) {
        throw new Error('EmulatorJS 构造器未挂载到 window');
      }
      console.log('[EmulatorPlayer] constructor ready', { gameId: game.id, title: game.title });

      if (!emulatorWindow.EJS_emulator) {
        console.log('[EmulatorPlayer] creating emulator instance manually', { gameId: game.id, title: game.title });
        const instance = new EmulatorConstructor(playerSelector, createEmulatorConfig(game, playerSelector));
        attachLifecycleLogs(instance, game);
        emulatorWindow.EJS_emulator = instance;
      }

      if (!disposed && emulatorWindow.EJS_emulator) {
        instanceRef.current = emulatorWindow.EJS_emulator;
        stripReservedHotkeys(emulatorWindow.EJS_emulator);
        attachLifecycleLogs(emulatorWindow.EJS_emulator, game);
        console.log('[EmulatorPlayer] instance attached', { gameId: game.id, title: game.title, hasGameManager: Boolean(emulatorWindow.EJS_emulator.gameManager) });
        window.requestAnimationFrame(() => focusEmulatorHost());
      }

      window.setTimeout(() => {
        if (!disposed && !instanceRef.current) {
          console.error('[EmulatorPlayer] startup timeout', { gameId: game.id, title: game.title, hasConstructor: Boolean(emulatorWindow.EmulatorJS), hasInstance: Boolean(emulatorWindow.EJS_emulator) });
          setStatus('模拟器初始化超时，请查看控制台日志');
        }
      }, 8000);

      if (!disposed && !emulatorWindow.EJS_emulator) {
        console.error('[EmulatorPlayer] no emulator instance after loader', { gameId: game.id, title: game.title });
      }
    };

    void initialize().catch((error) => {
      if (!disposed) {
        setStatus(error instanceof Error ? error.message : '模拟器加载失败');
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyU') {
        event.preventDefault();
        startTurbo('p1a');
        return;
      }

      if (event.code === 'KeyI') {
        event.preventDefault();
        startTurbo('p1b');
        return;
      }

      if (event.code === 'Numpad4') {
        event.preventDefault();
        startTurbo('p2a');
        return;
      }

      if (event.code === 'Numpad5') {
        event.preventDefault();
        startTurbo('p2b');
        return;
      }

      if (event.code === 'F1') {
        event.preventDefault();
        setSlotDialogMode('save');
        return;
      }

      if (event.code === 'F2') {
        event.preventDefault();
        setSlotDialogMode('load');
        return;
      }

      if (event.code === 'F5') {
        event.preventDefault();
        void handleToggleFullscreen();
        return;
      }

      if (event.code === 'F9') {
        event.preventDefault();
        handleRestart();
        return;
      }

      if (event.code === 'Escape' && slotDialogMode) {
        event.preventDefault();
        setSlotDialogMode(null);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyU') {
        event.preventDefault();
        stopTurbo('p1a');
        return;
      }

      if (event.code === 'KeyI') {
        event.preventDefault();
        stopTurbo('p1b');
        return;
      }

      if (event.code === 'Numpad4') {
        event.preventDefault();
        stopTurbo('p2a');
        return;
      }

      if (event.code === 'Numpad5') {
        event.preventDefault();
        stopTurbo('p2b');
      }
    };

    const handleWindowBlur = () => {
      stopAllTurbo();
    };

    const handlePointerDown = () => {
      focusEmulatorHost();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    emulatorHost.addEventListener('pointerdown', handlePointerDown);

    return () => {
      disposed = true;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      emulatorHost.removeEventListener('pointerdown', handlePointerDown);
      closeEmulator();
    };
  }, [game.biosUrl, game.id, game.platform, game.title, game.romUrl]);

  async function handleReturnHome() {
    closeEmulator();

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Continue navigation even if fullscreen exit is denied.
      }
    }
  }

  async function handleSave(slot = 1) {
    const emulator = instanceRef.current;
    if (!emulator) {
      setStatus('模拟器尚未准备完成');
      return;
    }

    const state = emulator.gameManager.getState();
    const screenshot = await emulator.gameManager.screenshot();
    await saveGameState(game.id, slot, bytesToBase64(state), pngBytesToDataUrl(screenshot));
    await refreshSaveSlots();
    rememberRecentSlot(slot);
    setStatus(`进度已保存到槽位 ${slot}`);
  }

  async function handleDelete(slot: number) {
    await deleteGameState(game.id, slot);
    await refreshSaveSlots();
    if (recentSlot === slot) {
      clearRecentSlot();
    }
    setStatus(`槽位 ${slot} 的进度已删除`);
  }

  async function handleLoad(slot = 1) {
    const emulator = instanceRef.current;
    if (!emulator) {
      setStatus('模拟器尚未准备完成');
      return;
    }

    const saved = await loadGameState(game.id, slot);
    if (!saved) {
      setStatus(`槽位 ${slot} 当前没有可读取进度`);
      return;
    }

    emulator.gameManager.loadState(base64ToBytes(saved.payload));
    rememberRecentSlot(slot);
    emulator.displayMessage?.(`已读取槽位 ${slot}`, 1500);
    setStatus(`槽位 ${slot} 的进度已恢复`);
  }

  function handleRestart() {
    const emulator = instanceRef.current;
    if (!emulator) {
      return;
    }

    emulator.gameManager.restart();
    setStatus('游戏已重开');
  }

  async function handleToggleFullscreen() {
    const playerShell = playerShellRef.current;
    if (!playerShell) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setStatus('已退出全屏');
        return;
      }

      await playerShell.requestFullscreen();
      setStatus('已进入全屏');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '切换全屏失败');
    }
  }

  return (
    <>
      {!isFullscreen ? (
        <div className="page-top-actions align-left">
          <Link to="/" className="text-link" onClick={() => void handleReturnHome()}>
            返回首页
          </Link>
        </div>
      ) : null}

      <section className={`player-shell ${isFullscreen ? 'is-fullscreen' : ''}`} ref={playerShellRef}>
        <div className="player-stage">
          <div ref={emulatorHostRef} className="emulator-host" />
          <p className="muted player-status">状态: {status}</p>
        </div>
        <aside className="player-sidebar">
          <p className="eyebrow">游玩页</p>
          <h1>{game.title}</h1>
          <p className="muted">{game.description || '当前游戏暂无简介。'}</p>
          <p className="muted">平台: {getPlatformLabel(game.platform)}</p>
          {game.platform === 'arcade' ? (
            <ul className="keymap">
              <li>1P WASD: 移动</li>
              <li>1P J/K/L/O/P: 按键 A/B/C/D/E</li>
              <li>1P U/I: Turbo A/B</li>
              <li>2P 方向键: 移动</li>
              <li>2P 小键盘 1/2/3/6/7: 按键 A/B/C/D/E</li>
              <li>2P 小键盘 4/5: Turbo A/B</li>
              <li>2P 小键盘 Enter: Start</li>
              <li>2P 小键盘 0: Select/Coin</li>
              <li>Enter: 1P Start</li>
              <li>Shift: 1P Select/Coin</li>
            </ul>
          ) : game.platform === 'snes' || game.platform === 'segaMD' ? (
            <ul className="keymap">
              <li>1P WASD: 移动</li>
              <li>1P J/K/L/O/P: 主按键</li>
              <li>1P Enter: Start</li>
              <li>1P Shift: Select/Mode</li>
              <li>2P 方向键: 移动</li>
              <li>2P 小键盘 1/2/3/6/7: 主按键</li>
              <li>2P 小键盘 Enter: Start</li>
              <li>2P 小键盘 0: Select/Mode</li>
            </ul>
          ) : (
            <ul className="keymap">
              <li>1P WASD: 移动</li>
              <li>1P J/K: A/B</li>
              <li>1P U/I: Turbo A/B</li>
              <li>2P 方向键: 移动</li>
              <li>2P 小键盘 1/2: A/B</li>
              <li>2P 小键盘 4/5: Turbo A/B</li>
              <li>2P 小键盘 Enter: Start</li>
              <li>2P 小键盘 0: Select</li>
              <li>Enter: Start</li>
              <li>Shift: Select</li>
            </ul>
          )}
          <div className={`card-actions player-actions ${isFullscreen ? 'is-fullscreen' : ''}`}>
            <button type="button" onClick={() => setSlotDialogMode('save')}>
              保存进度 F1
            </button>
            <button type="button" onClick={() => setSlotDialogMode('load')}>
              读取进度 F2
            </button>
            <button type="button" onClick={handleRestart}>
              重开游戏 F9
            </button>
            <button type="button" onClick={() => void handleToggleFullscreen()}>
              {isFullscreen ? '退出全屏 F5' : '全屏游戏 F5'}
            </button>
          </div>
        </aside>
      </section>

      {slotDialogMode ? (
        <div className="save-dialog-backdrop" onClick={() => setSlotDialogMode(null)}>
          <section className="save-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{slotDialogMode === 'save' ? '选择保存槽位' : '选择读取槽位'}</h2>
              <button type="button" onClick={() => setSlotDialogMode(null)}>
                关闭
              </button>
            </div>
            <div className="save-slot-grid">
              {saveSlots.map((saveSlot) => (
                <button
                  key={saveSlot.slot}
                  type="button"
                  className={`save-slot-card ${activeSlot === saveSlot.slot ? 'is-active' : ''} ${hasRecentSlot && recentSlot === saveSlot.slot ? 'is-recent' : ''}`}
                  onClick={async () => {
                    if (slotDialogMode === 'load' && !saveSlot.updatedAt) {
                      setStatus(`槽位 ${saveSlot.slot} 没有进度`);
                      setSlotDialogMode(null);
                      return;
                    }

                    if (slotDialogMode === 'save') {
                      if (saveSlot.updatedAt) {
                        const shouldOverwrite = window.confirm(`槽位 ${saveSlot.slot} 已有进度，确认覆盖吗？`);
                        if (!shouldOverwrite) {
                          return;
                        }
                      }

                      await handleSave(saveSlot.slot);
                    } else {
                      await handleLoad(saveSlot.slot);
                    }

                    setSlotDialogMode(null);
                  }}
                >
                  <div className="save-slot-preview">
                    {saveSlot.screenshotDataUrl ? (
                      <img src={saveSlot.screenshotDataUrl} alt={`槽位 ${saveSlot.slot} 预览`} className="save-slot-image" />
                    ) : (
                      <div className="save-slot-empty">空槽位</div>
                    )}
                  </div>
                  <div className="save-slot-meta">
                    <strong>
                      槽位 {saveSlot.slot}
                      {hasRecentSlot && recentSlot === saveSlot.slot ? <span className="save-slot-badge">最近使用</span> : null}
                      {activeSlot === saveSlot.slot ? <span className="save-slot-badge is-active">当前推荐</span> : null}
                    </strong>
                    <span>{saveSlot.updatedAt ? new Date(saveSlot.updatedAt).toLocaleString() : '暂无存档'}</span>
                  </div>
                  <div className="save-slot-actions">
                    <button
                      type="button"
                      className="save-slot-delete"
                      disabled={!saveSlot.updatedAt}
                      onClick={async (event) => {
                        event.stopPropagation();

                        if (!saveSlot.updatedAt) {
                          return;
                        }

                        const shouldDelete = window.confirm(`确认删除槽位 ${saveSlot.slot} 的进度吗？`);
                        if (!shouldDelete) {
                          return;
                        }

                        await handleDelete(saveSlot.slot);
                      }}
                    >
                      删除进度
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
