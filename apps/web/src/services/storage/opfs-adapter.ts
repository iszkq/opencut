import type { StorageAdapter } from "./types";
import { IndexedDBFileAdapter } from "./indexeddb-file-adapter";

export class OPFSAdapter implements StorageAdapter<File> {
	private directoryName: string;
	private useIndexedDBFallback = false;
	private readonly indexedDBFallback: IndexedDBFileAdapter;

	constructor(directoryName = "media") {
		this.directoryName = directoryName;
		this.indexedDBFallback = new IndexedDBFileAdapter({
			dbName: `opencut-${directoryName}`,
		});
	}

	private async getDirectory(): Promise<FileSystemDirectoryHandle> {
		const opfsRoot = await navigator.storage.getDirectory();
		return await opfsRoot.getDirectoryHandle(this.directoryName, {
			create: true,
		});
	}

	private async withFallback<T>({
		opfs,
		indexedDB,
	}: {
		opfs: () => Promise<T>;
		indexedDB: () => Promise<T>;
	}): Promise<T> {
		if (this.useIndexedDBFallback) {
			return indexedDB();
		}

		try {
			return await opfs();
		} catch (error) {
			const name = error instanceof Error ? error.name : "";
			if (name !== "SecurityError" && name !== "NotAllowedError") {
				throw error;
			}

			this.useIndexedDBFallback = true;
			console.warn(
				"OPFS is unavailable in this browser; storing media in IndexedDB instead.",
				error,
			);
			return indexedDB();
		}
	}

	async get(key: string): Promise<File | null> {
		return this.withFallback({
			opfs: async () => {
				try {
			const directory = await this.getDirectory();
			const fileHandle = await directory.getFileHandle(key);
			return await fileHandle.getFile();
				} catch (error) {
					if (error instanceof Error && error.name === "NotFoundError") {
						return null;
					}
					throw error;
			}
			},
			indexedDB: () => this.indexedDBFallback.get(key),
		});
	}

	async set({
		key,
		value: file,
	}: {
		key: string;
		value: File;
	}): Promise<void> {
		return this.withFallback({
			opfs: async () => {
				const directory = await this.getDirectory();
				const fileHandle = await directory.getFileHandle(key, { create: true });
				const writable = await fileHandle.createWritable();

				await writable.write(file);
				await writable.close();
			},
			indexedDB: () => this.indexedDBFallback.set({ key, value: file }),
		});
	}

	async remove(key: string): Promise<void> {
		return this.withFallback({
			opfs: async () => {
				try {
					const directory = await this.getDirectory();
					await directory.removeEntry(key);
				} catch (error) {
					if (!(error instanceof Error) || error.name !== "NotFoundError") {
						throw error;
					}
				}
			},
			indexedDB: () => this.indexedDBFallback.remove(key),
		});
	}

	async list(): Promise<string[]> {
		return this.withFallback({
			opfs: async () => {
				const directory = await this.getDirectory();
				const keys: string[] = [];

				for await (const name of directory.keys()) {
					keys.push(name);
				}

				return keys;
			},
			indexedDB: () => this.indexedDBFallback.list(),
		});
	}

	async clear(): Promise<void> {
		return this.withFallback({
			opfs: async () => {
				const directory = await this.getDirectory();

				for await (const name of directory.keys()) {
					await directory.removeEntry(name);
				}
			},
			indexedDB: () => this.indexedDBFallback.clear(),
		});
	}

	// Helper method to check OPFS support
	static isSupported(): boolean {
		return "storage" in navigator && "getDirectory" in navigator.storage;
	}
}
