// Stores screenshots in IndexedDB so the editor tab can open them by id.
// IndexedDB is used instead of localStorage because screenshots are large binary images.

const DB_NAME = 'qa-utilities-screenshots';
const DB_VERSION = 1;
const STORE_NAME = 'captures';
const MAX_STORED_CAPTURES = 10;

let dbPromise = null;

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE_NAME, {keyPath: 'id'});
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
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const result = callback(store);

    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

// Deletes the oldest screenshots so the extension does not grow without limit.
async function pruneOldCaptures() {
  const ids = await runTransaction('readonly', store => store.index('createdAt').getAllKeys());

  if (ids.length <= MAX_STORED_CAPTURES) {
    return;
  }

  const idsToDelete = ids.slice(0, ids.length - MAX_STORED_CAPTURES);
  await runTransaction('readwrite', store => {
    idsToDelete.forEach(id => store.delete(id));
  });
}

export async function saveCapture(blob, meta) {
  const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await runTransaction('readwrite', store => store.put({id, blob, meta}));
  await pruneOldCaptures();
  return id;
}

export async function getCapture(id) {
  return runTransaction('readonly', store => store.get(id));
}
