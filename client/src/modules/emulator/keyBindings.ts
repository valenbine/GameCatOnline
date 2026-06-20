import type { Game } from '../../types/game';

export type PlayerKeyBinding = {
  label: string;
  buttonIndex: number;
  comboButtonIndexes?: number[];
  manualInput?: boolean;
  keyCode: number;
  keyLabel: string;
  eventCode: string;
  turboKey?: 'p1a' | 'p1b' | 'p2a' | 'p2b';
};

export type PlayerKeyBindings = Record<0 | 1, PlayerKeyBinding[]>;

export type KeymapGroup = {
  title: string;
  items: string[];
};

type StoredKeyBindings = {
  version?: number;
  bindings?: Partial<PlayerKeyBindings>;
};

const KEY_BINDINGS_STORAGE_VERSION = 20;

const keyCodeByEventCode: Record<string, number> = {
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  ArrowUp: 38,
  Enter: 13,
  KeyA: 65,
  KeyD: 68,
  KeyH: 72,
  KeyI: 73,
  KeyJ: 74,
  KeyK: 75,
  KeyL: 76,
  KeyO: 79,
  KeyP: 80,
  KeyS: 83,
  KeyU: 85,
  KeyW: 87,
  Numpad0: 96,
  Numpad1: 97,
  Numpad2: 98,
  Numpad3: 99,
  Numpad4: 100,
  Numpad5: 101,
  Numpad6: 102,
  Numpad7: 103,
  Numpad8: 104,
  NumpadAdd: 107,
  NumpadDecimal: 110,
  NumpadEnter: 108,
  ShiftLeft: 16,
};

const keyLabelByEventCode: Record<string, string> = {
  ArrowDown: '方向键下',
  ArrowLeft: '方向键左',
  ArrowRight: '方向键右',
  ArrowUp: '方向键上',
  Enter: 'Enter',
  KeyA: 'A',
  KeyD: 'D',
  KeyH: 'H',
  KeyI: 'I',
  KeyJ: 'J',
  KeyK: 'K',
  KeyL: 'L',
  KeyO: 'O',
  KeyP: 'P',
  KeyS: 'S',
  KeyU: 'U',
  KeyW: 'W',
  Numpad0: '小键盘 0',
  Numpad1: '小键盘 1',
  Numpad2: '小键盘 2',
  Numpad3: '小键盘 3',
  Numpad4: '小键盘 4',
  Numpad5: '小键盘 5',
  Numpad6: '小键盘 6',
  Numpad7: '小键盘 7',
  Numpad8: '小键盘 8',
  NumpadAdd: '小键盘 +',
  NumpadDecimal: '小键盘 .',
  NumpadEnter: '小键盘 Enter',
  ShiftLeft: 'Shift',
};

function binding(label: string, buttonIndex: number, eventCode: string, turboKey?: PlayerKeyBinding['turboKey']): PlayerKeyBinding {
  return {
    label,
    buttonIndex,
    keyCode: keyCodeByEventCode[eventCode],
    keyLabel: keyLabelByEventCode[eventCode] ?? eventCode,
    eventCode,
    turboKey,
  };
}

function manualBinding(label: string, buttonIndex: number, eventCode: string, turboKey?: PlayerKeyBinding['turboKey']) {
  return { ...binding(label, buttonIndex, eventCode, turboKey), manualInput: true };
}

function getDefaultPlayerBindings(platform: Game['platform']): PlayerKeyBindings {
  const baseBindings: PlayerKeyBindings = {
    0: [
      manualBinding('上', 4, 'KeyW'),
      manualBinding('下', 5, 'KeyS'),
      manualBinding('左', 6, 'KeyA'),
      manualBinding('右', 7, 'KeyD'),
      manualBinding('A', 8, 'KeyJ'),
      manualBinding('B', 0, 'KeyK'),
      binding('A 连打', 8, 'KeyU', 'p1a'),
      binding('B 连打', 0, 'KeyI', 'p1b'),
      manualBinding('Start', 3, 'Enter'),
      manualBinding('Select', 2, 'ShiftLeft'),
    ],
    1: [
      manualBinding('上', 4, 'ArrowUp'),
      manualBinding('下', 5, 'ArrowDown'),
      manualBinding('左', 6, 'ArrowLeft'),
      manualBinding('右', 7, 'ArrowRight'),
      manualBinding('A', 8, 'Numpad1'),
      manualBinding('B', 0, 'Numpad2'),
      binding('A 连打', 8, 'Numpad4', 'p2a'),
      binding('B 连打', 0, 'Numpad5', 'p2b'),
      manualBinding('Start', 3, 'Numpad0'),
      manualBinding('Select', 2, 'NumpadAdd'),
    ],
  };

  if (platform === 'arcade') {
    return {
      0: [
        manualBinding('上', 4, 'KeyW'),
        manualBinding('下', 5, 'KeyS'),
        manualBinding('左', 6, 'KeyA'),
        manualBinding('右', 7, 'KeyD'),
        manualBinding('轻拳', 0, 'KeyJ'),
        manualBinding('轻脚', 8, 'KeyK'),
        manualBinding('重拳', 1, 'KeyL'),
        manualBinding('重脚', 9, 'KeyI'),
        { ...manualBinding('轻拳+轻脚', 8, 'KeyU'), comboButtonIndexes: [8, 0] },
        { ...manualBinding('重拳+重脚', 1, 'KeyO'), comboButtonIndexes: [1, 9] },
        { ...manualBinding('爆气', 0, 'KeyH'), comboButtonIndexes: [0, 8, 1] },
        manualBinding('Start', 3, 'Enter'),
        manualBinding('投币/选择', 2, 'ShiftLeft'),
      ],
      1: [
        manualBinding('上', 4, 'ArrowUp'),
        manualBinding('下', 5, 'ArrowDown'),
        manualBinding('左', 6, 'ArrowLeft'),
        manualBinding('右', 7, 'ArrowRight'),
        manualBinding('轻拳', 0, 'Numpad1'),
        manualBinding('轻脚', 8, 'Numpad2'),
        manualBinding('重拳', 1, 'Numpad3'),
        manualBinding('重脚', 9, 'Numpad5'),
        { ...manualBinding('轻拳+轻脚', 8, 'Numpad4'), comboButtonIndexes: [8, 0] },
        { ...manualBinding('重拳+重脚', 1, 'Numpad6'), comboButtonIndexes: [1, 9] },
        { ...manualBinding('爆气', 0, 'Numpad8'), comboButtonIndexes: [0, 8, 1] },
        manualBinding('Start', 3, 'NumpadDecimal'),
        manualBinding('投币/选择', 2, 'NumpadAdd'),
      ],
    };
  }

  if (platform === 'mame' || platform === 'cps1' || platform === 'cps2') {
    return {
      0: [
        manualBinding('上', 4, 'KeyW'),
        manualBinding('下', 5, 'KeyS'),
        manualBinding('左', 6, 'KeyA'),
        manualBinding('右', 7, 'KeyD'),
        manualBinding('按钮1', 0, 'KeyJ'),
        manualBinding('按钮2', 8, 'KeyK'),
        manualBinding('按钮3', 1, 'KeyL'),
        manualBinding('按钮4', 9, 'KeyU'),
        manualBinding('按钮5', 10, 'KeyI'),
        manualBinding('按钮6', 11, 'KeyO'),
        binding('按钮1 连打', 0, 'KeyH', 'p1a'),
        binding('按钮2 连打', 8, 'KeyP', 'p1b'),
        manualBinding('开始', 3, 'Enter'),
        manualBinding('投币', 2, 'ShiftLeft'),
      ],
      1: [
        manualBinding('上', 4, 'ArrowUp'),
        manualBinding('下', 5, 'ArrowDown'),
        manualBinding('左', 6, 'ArrowLeft'),
        manualBinding('右', 7, 'ArrowRight'),
        manualBinding('按钮1', 0, 'Numpad1'),
        manualBinding('按钮2', 8, 'Numpad2'),
        manualBinding('按钮3', 1, 'Numpad3'),
        manualBinding('按钮4', 9, 'Numpad4'),
        manualBinding('按钮5', 10, 'Numpad5'),
        manualBinding('按钮6', 11, 'Numpad6'),
        binding('按钮1 连打', 0, 'Numpad7', 'p2a'),
        binding('按钮2 连打', 8, 'Numpad8', 'p2b'),
        manualBinding('开始', 3, 'Numpad0'),
        manualBinding('投币', 2, 'NumpadAdd'),
      ],
    };
  }

  if (platform === 'snes' || platform === 'segaMD') {
    return {
      0: [...baseBindings[0].filter((item) => !item.turboKey), manualBinding('C', 9, 'KeyL'), manualBinding('D', 10, 'KeyO'), manualBinding('E', 11, 'KeyP')],
      1: [...baseBindings[1].filter((item) => !item.turboKey), manualBinding('C', 9, 'Numpad3'), manualBinding('D', 10, 'Numpad6'), manualBinding('E', 11, 'Numpad7')],
    };
  }

  return baseBindings;
}

function getKeyBindingStorageKey(gameId: number) {
  return `game-cat-online:key-bindings:${gameId}`;
}

function normalizeBinding(bindingItem: PlayerKeyBinding): PlayerKeyBinding {
  return {
    ...bindingItem,
    keyCode: keyCodeByEventCode[bindingItem.eventCode] ?? bindingItem.keyCode,
    keyLabel: keyLabelByEventCode[bindingItem.eventCode] ?? bindingItem.keyLabel ?? bindingItem.eventCode,
  };
}

function getStoredBinding(bindings: PlayerKeyBinding[] | undefined, label: string) {
  const legacyLabelByLabel: Record<string, string> = {
    'A 连打': 'Turbo A',
    'B 连打': 'Turbo B',
  };

  return bindings?.find((item) => item.label === label || item.label === legacyLabelByLabel[label]);
}

function getSafeStoredBinding(player: 0 | 1, defaultBinding: PlayerKeyBinding, storedBindings: PlayerKeyBinding[] | undefined) {
  const storedBinding = getStoredBinding(storedBindings, defaultBinding.label);
  if (player === 1 && defaultBinding.label === 'Start' && storedBinding?.eventCode === 'NumpadEnter') {
    return undefined;
  }

  return storedBinding;
}

function isVersionedStoredKeyBindings(value: StoredKeyBindings | Partial<PlayerKeyBindings>): value is StoredKeyBindings {
  return 'bindings' in value;
}

export function getDefaultKeyBindings(platform: Game['platform']) {
  const defaults = getDefaultPlayerBindings(platform);
  return {
    0: defaults[0].map(normalizeBinding),
    1: defaults[1].map(normalizeBinding),
  } satisfies PlayerKeyBindings;
}

export function loadKeyBindings(game: Game): PlayerKeyBindings {
  const defaults = getDefaultKeyBindings(game.platform);
  const rawValue = window.localStorage.getItem(getKeyBindingStorageKey(game.id));
  if (!rawValue) {
    return defaults;
  }

  try {
    const parsed = JSON.parse(rawValue) as StoredKeyBindings | Partial<PlayerKeyBindings>;
    const stored: Partial<PlayerKeyBindings> = isVersionedStoredKeyBindings(parsed) ? parsed.bindings ?? {} : parsed;
    if (isVersionedStoredKeyBindings(parsed) && parsed.version !== KEY_BINDINGS_STORAGE_VERSION) {
      window.localStorage.removeItem(getKeyBindingStorageKey(game.id));
      return defaults;
    }

    return {
      0: defaults[0].map((defaultBinding) => normalizeBinding({ ...defaultBinding, ...getSafeStoredBinding(0, defaultBinding, stored[0]) })),
      1: defaults[1].map((defaultBinding) => normalizeBinding({ ...defaultBinding, ...getSafeStoredBinding(1, defaultBinding, stored[1]) })),
    };
  } catch {
    window.localStorage.removeItem(getKeyBindingStorageKey(game.id));
    return defaults;
  }
}

export function saveKeyBindings(gameId: number, bindings: PlayerKeyBindings) {
  window.localStorage.setItem(getKeyBindingStorageKey(gameId), JSON.stringify({ version: KEY_BINDINGS_STORAGE_VERSION, bindings }));
}

export function clearKeyBindings(gameId: number) {
  window.localStorage.removeItem(getKeyBindingStorageKey(gameId));
}

export function createDefaultControllers(bindings: PlayerKeyBindings) {
  const controllers: Record<number, Record<number, { value: number }>> = { 0: {}, 1: {}, 2: {}, 3: {} };
  for (const player of [0, 1] as const) {
    for (const bindingItem of bindings[player]) {
      if (!bindingItem.turboKey && !bindingItem.comboButtonIndexes && !bindingItem.manualInput) {
        controllers[player][bindingItem.buttonIndex] = { value: bindingItem.keyCode };
      }
    }
  }

  return controllers;
}

export function createKeymapGroups(bindings: PlayerKeyBindings): KeymapGroup[] {
  return ([0, 1] as const).map((player) => ({
    title: `${player + 1}P 操作`,
    items: bindings[player].map((bindingItem) => `${bindingItem.keyLabel}: ${bindingItem.label}`),
  }));
}

export function findTurboKey(eventCode: string, bindings: PlayerKeyBindings) {
  return [...bindings[0], ...bindings[1]].find((bindingItem) => bindingItem.turboKey && bindingItem.eventCode === eventCode)?.turboKey ?? null;
}

export function findComboKey(eventCode: string, bindings: PlayerKeyBindings) {
  return ([0, 1] as const)
    .flatMap((player) => bindings[player].map((bindingItem) => ({ player, bindingItem })))
    .find(({ bindingItem }) => bindingItem.comboButtonIndexes && bindingItem.eventCode === eventCode) ?? null;
}

export function findManualInputKey(eventCode: string, bindings: PlayerKeyBindings) {
  return ([0, 1] as const)
    .flatMap((player) => bindings[player].map((bindingItem) => ({ player, bindingItem })))
    .find(({ bindingItem }) => bindingItem.manualInput && !bindingItem.comboButtonIndexes && bindingItem.eventCode === eventCode) ?? null;
}

export function getManualInputKeyCodes(bindings: PlayerKeyBindings) {
  return new Set(
    ([0, 1] as const)
      .flatMap((player) => bindings[player])
      .filter((bindingItem) => bindingItem.manualInput)
      .map((bindingItem) => bindingItem.keyCode),
  );
}
