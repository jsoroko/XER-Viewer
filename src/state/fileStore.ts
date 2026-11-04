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
// Files opened lately, for the Compare tools' "Recently opened" list. The details (small) and the bytes (large) are
// kept apart so listing them doesn't mean reading every file into memory.
const RECENT_META = "recent-meta";
const RECENT_DATA = "recent-data";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser doesn't provide local storage for files."));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of [STORE, RECENT_META, RECENT_DATA]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Couldn't open local storage."));
    req.onblocked = () => reject(new Error("Local storage is blocked by another tab."));
  });
}

/** Runs one operation in its own transaction and resolves once the transaction has committed. */
async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
  storeName: string = STORE,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const request = run(tx.objectStore(storeName));
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

export interface RecentFile {
  /** Name and size together: the same file opened again replaces its earlier entry. */
  key: string;
  name: string;
  size: number;
  savedAt: number;
  /** The first project's data date, so a pair of files can be put in date order without opening them. */
  dataDate: number | null;
}

export const recentKey = (name: string, size: number) => `${name}\u0000${size}`;

/** The most files kept, and the most bytes across them (the newest is always kept, however large). */
const RECENT_MAX_FILES = 5;
const RECENT_MAX_BYTES = 250 * 1024 * 1024;

/** Adds a file to the recently opened list, dropping the oldest ones past the limits. */
export async function saveRecentFile(file: RecentFile, buffer: ArrayBuffer): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([RECENT_META, RECENT_DATA], "readwrite");
      const metas = tx.objectStore(RECENT_META);
      const data = tx.objectStore(RECENT_DATA);
      metas.put(file, file.key);
      data.put(buffer, file.key);
      metas.getAll().onsuccess = (e) => {
        const all = (e.target as IDBRequest<RecentFile[]>).result.sort((a, b) => b.savedAt - a.savedAt);
        let bytes = 0;
        all.forEach((m, i) => {
          bytes += m.size;
          if (i >= RECENT_MAX_FILES || (i > 0 && bytes > RECENT_MAX_BYTES)) {
            metas.delete(m.key);
            data.delete(m.key);
          }
        });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Local storage rejected the write."));
      tx.onerror = () => reject(tx.error ?? new Error("Local storage failed."));
    });
  } finally {
    db.close();
  }
}

/** Recently opened files, newest first. */
export async function listRecentFiles(): Promise<RecentFile[]> {
  const all = await withStore<RecentFile[]>("readonly", (s) => s.getAll(), RECENT_META);
  return all.sort((a, b) => b.savedAt - a.savedAt);
}

export async function loadRecentFile(key: string): Promise<ArrayBuffer | null> {
  const found = await withStore<ArrayBuffer | undefined>("readonly", (s) => s.get(key), RECENT_DATA);
  return found ?? null;
}

/** Forgets every recently opened file. */
export async function clearRecentFiles(): Promise<void> {
  await withStore("readwrite", (s) => s.clear(), RECENT_META);
  await withStore("readwrite", (s) => s.clear(), RECENT_DATA);
}

/** Turns a storage failure into something a person can act on. */
export function describeStorageError(e: unknown): string {
  if (e instanceof DOMException && e.name === "QuotaExceededError") {
    return "Not enough browser storage to remember this file.";
  }
  return e instanceof Error && e.message ? e.message : "Couldn't remember this file.";
}
