import type { MediaAsset } from "@/media/types";
import type { TScene, VideoElement } from "@/timeline";
import { TICKS_PER_SECOND } from "@/wasm";

export type NativeExportResult = {
	outputPath?: string;
	mode: "stream-copy" | "hardware" | "cpu";
	cancelled?: boolean;
};

type DesktopBridge = {
	exportNativeVideo: (params: {
		projectName: string;
		includeAudio: boolean;
		clips: Array<{ file: File; trimStartSeconds: number; durationSeconds: number }>;
	}) => Promise<{ cancelled?: boolean; outputPath?: string; encoder?: string }>;
	exportRenderedVideo: (params: {
		projectName: string;
		includeAudio: boolean;
		video: ArrayBuffer;
	}) => Promise<{ cancelled?: boolean; outputPath?: string; encoder?: string }>;
	showInFolder: (filePath: string) => Promise<void>;
};

function getDesktopBridge(): DesktopBridge | null {
	return (window as Window & { opencutDesktop?: DesktopBridge }).opencutDesktop ?? null;
}

function isNativeCompatibleVideo(element: VideoElement): boolean {
	return !(
		element.retime ||
		element.effects?.length ||
		element.masks?.length ||
		element.animations?.length ||
		element.transitionIn ||
		element.transitionOut ||
		element.hidden
	);
}

function buildNativeTimeline({ scene, mediaAssets }: { scene: TScene; mediaAssets: MediaAsset[] }) {
	if (scene.tracks.overlay.some((track) => track.elements.length > 0)) return null;
	const videos = scene.tracks.main.elements;
	if (videos.length === 0 || videos.some((element) => element.type !== "video")) return null;

	let expectedStart = 0;
	const clips: Array<{ file: File; trimStartSeconds: number; durationSeconds: number }> = [];
	for (const element of videos) {
		if (element.type !== "video" || !isNativeCompatibleVideo(element)) return null;
		if (Math.abs(Number(element.startTime) - expectedStart) > 1) return null;
		const asset = mediaAssets.find((candidate) => candidate.id === element.mediaId && candidate.type === "video");
		if (!asset) return null;
		const durationSeconds = Number(element.duration) / TICKS_PER_SECOND;
		if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
		clips.push({
			file: asset.file,
			trimStartSeconds: Number(element.trimStart) / TICKS_PER_SECOND,
			durationSeconds,
		});
		expectedStart = Number(element.startTime) + Number(element.duration);
	}
	return clips;
}

export function canUseDesktopNativeExport({ scene, mediaAssets }: { scene: TScene; mediaAssets: MediaAsset[] }): boolean {
	return Boolean(getDesktopBridge() && buildNativeTimeline({ scene, mediaAssets }));
}

export async function tryNativeExport({
	scene,
	mediaAssets,
	includeAudio,
	projectName,
}: {
	scene: TScene;
	mediaAssets: MediaAsset[];
	includeAudio: boolean;
	projectName: string;
}): Promise<NativeExportResult | null> {
	const clips = buildNativeTimeline({ scene, mediaAssets });
	if (!clips) return null;

	const desktop = getDesktopBridge();
	if (desktop) {
		const result = await desktop.exportNativeVideo({ projectName, includeAudio, clips });
		if (result.cancelled || !result.outputPath) return { mode: "hardware", cancelled: true };
		return {
			outputPath: result.outputPath,
			mode: result.encoder === "libx264" ? "cpu" : "hardware",
		};
	}

	return null;
}

export async function revealNativeExport({ outputPath }: { outputPath: string }): Promise<void> {
	await getDesktopBridge()?.showInFolder(outputPath);
}

export async function exportRenderedTimeline({ projectName, includeAudio, video }: {
	projectName: string;
	includeAudio: boolean;
	video: ArrayBuffer;
}): Promise<NativeExportResult | null> {
	const desktop = getDesktopBridge();
	if (!desktop) return null;
	const result = await desktop.exportRenderedVideo({ projectName, includeAudio, video });
	if (result.cancelled || !result.outputPath) return { mode: "hardware", cancelled: true };
	return { outputPath: result.outputPath, mode: result.encoder === "libx264" ? "cpu" : "hardware" };
}
