/**
 * llmCache.ts
 *
 * IndexedDB-backed response cache for Gemini calls.
 *
 * Cache key is a deterministic hash of (model, compacted prompt, schema
 * fingerprint, temperature).  Entries expire after `TTL_MS` (default 24 h)
 * so stale data is never served indefinitely.
 *
 * All operations are async and safe to call concurrently.
 */

const DB_NAME = 'LlmCacheDB';
const STORE_NAME = 'responses';
const DB_VERSION = 1;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ── DB helpers ────────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
  });
}

// ── Key generation ────────────────────────────────────────────────────────────

/**
 * Simple, deterministic string hash (djb2).
 * Not cryptographic – only needs to be collision-resistant within a cache.
 */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // keep 32-bit unsigned
  }
  return h.toString(16);
}

export interface CacheKeyParams {
  model: string;
  prompt: string;
  /** Pass the schema object; it will be JSON-stringified for fingerprinting. */
  schema?: unknown;
  temperature?: number;
}

export function buildCacheKey(params: CacheKeyParams): string {
  const raw = [
    params.model,
    params.prompt,
    params.schema ? JSON.stringify(params.schema) : '',
    String(params.temperature ?? 1),
  ].join('\x00');
  return hashString(raw);
}

// ── Cache entry ───────────────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  response: string;
  createdAt: number;
  expiresAt: number;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function cacheGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) { resolve(null); return; }
        if (Date.now() > entry.expiresAt) {
          // Expired – delete async, return null
          cacheDelete(key).catch(() => {});
          resolve(null);
          return;
        }
        resolve(entry.response);
      };
    });
  } catch {
    return null; // Never let cache errors break the main flow
  }
}

export async function cacheSet(key: string, response: string): Promise<void> {
  try {
    const db = await openDb();
    const entry: CacheEntry = {
      key,
      response,
      createdAt: Date.now(),
      expiresAt: Date.now() + TTL_MS,
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {
    // Cache write failures are non-fatal
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {}
}

/** Remove all expired entries.  Call this on app startup to prevent DB bloat. */
export async function evictExpired(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const idx = store.index('expiresAt');
      const range = IDBKeyRange.upperBound(Date.now());
      const req = idx.openCursor(range);
      req.onerror = () => reject(req.error);
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } catch {}
}

/** Return approximate number of entries in the cache (for UI stats). */
export async function cacheCount(): Promise<number> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  } catch {
    return 0;
  }
}

/** Clear all cache entries (e.g., user action). */
export async function cacheClear(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve();
    });
  } catch {}
}
