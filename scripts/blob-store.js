// Keeps big binary files (screenshots, screen recordings) in IndexedDB, so another extension page
// can open them by id. IndexedDB is used instead of localStorage because the files are large.
// Only the newest `maxItems` records are kept, so the extension does not grow without limit.

export function createBlobStore({dbName, storeName, idPrefix, maxItems}) {
  let dbPromise = null;

  function openDatabase() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);

        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore(storeName, {keyPath: 'id'});
          store.createIndex('createdAt', 'meta.createdAt');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          dbPromise = null;
          reject(request.error);
        };
      });
    }

    return dbPromise;
  }

  function runTransaction(mode, callback) {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const result = callback(transaction.objectStore(storeName));

      transaction.oncomplete = () => resolve(result?.result ?? result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    }));
  }

  async function pruneOldItems() {
    const ids = await runTransaction('readonly', store => store.index('createdAt').getAllKeys());

    if (ids.length <= maxItems) {
      return;
    }

    const idsToDelete = ids.slice(0, ids.length - maxItems);
    await runTransaction('readwrite', store => {
      idsToDelete.forEach(id => store.delete(id));
    });
  }

  return {
    // `meta` must contain createdAt (used to find the oldest records). Returns the new id.
    async save(blob, meta) {
      const id = `${idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await runTransaction('readwrite', store => store.put({id, blob, meta}));
      await pruneOldItems();
      return id;
    },

    // Returns {id, blob, meta} or undefined.
    get(id) {
      return runTransaction('readonly', store => store.get(id));
    }
  };
}
