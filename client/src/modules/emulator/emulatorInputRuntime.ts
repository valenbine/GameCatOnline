import type { Game } from '../../types/game';
import { getManualInputKeyCodes, type PlayerKeyBindings } from './keyBindings';
import type { EmulatorJsInstance, EmulatorJsRuntimeInstance } from './emulatorRuntime';

const RESERVED_HOTKEY_BUTTONS = [24, 25, 26, 27, 28, 29] as const;
const NUMPAD_ZERO_KEY_CODE = 96;
const NUMPAD_DECIMAL_KEY_CODE = 110;
const START_BUTTON_INDEX = 3;

export function consumeKeyboardEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
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

export function stripManualInputKeyCodes(instance: EmulatorJsInstance, keyBindings: PlayerKeyBindings) {
  const runtimeInstance = instance as EmulatorJsRuntimeInstance;
  const manualKeyCodes = getManualInputKeyCodes(keyBindings);
  manualKeyCodes.add(NUMPAD_ZERO_KEY_CODE);
  manualKeyCodes.add(NUMPAD_DECIMAL_KEY_CODE);
  if (manualKeyCodes.size === 0) {
    return;
  }

  for (const player of [0, 1, 2, 3]) {
    for (const buttonIndex of Object.keys(runtimeInstance.controls?.[player] ?? {})) {
      const control = runtimeInstance.controls?.[player]?.[Number(buttonIndex)];
      if (control?.value !== undefined && manualKeyCodes.has(control.value)) {
        delete runtimeInstance.controls?.[player]?.[Number(buttonIndex)];
      }
    }

    for (const buttonIndex of Object.keys(runtimeInstance.defaultControllers?.[player] ?? {})) {
      const control = runtimeInstance.defaultControllers?.[player]?.[Number(buttonIndex)];
      if (control?.value !== undefined && manualKeyCodes.has(control.value)) {
        delete runtimeInstance.defaultControllers?.[player]?.[Number(buttonIndex)];
      }
    }
  }

  runtimeInstance.saveSettings?.();
}

export function stripNativeStartControls(instance: EmulatorJsInstance) {
  const runtimeInstance = instance as EmulatorJsRuntimeInstance;
  for (const player of [0, 1, 2, 3]) {
    delete runtimeInstance.controls?.[player]?.[START_BUTTON_INDEX];
    delete runtimeInstance.defaultControllers?.[player]?.[START_BUTTON_INDEX];
  }

  runtimeInstance.saveSettings?.();
}

export function stripNativeKeyboardControls(instance: EmulatorJsInstance) {
  const runtimeInstance = instance as EmulatorJsRuntimeInstance;
  runtimeInstance.controls = { 0: {}, 1: {}, 2: {}, 3: {} };
  runtimeInstance.defaultControllers = { 0: {}, 1: {}, 2: {}, 3: {} };
  runtimeInstance.saveSettings?.();
}

export function getPlatformLabel(platform: Game['platform']) {
  const labels: Record<Game['platform'], string> = {
    arcade: '街机 / FBNeo',
    cps1: '街机 / CPS1',
    cps2: '街机 / CPS2',
    gb: 'GB',
    gba: 'GBA',
    gbc: 'GBC',
    mame: '街机 / MAME 2003 Plus',
    nes: 'FC / NES',
    pce: 'PCE',
    segaMD: 'MD / Genesis',
    snes: 'SFC / SNES',
  };

  return labels[platform];
}
