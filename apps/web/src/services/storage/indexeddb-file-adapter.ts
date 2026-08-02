import type { StorageAdapter } from "./types";

type StoredFile = {
	id: string;
	file: File;
};

/** Stores File objects in IndexedDB when the browser blocks OPFS. */
export class IndexedDBFileAdapter implements StorageAdapter<File> {
	private readonly dbName: string;
	private readonly storeName: string;

	constructor({
		dbName,
		storeName = "files",
	}: {
		dbName: string;
		storeName?: string;
	}) {
		this.dbName = dbName;
		this.storeName = storeName;
	}

	private async getDB(): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);

			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
			request.onupgradeneeded = (event) => {
				if (!(event.target instanceof IDBOpenDBRequest)) {
					reject(new Error("Could not open IndexedDB storage."));
					return;
				}

				const db = event.target.result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					db.createObjectStore(this.storeName, { keyPath: "id" });
				}
			};
		});
	}

	async get(key: string): Promise<File | null> {
		const db = await this.getDB();
		const transaction = db.transaction(this.storeName, "readonly");
		const request = transaction.objectStore(this.storeName).get(key);

		return new Promise((resolve, reject) => {
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result;
				if (
					typeof result === "object" &&
					result !== null &&
					"file" in result &&
					result.file instanceof File
				) {
					resolve(result.file);
					return;
				}
				resolve(null);
			};
		});
	}

	async set({ key, value }: { key: string; value: File }): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction(this.storeName, "readwrite");
		const request = transaction.objectStore(this.storeName).put({
			id: key,
			file: value,
		} satisfies StoredFile);

		return new Promise((resolve, reject) => {
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async remove(key: string): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction(this.storeName, "readwrite");
		const request = transaction.objectStore(this.storeName).delete(key);

		return new Promise((resolve, reject) => {
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async list(): Promise<string[]> {
		const db = await this.getDB();
		const transaction = db.transaction(this.storeName, "readonly");
		const request = transaction.objectStore(this.storeName).getAllKeys();

		return new Promise((resolve, reject) => {
			request.onerror = () => reject(request.error);
			request.onsuccess = () =>
				resolve(request.result.filter((key): key is string => typeof key === "string"));
		});
	}

	async clear(): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction(this.storeName, "readwrite");
		const request = transaction.objectStore(this.storeName).clear();

		return new Promise((resolve, reject) => {
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}
}
