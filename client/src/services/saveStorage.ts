const databaseName = 'game-cat-online-saves';
const storeName = 'save-states';

type SaveStateRecord = {
  id: string;
  gameId: number;
  slot: number;
  payload: string;
  updatedAt: string;
  screenshotDataUrl: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveGameState(gameId: number, slot: number, payload: string, screenshotDataUrl: string) {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).put({
      id: `${gameId}:${slot}`,
      gameId,
      slot,
      payload,
      updatedAt: new Date().toISOString(),
      screenshotDataUrl,
    } satisfies SaveStateRecord);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  database.close();
}

export async function loadGameState(gameId: number, slot: number) {
  const database = await openDatabase();

  const result = await new Promise<SaveStateRecord | undefined>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(`${gameId}:${slot}`);

    request.onsuccess = () => resolve(request.result as SaveStateRecord | undefined);
    request.onerror = () => reject(request.error);
  });

  database.close();
  return result ?? null;
}

export async function listGameStates(gameId: number) {
  const database = await openDatabase();

  const result = await new Promise<SaveStateRecord[]>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();

    request.onsuccess = () => {
      const rows = ((request.result as SaveStateRecord[]) ?? [])
        .filter((item) => item.gameId === gameId)
        .sort((left, right) => left.slot - right.slot);

      resolve(rows);
    };

    request.onerror = () => reject(request.error);
  });

  database.close();
  return result;
}

export async function deleteGameState(gameId: number, slot: number) {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).delete(`${gameId}:${slot}`);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  database.close();
}
