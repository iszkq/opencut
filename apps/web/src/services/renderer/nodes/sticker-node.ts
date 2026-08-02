import { resolveStickerId } from "@/stickers";
import { decompressFrames, parseGIF } from "gifuct-js";
import {
	VisualNode,
	type ResolvedVisualSourceNodeState,
	type VisualNodeParams,
} from "./visual-node";

export interface StickerNodeParams extends VisualNodeParams {
	stickerId: string;
	intrinsicWidth?: number;
	intrinsicHeight?: number;
}

interface CachedStickerSource {
	width: number;
	height: number;
	isAnimated: boolean;
	getFrameAtTime: ({ timeSeconds }: { timeSeconds: number }) => CanvasImageSource;
}

interface AnimatedFrame {
	source: OffscreenCanvas;
	durationMs: number;
}

interface AnimatedStickerSource extends CachedStickerSource {
	frames: AnimatedFrame[];
	totalDurationMs: number;
	isAnimated: true;
	getFrameAtTime: ({ timeSeconds }: { timeSeconds: number }) => OffscreenCanvas;
}

function cloneCanvas({ source }: { source: OffscreenCanvas }): OffscreenCanvas {
	const canvas = new OffscreenCanvas(source.width, source.height);
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Failed to create GIF frame canvas");
	context.drawImage(source, 0, 0);
	return canvas;
}

function createAnimatedStickerSource({
	data,
}: {
	data: ArrayBuffer;
}): AnimatedStickerSource | null {
	const gif = parseGIF(data);
	const parsedFrames = decompressFrames(gif, true);
	if (parsedFrames.length <= 1 || gif.lsd.width <= 0 || gif.lsd.height <= 0) {
		return null;
	}

	const composed = new OffscreenCanvas(gif.lsd.width, gif.lsd.height);
	const context = composed.getContext("2d");
	if (!context) throw new Error("Failed to create GIF compositor");

	const frames: AnimatedFrame[] = [];
	for (const frame of parsedFrames) {
		const previous = frame.disposalType === 3 ? cloneCanvas({ source: composed }) : null;
		const patchCanvas = new OffscreenCanvas(frame.dims.width, frame.dims.height);
		const patchContext = patchCanvas.getContext("2d");
		if (!patchContext) throw new Error("Failed to create GIF patch canvas");
		patchContext.putImageData(
			new ImageData(frame.patch, frame.dims.width, frame.dims.height),
			0,
			0,
		);
		context.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
		frames.push({
			source: cloneCanvas({ source: composed }),
			// gifuct-js already converts GIF centiseconds to milliseconds.
			durationMs: Math.max(20, frame.delay || 100),
		});

		if (frame.disposalType === 2) {
			context.clearRect(
				frame.dims.left,
				frame.dims.top,
				frame.dims.width,
				frame.dims.height,
			);
		} else if (previous) {
			context.clearRect(0, 0, composed.width, composed.height);
			context.drawImage(previous, 0, 0);
		}
	}

	const totalDurationMs = frames.reduce((total, frame) => total + frame.durationMs, 0);
	if (totalDurationMs <= 0) return null;

	return {
		width: composed.width,
		height: composed.height,
		frames,
		totalDurationMs,
		isAnimated: true,
		getFrameAtTime: ({ timeSeconds }) => {
			let offsetMs = (Math.max(0, timeSeconds) * 1000) % totalDurationMs;
			for (const frame of frames) {
				if (offsetMs < frame.durationMs) return frame.source;
				offsetMs -= frame.durationMs;
			}
			return frames[frames.length - 1].source;
		},
	};
}

async function loadStaticStickerSource({ url }: { url: string }): Promise<CachedStickerSource> {
	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error(`Failed to load sticker: ${url}`));
		image.src = url;
	});

	return {
		width: image.naturalWidth,
		height: image.naturalHeight,
		isAnimated: false,
		getFrameAtTime: () => image,
	};
}

const stickerSourceCache = new Map<string, Promise<CachedStickerSource>>();

export function loadStickerSource({
	stickerId,
}: {
	stickerId: string;
}): Promise<CachedStickerSource> {
	const cached = stickerSourceCache.get(stickerId);
	if (cached) return cached;

	const promise = (async (): Promise<CachedStickerSource> => {
		const url = resolveStickerId({
			stickerId,
			options: { width: 200, height: 200 },
		});

		if (/\.gif(?:$|[?#])/i.test(decodeURIComponent(stickerId))) {
			try {
				const response = await fetch(url);
				if (!response.ok) throw new Error(`Failed to load sticker: ${stickerId}`);
				const animated = createAnimatedStickerSource({
					data: await response.arrayBuffer(),
				});
				if (animated) return animated;
			} catch (error) {
				console.warn("Failed to decode animated sticker, using static fallback", error);
			}
		}

		return loadStaticStickerSource({ url });
	})();

	stickerSourceCache.set(stickerId, promise);
	return promise;
}

export class StickerNode extends VisualNode<
	StickerNodeParams,
	ResolvedVisualSourceNodeState
> {}
