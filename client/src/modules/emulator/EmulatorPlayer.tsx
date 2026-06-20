import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { deleteGameState, listGameStates, loadGameState, saveGameState } from '../../services/saveStorage';
import type { Game } from '../../types/game';
import { clearKeyBindings, createKeymapGroups, findComboKey, findManualInputKey, findTurboKey, getDefaultKeyBindings, loadKeyBindings, saveKeyBindings, type PlayerKeyBindings } from './keyBindings';
import { base64ToBytes, bytesToBase64, pngBytesToDataUrl } from './emulatorImage';
import { consumeKeyboardEvent, getPlatformLabel, stripManualInputKeyCodes, stripNativeKeyboardControls, stripNativeStartControls, stripReservedHotkeys } from './emulatorInputRuntime';
import { attachLifecycleLogs, createEmulatorConfig, forceCloseActiveEmulator, getCoreOptionSettings, getEmulatorSystem, getRetroArchCore, loadEmulatorAssets, type EmulatorJsInstance, type EmulatorJsRuntimeInstance, type EmulatorJsWindow } from './emulatorRuntime';

type EmulatorPlayerProps = {
  game: Game;
};

type SaveSlot = {
  slot: number;
  updatedAt: string | null;
  screenshotDataUrl: string | null;
};

type TurboKey = 'p1a' | 'p1b' | 'p2a' | 'p2b';

const NES_BUTTON_B = 0;
const NES_BUTTON_A = 8;
const START_BUTTON_INDEX = 3;
const TURBO_INTERVAL_MS = 50;
const PLAYER_ONE = 0;
const PLAYER_TWO = 1;

function getLoadingStatus(platform: Game['platform']) {
  if (platform === 'arcade' || platform === 'mame' || platform === 'cps1' || platform === 'cps2') {
    return '正在解压街机 ROM 并启动模拟器，首次启动可能需要几秒...';
  }

  return '正在加载模拟器...';
}

function getRecentSlotStorageKey(gameId: number) {
  return `game-cat-online:recent-slot:${gameId}`;
}

export function EmulatorPlayer({ game }: EmulatorPlayerProps) {
  const playerShellRef = useRef<HTMLElement | null>(null);
  const emulatorHostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<EmulatorJsInstance | null>(null);
  const emulatorParentKeyCaptureCleanupRef = useRef<(() => void) | null>(null);
  const keyBindingDialogOpenRef = useRef(false);
  const keyBindingsRef = useRef<PlayerKeyBindings>(loadKeyBindings(game));
  const activeComboKeysRef = useRef<Set<string>>(new Set());
  const turboIntervalsRef = useRef<Record<TurboKey, number | null>>({ p1a: null, p1b: null, p2a: null, p2b: null });
  const [status, setStatus] = useState(() => getLoadingStatus(game.platform));
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [saveSlots, setSaveSlots] = useState<SaveSlot[]>([]);
  const [slotDialogMode, setSlotDialogMode] = useState<'save' | 'load' | null>(null);
  const [keyBindings, setKeyBindings] = useState<PlayerKeyBindings>(() => loadKeyBindings(game));
  const [keyBindingDialogOpen, setKeyBindingDialogOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const keymapGroups = createKeymapGroups(keyBindings);
  const [recentSlot, setRecentSlot] = useState<number | null>(null);

  function focusEmulatorHost() {
    emulatorHostRef.current?.focus();
  }

  function closeEmulator() {
    stopAllTurbo();
    releaseAllCombos();
    emulatorParentKeyCaptureCleanupRef.current?.();
    emulatorParentKeyCaptureCleanupRef.current = null;
    forceCloseActiveEmulator(emulatorHostRef.current);
    instanceRef.current = null;
    setIsPaused(false);
  }

  function getTurboTarget(turboKey: TurboKey) {
    return {
      player: turboKey.startsWith('p1') ? PLAYER_ONE : PLAYER_TWO,
      buttonIndex: turboKey.endsWith('a') ? NES_BUTTON_A : NES_BUTTON_B,
    };
  }

  function simulateInputSafely(player: number, buttonIndex: number, value: number) {
    const gameManager = instanceRef.current?.gameManager;
    if (!gameManager?.simulateInput) {
      return false;
    }

    try {
      gameManager.simulateInput(player, buttonIndex, value);
      return true;
    } catch {
      return false;
    }
  }

  function stopTurbo(turboKey: TurboKey) {
    const turboInterval = turboIntervalsRef.current[turboKey];
    if (turboInterval !== null) {
      window.clearInterval(turboInterval);
      turboIntervalsRef.current[turboKey] = null;
    }

    const target = getTurboTarget(turboKey);
    simulateInputSafely(target.player, target.buttonIndex, 0);
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

    let pressed = false;
    turboIntervalsRef.current[turboKey] = window.setInterval(() => {
      const target = getTurboTarget(turboKey);
      pressed = !pressed;
      if (!simulateInputSafely(target.player, target.buttonIndex, pressed ? 1 : 0)) {
        stopTurbo(turboKey);
      }
    }, TURBO_INTERVAL_MS);
  }

  function simulateCombo(eventCode: string, value: number) {
    const comboKey = findComboKey(eventCode, keyBindings);
    if (!comboKey?.bindingItem.comboButtonIndexes) {
      return false;
    }

    if (value === 1 && activeComboKeysRef.current.has(eventCode)) {
      return true;
    }

    if (value === 1) {
      activeComboKeysRef.current.add(eventCode);
    } else {
      activeComboKeysRef.current.delete(eventCode);
    }

    for (const buttonIndex of comboKey.bindingItem.comboButtonIndexes) {
      simulateInputSafely(comboKey.player, buttonIndex, value);
    }

    return true;
  }

  function simulateManualInput(eventCode: string, value: number) {
    const manualInputKey = findManualInputKey(eventCode, keyBindings);
    if (!manualInputKey) {
      return false;
    }

    return simulateInputSafely(manualInputKey.player, manualInputKey.bindingItem.buttonIndex, value);
  }

  function simulateTwoPlayerStart(value: number) {
    return simulateInputSafely(PLAYER_TWO, START_BUTTON_INDEX, value);
  }

  function simulateOnePlayerStart(value: number) {
    return simulateInputSafely(PLAYER_ONE, START_BUTTON_INDEX, value);
  }

  function handleCapturedEmulatorKey(event: KeyboardEvent) {
    if (event.code === 'Enter') {
      consumeKeyboardEvent(event);
      simulateOnePlayerStart(event.type === 'keydown' ? 1 : 0);
      return true;
    }

    if (event.code === 'NumpadEnter') {
      consumeKeyboardEvent(event);
      return true;
    }

    if (event.code === 'Numpad0' || event.code === 'NumpadDecimal') {
      consumeKeyboardEvent(event);
      simulateTwoPlayerStart(event.type === 'keydown' ? 1 : 0);
      return true;
    }

    return false;
  }

  function attachEmulatorParentKeyCapture(instance: EmulatorJsInstance) {
    emulatorParentKeyCaptureCleanupRef.current?.();
    const emulatorParent = instance.elements?.parent;
    if (!emulatorParent) {
      return;
    }

    emulatorParent.addEventListener('keydown', handleCapturedEmulatorKey, true);
    emulatorParent.addEventListener('keyup', handleCapturedEmulatorKey, true);
    emulatorParentKeyCaptureCleanupRef.current = () => {
      emulatorParent.removeEventListener('keydown', handleCapturedEmulatorKey, true);
      emulatorParent.removeEventListener('keyup', handleCapturedEmulatorKey, true);
    };
  }

  function attachRunningEmulator(instance: EmulatorJsInstance, source: string) {
    const runtimeInstance = instance as EmulatorJsRuntimeInstance;
    if (runtimeInstance.__gameCatRunningAttached) {
      instanceRef.current = instance;
      return;
    }

    runtimeInstance.__gameCatRunningAttached = true;
    instanceRef.current = instance;
    stripReservedHotkeys(instance);
    stripManualInputKeyCodes(instance, keyBindingsRef.current);
    stripNativeStartControls(instance);
    stripNativeKeyboardControls(instance);
    attachEmulatorParentKeyCapture(instance);
    window.requestAnimationFrame(() => focusEmulatorHost());
    setStatus('运行中');
    console.log('[EmulatorPlayer] running instance attached', {
      gameId: game.id,
      title: game.title,
      source,
      hasGameManager: Boolean(instance.gameManager),
      hasCanvas: Boolean(instance.elements?.parent?.querySelector('canvas')),
    });
  }

  function releaseAllCombos() {
    for (const eventCode of activeComboKeysRef.current) {
      simulateCombo(eventCode, 0);
    }
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
    const nextBindings = loadKeyBindings(game);
    keyBindingsRef.current = nextBindings;
    setKeyBindings(nextBindings);
  }, [game.id, game.platform]);

  useEffect(() => {
    keyBindingsRef.current = keyBindings;

    if (instanceRef.current) {
      stripReservedHotkeys(instanceRef.current);
      stripManualInputKeyCodes(instanceRef.current, keyBindings);
      stripNativeStartControls(instanceRef.current);
      stripNativeKeyboardControls(instanceRef.current);
    }
  }, [keyBindings]);

  useEffect(() => {
    keyBindingDialogOpenRef.current = keyBindingDialogOpen;
  }, [keyBindingDialogOpen]);

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
    let startupWatchInterval: number | null = null;
    let startupTimeoutId: number | null = null;
    const emulatorWindow = window as EmulatorJsWindow;
    const playerSelector = `#emulator-player-${game.id}`;
    emulatorHost.id = `emulator-player-${game.id}`;
    emulatorHost.tabIndex = 0;
    forceCloseActiveEmulator(emulatorHost);
    instanceRef.current = null;

    const clearStartupWatchers = () => {
      if (startupWatchInterval !== null) {
        window.clearInterval(startupWatchInterval);
        startupWatchInterval = null;
      }

      if (startupTimeoutId !== null) {
        window.clearTimeout(startupTimeoutId);
        startupTimeoutId = null;
      }
    };

    const ensureStartListener = (instance: EmulatorJsInstance, source: string) => {
      const runtimeInstance = instance as EmulatorJsRuntimeInstance;
      if (runtimeInstance.__gameCatStartListenerAttached) {
        return;
      }

      runtimeInstance.__gameCatStartListenerAttached = true;
      instance.on?.('start', () => {
        if (!disposed) {
          attachRunningEmulator(instance, source);
        }
      });
    };

    const tryAttachAvailableInstance = (source: string) => {
      const instance = emulatorWindow.EJS_emulator;
      if (!instance || disposed) {
        return false;
      }

      const hasCanvas = Boolean(instance.elements?.parent?.querySelector('canvas') || emulatorHost.querySelector('canvas'));
      if (!instance.gameManager && !hasCanvas) {
        return false;
      }

      attachLifecycleLogs(instance, game);
      attachRunningEmulator(instance, source);
      clearStartupWatchers();
      return true;
    };

    const initialize = async () => {
      setStatus(getLoadingStatus(game.platform));
      console.log('[EmulatorPlayer] initialize', {
        gameId: game.id,
        title: game.title,
        romUrl: game.romUrl,
        playerSelector,
      });

      emulatorWindow.EJS_player = playerSelector;
      emulatorWindow.EJS_core = getEmulatorSystem(game);
      emulatorWindow.EJS_gameUrl = game.romUrl;
      emulatorWindow.EJS_gameName = `game-${game.id}`;
      emulatorWindow.EJS_pathtodata = '/emulatorjs/data/';
      emulatorWindow.EJS_startOnLoaded = true;
      emulatorWindow.EJS_askBeforeExit = false;
      emulatorWindow.EJS_noAutoFocus = false;
      emulatorWindow.EJS_defaultOptions = {
        retroarch_core: getRetroArchCore(game),
        ...getCoreOptionSettings(game),
      };
      emulatorWindow.EJS_onGameStart = () => {
        console.log('[EmulatorPlayer] onGameStart', { gameId: game.id, title: game.title });
        if (disposed) {
          return;
        }

        if (emulatorWindow.EJS_emulator) {
          attachRunningEmulator(emulatorWindow.EJS_emulator, 'global-callback');
        }
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
        const instance = new EmulatorConstructor(playerSelector, createEmulatorConfig(game, playerSelector, keyBindingsRef.current));
        attachLifecycleLogs(instance, game);
        ensureStartListener(instance, 'start-event');
        emulatorWindow.EJS_emulator = instance;
      }

      if (!disposed && emulatorWindow.EJS_emulator) {
        attachLifecycleLogs(emulatorWindow.EJS_emulator, game);
        ensureStartListener(emulatorWindow.EJS_emulator, 'start-event-existing');
        console.log('[EmulatorPlayer] instance attached', { gameId: game.id, title: game.title, hasGameManager: Boolean(emulatorWindow.EJS_emulator.gameManager) });
        if (emulatorWindow.EJS_emulator.gameManager) {
          attachRunningEmulator(emulatorWindow.EJS_emulator, 'existing-game-manager');
        }
      }

      if (!tryAttachAvailableInstance('post-create-check')) {
        startupWatchInterval = window.setInterval(() => {
          tryAttachAvailableInstance('poll-ready-instance');
        }, 250);
      }

      startupTimeoutId = window.setTimeout(() => {
        if (tryAttachAvailableInstance('timeout-recovery')) {
          return;
        }

        if (!disposed && !instanceRef.current?.gameManager) {
          console.error('[EmulatorPlayer] startup timeout', {
            gameId: game.id,
            title: game.title,
            hasConstructor: Boolean(emulatorWindow.EmulatorJS),
            hasInstance: Boolean(emulatorWindow.EJS_emulator),
            hasGameManager: Boolean(emulatorWindow.EJS_emulator?.gameManager),
            hasCanvas: Boolean(emulatorHost.querySelector('canvas')),
          });
          setStatus(
            game.platform === 'arcade' || game.platform === 'mame' || game.platform === 'cps1' || game.platform === 'cps2'
              ? '街机 ROM 仍在解压或启动中，请继续等待几秒后查看控制台日志'
              : '模拟器启动未完成，请查看控制台日志',
          );
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
      if (keyBindingDialogOpenRef.current) {
        return;
      }

      if (event.code === 'Enter') {
        consumeKeyboardEvent(event);
        simulateOnePlayerStart(1);
        return;
      }

      if (event.code === 'NumpadEnter') {
        consumeKeyboardEvent(event);
        return;
      }

      if (event.code === 'Numpad0' || event.code === 'NumpadDecimal') {
        consumeKeyboardEvent(event);
        simulateTwoPlayerStart(1);
        return;
      }

      const turboKey = findTurboKey(event.code, keyBindings);
      if (turboKey) {
        consumeKeyboardEvent(event);
        startTurbo(turboKey);
        return;
      }

      if (findComboKey(event.code, keyBindings)) {
        consumeKeyboardEvent(event);
        simulateCombo(event.code, 1);
        return;
      }

      if (findManualInputKey(event.code, keyBindings)) {
        consumeKeyboardEvent(event);
        simulateManualInput(event.code, 1);
        return;
      }

      if (event.code === 'F1') {
        consumeKeyboardEvent(event);
        setSlotDialogMode('save');
        return;
      }

      if (event.code === 'F2') {
        consumeKeyboardEvent(event);
        setSlotDialogMode('load');
        return;
      }

      if (event.code === 'F5') {
        consumeKeyboardEvent(event);
        void handleToggleFullscreen();
        return;
      }

      if (event.code === 'F9') {
        consumeKeyboardEvent(event);
        handleRestart();
        return;
      }

      if (event.code === 'Space') {
        consumeKeyboardEvent(event);
        handleTogglePause();
        return;
      }

      if (event.code === 'Escape') {
        consumeKeyboardEvent(event);
        setSlotDialogMode(null);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (keyBindingDialogOpenRef.current) {
        return;
      }

      if (event.code === 'Enter') {
        consumeKeyboardEvent(event);
        simulateOnePlayerStart(0);
        return;
      }

      if (event.code === 'NumpadEnter') {
        consumeKeyboardEvent(event);
        return;
      }

      if (event.code === 'Numpad0' || event.code === 'NumpadDecimal') {
        consumeKeyboardEvent(event);
        simulateTwoPlayerStart(0);
        return;
      }

      const turboKey = findTurboKey(event.code, keyBindings);
      if (turboKey) {
        consumeKeyboardEvent(event);
        stopTurbo(turboKey);
        return;
      }

      if (findComboKey(event.code, keyBindings)) {
        consumeKeyboardEvent(event);
        simulateCombo(event.code, 0);
        return;
      }

      if (findManualInputKey(event.code, keyBindings)) {
        consumeKeyboardEvent(event);
        simulateManualInput(event.code, 0);
      }
    };

    const handleWindowBlur = () => {
      stopAllTurbo();
      releaseAllCombos();
    };

    const handlePointerDown = () => {
      focusEmulatorHost();
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    document.addEventListener('keydown', handleCapturedEmulatorKey, true);
    document.addEventListener('keyup', handleCapturedEmulatorKey, true);
    window.addEventListener('blur', handleWindowBlur);
    emulatorHost.addEventListener('keydown', handleCapturedEmulatorKey, true);
    emulatorHost.addEventListener('keyup', handleCapturedEmulatorKey, true);
    emulatorHost.addEventListener('pointerdown', handlePointerDown);

    return () => {
      disposed = true;
      clearStartupWatchers();
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
      document.removeEventListener('keydown', handleCapturedEmulatorKey, true);
      document.removeEventListener('keyup', handleCapturedEmulatorKey, true);
      window.removeEventListener('blur', handleWindowBlur);
      emulatorParentKeyCaptureCleanupRef.current?.();
      emulatorParentKeyCaptureCleanupRef.current = null;
      emulatorHost.removeEventListener('keydown', handleCapturedEmulatorKey, true);
      emulatorHost.removeEventListener('keyup', handleCapturedEmulatorKey, true);
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

  function updateKeyBinding(player: 0 | 1, label: string, event: ReactKeyboardEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (event.code === 'Escape') {
      return;
    }

    if (player === PLAYER_TWO && label === 'Start' && event.code === 'NumpadEnter') {
      setStatus('2P Start 请使用小键盘 0 或小键盘 .');
      return;
    }

    const keyLabel = event.key === ' ' ? 'Space' : event.key;
    const nextBindings: PlayerKeyBindings = {
      0: keyBindings[0].map((bindingItem) =>
        player === 0 && bindingItem.label === label
          ? { ...bindingItem, eventCode: event.code, keyCode: event.keyCode, keyLabel }
          : bindingItem,
      ),
      1: keyBindings[1].map((bindingItem) =>
        player === 1 && bindingItem.label === label
          ? { ...bindingItem, eventCode: event.code, keyCode: event.keyCode, keyLabel }
          : bindingItem,
      ),
    };

    saveKeyBindings(game.id, nextBindings);
    setKeyBindings(nextBindings);
    setStatus('键位配置已保存，本地立即生效');
  }

  function resetKeyBindings() {
    const defaults = getDefaultKeyBindings(game.platform);
    clearKeyBindings(game.id);
    setKeyBindings(defaults);
    setStatus('键位配置已恢复默认');
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
    emulator.play?.();
    setIsPaused(false);
    setStatus('游戏已重开');
  }

  function handleTogglePause() {
    const emulator = instanceRef.current;
    if (!emulator) {
      setStatus('模拟器尚未准备完成');
      return;
    }

    if (isPaused || emulator.paused) {
      emulator.play?.();
      setIsPaused(false);
      setStatus('游戏已继续');
      return;
    }

    stopAllTurbo();
    releaseAllCombos();
    emulator.pause?.();
    setIsPaused(true);
    setStatus('游戏已暂停');
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

  function scrollToControlsGuide() {
    document.getElementById('player-controls-guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
          <section className="detail-description-card player-controls-card" id="player-controls-guide">
            <p className="eyebrow detail-controls-eyebrow">操作说明</p>
            <p className="muted detail-description-text">{game.controlsHelp || '当前游戏暂未填写单独的操作说明，下面的默认键位可直接作为开玩参考。'}</p>
          </section>
        </div>
        <aside className="player-sidebar">
          <p className="eyebrow">游玩页</p>
          <h1>{game.title}</h1>
          <p className="muted">{game.description || '当前游戏暂无简介。'}</p>
          <p className="muted">平台: {getPlatformLabel(game.platform)}</p>
          <div className="keymap-panels">
            {keymapGroups.map((group) => (
              <section className="keymap-panel" key={group.title}>
                <h2>{group.title}</h2>
                <ul className="keymap">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className={`card-actions player-actions ${isFullscreen ? 'is-fullscreen' : ''}`}>
            <button type="button" onClick={scrollToControlsGuide}>
              查看操作说明
            </button>
            <button type="button" onClick={() => setSlotDialogMode('save')}>
              保存进度 F1
            </button>
            <button type="button" onClick={() => setSlotDialogMode('load')}>
              读取进度 F2
            </button>
            <button type="button" onClick={handleRestart}>
              重开游戏 F9
            </button>
            <button type="button" onClick={handleTogglePause}>
              {isPaused ? '继续游戏 Space' : '暂停游戏 Space'}
            </button>
            <button type="button" onClick={() => void handleToggleFullscreen()}>
              {isFullscreen ? '退出全屏 F5' : '全屏游戏 F5'}
            </button>
            <button type="button" onClick={() => setKeyBindingDialogOpen(true)}>
              配置键位
            </button>
          </div>
        </aside>
      </section>

      {keyBindingDialogOpen ? (
        <div className="save-dialog-backdrop" onClick={() => setKeyBindingDialogOpen(false)}>
          <section className="save-dialog key-binding-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">本地配置</p>
                <h2>配置当前游戏键位</h2>
              </div>
              <button type="button" onClick={() => setKeyBindingDialogOpen(false)}>
                关闭
              </button>
            </div>
            <p className="muted">每个游戏独立保存一套键位。点击动作行后按下新的键，列表左侧是游戏动作，右侧是当前键盘按键。</p>
            <div className="key-binding-grid">
              {([0, 1] as const).map((player) => (
                <section className="key-binding-panel" key={player}>
                  <h3>{player + 1}P 操作</h3>
                  {keyBindings[player].map((bindingItem) => (
                    <button
                      className="key-binding-row"
                      key={bindingItem.label}
                      type="button"
                      onKeyDown={(event) => updateKeyBinding(player, bindingItem.label, event)}
                    >
                      <span>{bindingItem.label}</span>
                      <strong>{bindingItem.keyLabel}</strong>
                    </button>
                  ))}
                </section>
              ))}
            </div>
            <div className="card-actions key-binding-actions">
              <button type="button" onClick={resetKeyBindings}>
                恢复默认键位
              </button>
              <button type="button" onClick={() => setKeyBindingDialogOpen(false)}>
                完成
              </button>
            </div>
          </section>
        </div>
      ) : null}

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
