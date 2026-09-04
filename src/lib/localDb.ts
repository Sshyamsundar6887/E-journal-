/**
 * Local Private Database using Browser IndexedDB
 * Provides 100% offline, private, client-side persistence for "Full-Local mode".
 * Zero telemetry, zero cloud outbound network calls.
 */

import { JournalEntry, ActionItem, LocalDatabaseStats } from '../types';

const DB_NAME = 'AuraJournal_LocalDB';
const DB_VERSION = 1;
const STORE_ENTRIES = 'local_entries';
const STORE_META = 'local_meta';

// Helper to strip undefined values recursively (Zero-Crash Payload Hygiene)
function sanitizePayload<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

/**
 * Open or initialize IndexedDB connection
 */
export function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entryStore = db.createObjectStore(STORE_ENTRIES, { keyPath: 'id' });
        entryStore.createIndex('createdAt', 'createdAt', { unique: false });
        entryStore.createIndex('date', 'date', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      console.error('Failed to open Local IndexedDB:', request.error);
      reject(request.error || new Error('Failed to open Local IndexedDB.'));
    };
  });
}

/**
 * Notify application components that local DB changed
 */
function notifyLocalDbChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('aura_local_db_updated'));
  }
}

function getFallbackStorageKey(userId?: string): string {
  return `aura_local_entries_fallback_${userId || 'guest'}`;
}

/**
 * Retrieve all local journal entries, sorted by createdAt descending
 */
export async function getLocalEntries(userId?: string): Promise<JournalEntry[]> {
  try {
    const db = await openLocalDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_ENTRIES], 'readonly');
      const store = transaction.objectStore(STORE_ENTRIES);
      const request = store.getAll();

      request.onsuccess = () => {
        let rawEntries: JournalEntry[] = request.result || [];
        if (userId) {
          rawEntries = rawEntries.filter((e) => e.userId === userId);
        }
        // Sort descending by createdAt (or date fallback)
        rawEntries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(rawEntries);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to load local journal entries.'));
      };
    });
  } catch (err) {
    console.warn('LocalDB getLocalEntries fallback to localStorage:', err);
    // Fallback to localStorage if IndexedDB encounters sandbox errors
    try {
      const storageKey = getFallbackStorageKey(userId);
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        let parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          if (userId) {
            parsed = parsed.filter((e: any) => e.userId === userId);
          }
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return [];
  }
}

/**
 * Save or update a journal entry in local IndexedDB
 */
export async function saveLocalEntry(entry: JournalEntry): Promise<JournalEntry> {
  const sanitized = sanitizePayload(entry);

  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_ENTRIES], 'readwrite');
      const store = transaction.objectStore(STORE_ENTRIES);
      const request = store.put(sanitized);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to write entry to local database.'));
    });
  } catch (err) {
    console.warn('IndexedDB write failed, committing to localStorage fallback:', err);
    try {
      const storageKey = getFallbackStorageKey(entry.userId);
      const current = await getLocalEntries(entry.userId);
      const filtered = current.filter((e) => e.id !== entry.id);
      filtered.unshift(sanitized);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }

  notifyLocalDbChange();
  return sanitized;
}

/**
 * Delete a journal entry from local IndexedDB
 */
export async function deleteLocalEntry(id: string, userId?: string): Promise<void> {
  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_ENTRIES], 'readwrite');
      const store = transaction.objectStore(STORE_ENTRIES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to erase entry from local database.'));
    });
  } catch (err) {
    console.warn('Local delete fallback:', err);
    try {
      const storageKey = getFallbackStorageKey(userId);
      const current = await getLocalEntries(userId);
      const filtered = current.filter((e) => e.id !== id);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    } catch {
      // ignore
    }
  }

  notifyLocalDbChange();
}

/**
 * Update an action item completion status in local DB
 */
export async function updateLocalActionItem(
  itemId: string,
  completed: boolean
): Promise<void> {
  const entries = await getLocalEntries();
  const targetEntry = entries.find(
    (e) => e.actionItems && e.actionItems.some((a) => a.id === itemId)
  );

  if (!targetEntry) return;

  targetEntry.actionItems = (targetEntry.actionItems || []).map((item) =>
    item.id === itemId ? { ...item, completed } : item
  );

  await saveLocalEntry(targetEntry);
}

/**
 * Add a manual action item to the most recent entry in local DB
 */
export async function addManualLocalActionItem(
  text: string
): Promise<ActionItem | null> {
  const entries = await getLocalEntries();
  if (entries.length === 0) {
    // Create an initial entry for holding the action item if none exist
    const initialEntry: JournalEntry = {
      id: `local_entry_${Date.now()}`,
      userId: 'local_user',
      title: 'Personal Goals & Action Items',
      content: 'Action items recorded in Full-Local mode.',
      date: new Date().toISOString(),
      mood: 'Focused',
      sentiment: 'positive',
      sentimentScore: 0.5,
      themes: ['Productivity', 'Goals'],
      summary: 'Personal commitments logged locally.',
      actionItems: [],
      createdAt: Date.now(),
    };
    entries.push(initialEntry);
  }

  const latest = entries[0];
  const newItem: ActionItem = {
    id: `local_act_${Date.now()}`,
    text,
    completed: false,
  };

  latest.actionItems = [...(latest.actionItems || []), newItem];
  await saveLocalEntry(latest);
  return newItem;
}

/**
 * Delete an action item from local DB
 */
export async function deleteLocalActionItem(itemId: string): Promise<void> {
  const entries = await getLocalEntries();
  const targetEntry = entries.find(
    (e) => e.actionItems && e.actionItems.some((a) => a.id === itemId)
  );

  if (!targetEntry) return;

  targetEntry.actionItems = (targetEntry.actionItems || []).filter(
    (a) => a.id !== itemId
  );

  await saveLocalEntry(targetEntry);
}

/**
 * Compute statistics on local database storage
 */
export async function getLocalDbStats(userId?: string): Promise<LocalDatabaseStats> {
  const entries = await getLocalEntries(userId);
  const actionItemsCount = entries.reduce(
    (acc, e) => acc + (e.actionItems ? e.actionItems.length : 0),
    0
  );

  // Approximate byte footprint
  const jsonString = JSON.stringify(entries);
  const estimatedStorageBytes = new Blob([jsonString]).size;

  return {
    entryCount: entries.length,
    actionItemCount: actionItemsCount,
    estimatedStorageBytes,
    lastUpdated: Date.now(),
  };
}

/**
 * Clear all data in local database
 */
export async function clearLocalDb(): Promise<void> {
  try {
    const db = await openLocalDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_ENTRIES], 'readwrite');
      const store = transaction.objectStore(STORE_ENTRIES);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error('Failed to wipe local database.'));
    });
  } catch (err) {
    console.warn('Failed clearing IndexedDB, clearing fallback:', err);
  }

  try {
    localStorage.removeItem('aura_local_entries_fallback');
  } catch {
    // ignore
  }

  notifyLocalDbChange();
}

/**
 * Export all local database entries as JSON
 */
export async function exportLocalDbAsJson(): Promise<string> {
  const entries = await getLocalEntries();
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      app: 'Aura Journal (Full-Local Database)',
      formatVersion: 1,
      totalEntries: entries.length,
      entries,
    },
    null,
    2
  );
}
