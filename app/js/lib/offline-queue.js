/* ═══════════════════════════════════════════════════════════════════
   NICE — Offline Queue
   Queues mutations when offline, flushes when back online.
   Uses IndexedDB for persistence.
═══════════════════════════════════════════════════════════════════ */

const OfflineQueue = (() => {
  const DB_NAME = 'nice-offline-queue';
  const STORE_NAME = 'mutations';
  const DB_VERSION = 1;
  let _db = null;

  function _openDB() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
      request.onerror = () => reject(request.error);
    });
  }

  async function queue(operation) {
    try {
      const db = await _openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add({
        type: operation.type,     // 'create' | 'update' | 'delete'
        table: operation.table,
        data: operation.data,
        timestamp: Date.now(),
      });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      _updateBadge();
    } catch (err) {
      console.warn('[OfflineQueue] Failed to queue operation:', err);
    }
  }

  async function flush() {
    try {
      const db = await _openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      const items = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      if (!items.length) return;

      for (const item of items) {
        try {
          if (typeof SB === 'undefined') break;
          const db_api = SB.db(item.table);
          if (item.type === 'create') await db_api.create(item.data);
          else if (item.type === 'update') await db_api.update(item.data.id, item.data);
          else if (item.type === 'delete') await db_api.remove(item.data.id || item.data);

          // Remove successfully processed item
          const delTx = (await _openDB()).transaction(STORE_NAME, 'readwrite');
          delTx.objectStore(STORE_NAME).delete(item.id);
          await new Promise((resolve) => { delTx.oncomplete = resolve; });
        } catch (err) {
          console.warn('[OfflineQueue] Flush failed for item:', item, err);
          break; // Stop on first failure to maintain order
        }
      }
      _updateBadge();
    } catch (err) {
      console.warn('[OfflineQueue] Flush error:', err);
    }
  }

  async function getPendingCount() {
    try {
      const db = await _openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      return new Promise((resolve) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(0);
      });
    } catch { return 0; }
  }

  async function _updateBadge() {
    const count = await getPendingCount();
    const badge = document.getElementById('offline-queue-badge');
    if (badge) {
      badge.textContent = count > 0 ? count : '';
      badge.style.display = count > 0 ? '' : 'none';
    }
  }

  function init() {
    _openDB().catch(() => {});

    // Auto-flush when coming back online
    window.addEventListener('online', () => {
      console.info('[OfflineQueue] Back online, flushing queue...');
      flush();
    });

    // Update badge on init
    setTimeout(_updateBadge, 1000);
  }

  return { queue, flush, getPendingCount, init };
})();
