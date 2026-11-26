// Screenshots waiting to be opened in the editor tab (see blob-store.js).

import {createBlobStore} from './blob-store.js';

const captureStore = createBlobStore({
  dbName: 'qa-utilities-screenshots',
  storeName: 'captures',
  idPrefix: 'cap',
  maxItems: 10
});

export function saveCapture(blob, meta) {
  return captureStore.save(blob, meta);
}

export function getCapture(id) {
  return captureStore.get(id);
}
