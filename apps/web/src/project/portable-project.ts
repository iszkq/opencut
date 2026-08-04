import type { MediaAsset, MediaType } from "@/media/types";
import type { TProject } from "@/project/types";
import { storageService } from "@/services/storage/service";
import type { SceneTracks } from "@/timeline";
import { generateUUID } from "@/utils/id";

const PORTABLE_PROJECT_FORMAT = "opencut-project";
const PORTABLE_PROJECT_VERSION = 1;

type PortableProject = Omit<TProject, "metadata" | "scenes"> & {
	metadata: Omit<TProject["metadata"], "createdAt" | "updatedAt"> & {
		createdAt: string;
		updatedAt: string;
	};
	scenes: Array<
		Omit<TProject["scenes"][number], "createdAt" | "updatedAt"> & {
			createdAt: string;
			updatedAt: string;
		}
	>;
};

type PortableMediaAsset = {
	id: string;
	name: string;
	type: MediaType;
	size: number;
	lastModified: number;
	mimeType: string;
	data: string;
	width?: number;
	height?: number;
	duration?: number;
	fps?: number;
	hasAudio?: boolean;
	ephemeral?: boolean;
	thumbnailUrl?: string;
};

type PortableProjectFile = {
	format: typeof PORTABLE_PROJECT_FORMAT;
	formatVersion: typeof PORTABLE_PROJECT_VERSION;
	exportedAt: string;
	project: PortableProject;
	assets: PortableMediaAsset[];
};

type ProjectPackageDesktopBridge = {
	saveProjectPackage: (params: {
		projectName: string;
		data: ArrayBuffer;
	}) => Promise<{ cancelled?: boolean; outputPath?: string }>;
	openProjectPackage: () => Promise<
		{ cancelled: true } | { cancelled?: false; name: string; data: ArrayBuffer }
	>;
};

function getDesktopBridge(): ProjectPackageDesktopBridge | null {
	return (
		(window as Window & { opencutDesktop?: ProjectPackageDesktopBridge })
			.opencutDesktop ?? null
	);
}

function stripAudioBuffers({ tracks }: { tracks: SceneTracks }): SceneTracks {
	return {
		...tracks,
		audio: tracks.audio.map((track) => ({
			...track,
			elements: track.elements.map((element) => {
				const { buffer: _buffer, ...serializedElement } = element;
				return serializedElement;
			}),
		})),
	};
}

function serializeProject({ project }: { project: TProject }): PortableProject {
	return {
		...project,
		metadata: {
			...project.metadata,
			createdAt: project.metadata.createdAt.toISOString(),
			updatedAt: project.metadata.updatedAt.toISOString(),
		},
		scenes: project.scenes.map((scene) => ({
			...scene,
			tracks: stripAudioBuffers({ tracks: scene.tracks }),
			createdAt: scene.createdAt.toISOString(),
			updatedAt: scene.updatedAt.toISOString(),
		})),
	};
}

function restoreProject({ project }: { project: PortableProject }): TProject {
	const importedAt = new Date();
	return {
		...project,
		metadata: {
			...project.metadata,
			// Importing always creates a separate project, so it cannot overwrite a
			// project with the same id on the receiving device.
			id: generateUUID(),
			name: `${project.metadata.name}（导入）`,
			createdAt: importedAt,
			updatedAt: importedAt,
		},
		scenes: project.scenes.map((scene) => ({
			...scene,
			createdAt: new Date(scene.createdAt),
			updatedAt: new Date(scene.updatedAt),
		})),
	};
}

async function encodeFile({ file }: { file: File }): Promise<string> {
	const bytes = new Uint8Array(await file.arrayBuffer());
	const chunkSize = 0x8000;
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += chunkSize) {
		binary += String.fromCharCode(
			...bytes.subarray(offset, offset + chunkSize),
		);
	}
	return btoa(binary);
}

function decodeFile({ asset }: { asset: PortableMediaAsset }): File {
	const binary = atob(asset.data);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return new File([bytes], asset.name, {
		type: asset.mimeType || "application/octet-stream",
		lastModified: asset.lastModified,
	});
}

function safeFileName({ name }: { name: string }): string {
	const clean = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
	return clean || "OpenCut 工程";
}

function downloadInBrowser({
	blob,
	projectName,
}: {
	blob: Blob;
	projectName: string;
}): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${safeFileName({ name: projectName })}.opencut`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPortableProject({
	project,
	assets,
}: {
	project: TProject;
	assets: MediaAsset[];
}): Promise<{ cancelled: boolean; outputPath?: string }> {
	const portable: PortableProjectFile = {
		format: PORTABLE_PROJECT_FORMAT,
		formatVersion: PORTABLE_PROJECT_VERSION,
		exportedAt: new Date().toISOString(),
		project: serializeProject({ project }),
		assets: await Promise.all(
			assets
				.filter((asset) => !asset.ephemeral)
				.map(async (asset) => ({
					id: asset.id,
					name: asset.name,
					type: asset.type,
					size: asset.file.size,
					lastModified: asset.file.lastModified,
					mimeType: asset.file.type,
					data: await encodeFile({ file: asset.file }),
					width: asset.width,
					height: asset.height,
					duration: asset.duration,
					fps: asset.fps,
					hasAudio: asset.hasAudio,
					thumbnailUrl: asset.thumbnailUrl,
				})),
		),
	};
	const blob = new Blob([JSON.stringify(portable)], {
		type: "application/x-opencut-project+json",
	});

	const desktop = getDesktopBridge();
	if (desktop) {
		const result = await desktop.saveProjectPackage({
			projectName: project.metadata.name,
			data: await blob.arrayBuffer(),
		});
		return {
			cancelled: Boolean(result.cancelled),
			outputPath: result.outputPath,
		};
	}

	downloadInBrowser({ blob, projectName: project.metadata.name });
	return { cancelled: false };
}

function isPortableProjectFile(value: unknown): value is PortableProjectFile {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as Partial<PortableProjectFile>;
	return (
		candidate.format === PORTABLE_PROJECT_FORMAT &&
		candidate.formatVersion === PORTABLE_PROJECT_VERSION &&
		typeof candidate.project === "object" &&
		candidate.project !== null &&
		Array.isArray(candidate.assets)
	);
}

export async function pickPortableProjectFile(): Promise<File | null> {
	const desktop = getDesktopBridge();
	if (desktop) {
		const result = await desktop.openProjectPackage();
		if (result.cancelled || !("data" in result)) return null;
		return new File([result.data], result.name, {
			type: "application/x-opencut-project+json",
		});
	}

	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept =
			".opencut,application/x-opencut-project+json,application/json";
		input.addEventListener("change", () => resolve(input.files?.[0] ?? null), {
			once: true,
		});
		input.click();
	});
}

export async function importPortableProject({
	file,
}: {
	file: File;
}): Promise<string> {
	let decoded: unknown;
	try {
		decoded = JSON.parse(await file.text());
	} catch {
		throw new Error("工程文件无法读取，可能已损坏");
	}
	if (!isPortableProjectFile(decoded)) {
		throw new Error("这不是 OpenCut 工程文件，或版本不受支持");
	}

	const project = restoreProject({ project: decoded.project });
	await storageService.saveProject({ project });

	try {
		for (const asset of decoded.assets) {
			if (
				!asset ||
				typeof asset !== "object" ||
				typeof asset.data !== "string"
			) {
				throw new Error("工程文件中的素材数据不完整");
			}
			const fileAsset = decodeFile({ asset });
			await storageService.saveMediaAsset({
				projectId: project.metadata.id,
				mediaAsset: {
					id: asset.id,
					name: asset.name,
					type: asset.type,
					file: fileAsset,
					url: URL.createObjectURL(fileAsset),
					width: asset.width,
					height: asset.height,
					duration: asset.duration,
					fps: asset.fps,
					hasAudio: asset.hasAudio,
					thumbnailUrl: asset.thumbnailUrl,
				},
			});
		}
		return project.metadata.id;
	} catch (error) {
		await storageService.deleteProjectMedia({ projectId: project.metadata.id });
		await storageService.deleteProject({ id: project.metadata.id });
		throw error;
	}
}
