/**
 * Remembers the most recently opened file across page loads.
 *
 * IndexedDB rather than localStorage: XER files are routinely tens of megabytes, and localStorage's
 * ~5 MB quota would fail on exactly the files worth remembering. The raw bytes are stored (not the
 * decoded text) so encoding detection behaves the same on restore as on first open.
 */

export interface StoredFile {
  name: string;
  size: number;
  savedAt: number;
  buffer: ArrayBuffer;
}

const DB_NAME = "xerview";
const STORE = "files";
const KEY = "last";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't provide local storage for files."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open local storage."));
    req.onblocked = () => reject(new Error("Local storage is blocked by another tab."));
  });
}

/** Runs one operation in its own transaction and resolves once the transaction has committed. */
async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("Local storage rejected the write."));
      tx.onerror = () => reject(tx.error ?? new Error("Local storage failed."));
    });
  } finally {
    db.close();
  }
}

export const saveLastFile = (file: StoredFile) => withStore("readwrite", (s) => s.put(file, KEY)).then(() => undefined);

export async function loadLastFile(): Promise<StoredFile | null> {
  const found = await withStore<StoredFile | undefined>("readonly", (s) => s.get(KEY));
  return found ?? null;
}

export const clearLastFile = () => withStore("readwrite", (s) => s.delete(KEY)).then(() => undefined);

/** Turns a storage failure into something a person can act on. */
export function describeStorageError(e: unknown): string {
  if (e instanceof DOMException && e.name === "QuotaExceededError") {
    return "Not enough browser storage to remember this file.";
  }
  return e instanceof Error && e.message ? e.message : "Couldn't remember this file.";
}
