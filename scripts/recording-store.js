// Screen recordings waiting to be opened in the recording tab (see blob-store.js).
// Recordings are big, so only the last few are kept.

import {createBlobStore} from './blob-store.js';

const recordingStore = createBlobStore({
  dbName: 'qa-utilities-recordings',
  storeName: 'recordings',
  idPrefix: 'rec',
  maxItems: 3
});

export function saveRecording(blob, meta) {
  return recordingStore.save(blob, meta);
}

export function getRecording(id) {
  return recordingStore.get(id);
}
