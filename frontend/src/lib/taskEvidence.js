const DATABASE_NAME = 'daymark-evidence';
const STORE_NAME = 'attachments';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open attachment storage.'));
  });
}

export async function saveLocalEvidence(id, file) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ id, file });
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Could not save this attachment.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Could not save this attachment.'));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
  });
}

export async function getLocalEvidence(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    request.onsuccess = () => {
      database.close();
      resolve(request.result?.file ?? null);
    };
    request.onerror = () => {
      database.close();
      reject(request.error || new Error('Could not load this attachment.'));
    };
  });
}

export async function deleteLocalEvidence(id) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error('Could not delete this attachment.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || new Error('Could not delete this attachment.'));
    };
  });
}
