export type SessionRecord = {
  id: string;
  exerciseId: string;
  title: string;
  startedAt: string;
  durationMs: number;
  bpm: number;
  rounds: number;
  rating: number | null;
};

const DB = "articulation-trainer";
const STORE = "sessions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB"));
  });
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("save"));
  });
  db.close();
}

export async function listSessions(): Promise<SessionRecord[]> {
  const db = await openDb();
  const rows = await new Promise<SessionRecord[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as SessionRecord[]);
    request.onerror = () => reject(request.error ?? new Error("read"));
  });
  db.close();
  return rows.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function clearSessions(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("clear"));
  });
  db.close();
}
