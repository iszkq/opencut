import { drawCssBackground } from "@/gradients";
import { getMaskDefinition } from "@/masks";
import { incrementCounter } from "@/diagnostics/render-perf";
import type { AnyBaseNode } from "../nodes/base-node";
import type { CanvasRenderer } from "../canvas-renderer";
import { createCanvasSurface } from "../canvas-utils";
import { BlurBackgroundNode } from "../nodes/blur-background-node";
import { ColorNode } from "../nodes/color-node";
import { EffectLayerNode } from "../nodes/effect-layer-node";
import {
	GraphicNode,
	type ResolvedGraphicNodeState,
} from "../nodes/graphic-node";
import { ImageNode } from "../nodes/image-node";
import { RootNode } from "../nodes/root-node";
import { StickerNode } from "../nodes/sticker-node";
import { renderTextToContext, TextNode } from "../nodes/text-node";
import { VideoNode } from "../nodes/video-node";
import type { ResolvedVisualSourceNodeState } from "../nodes/visual-node";
import type {
	FrameDescriptor,
	FrameItemDescriptor,
	LayerMaskDescriptor,
	QuadTransformDescriptor,
	TextureCanvasDrawFn,
	TextureUploadDescriptor,
} from "./types";
import { DEFAULT_GRAPHIC_SOURCE_SIZE } from "@/graphics";
import { HAND_DRAW_SHADER } from "@/effects/definitions/hand-draw";
import type { EffectPass } from "@/effects/types";

type PencilStroke = {
	points: Array<{ x: number; y: number }>;
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
};

type HandDrawRegion = {
	order: number;
	x: number;
	y: number;
	width: number;
	height: number;
	drawOrder: number;
};

type PencilSketchCacheEntry = {
	canvas: OffscreenCanvas;
	width: number;
	height: number;
	lineStrength: number;
	drawOrder: number;
	regionsKey: string;
	strokes: PencilStroke[];
	totalPoints: number;
	lineMaskCanvas?: OffscreenCanvas;
	lineMaskPoints: number;
	paintMaskCanvas?: OffscreenCanvas;
	paintMaskPoints: number;
};

const pencilSketchCache = new WeakMap<object, PencilSketchCacheEntry>();

export async function buildFrameDescriptor({
	node,
	renderer,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
}): Promise<{
	frame: FrameDescriptor;
	textures: TextureUploadDescriptor[];
}> {
	const items: FrameItemDescriptor[] = [];
	const textures = new Map<string, TextureUploadDescriptor>();
	const handDrawPasses = collectActiveHandDrawPasses({ node });

	await collectNode({
		node,
		renderer,
		path: "root",
		items,
		textures,
		handDrawPasses,
	});

	incrementCounter({ name: "frameItems", by: items.length });
	incrementCounter({ name: "frameTextures", by: textures.size });

	return {
		frame: {
			width: renderer.width,
			height: renderer.height,
			clear: {
				color: [0, 0, 0, 1],
			},
			items,
		},
		textures: [...textures.values()],
	};
}

async function collectNode({
	node,
	renderer,
	path,
	items,
	textures,
	handDrawPasses,
}: {
	node: AnyBaseNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
	handDrawPasses: EffectPass[];
}): Promise<void> {
	if (node instanceof RootNode) {
		for (let index = 0; index < node.children.length; index++) {
			await collectNode({
				node: node.children[index],
				renderer,
				path: `${path}:${index}`,
				items,
				textures,
				handDrawPasses,
			});
		}
		return;
	}

	if (node instanceof ColorNode) {
		const textureId = `${path}:color`;
		const { width, height } = renderer;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash: `color:${node.params.color}:${width}x${height}`,
			width,
			height,
			draw: (ctx) => {
				if (/gradient\(/i.test(node.params.color)) {
					drawCssBackground({ ctx, width, height, css: node.params.color });
				} else {
					ctx.fillStyle = node.params.color;
					ctx.fillRect(0, 0, width, height);
				}
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [],
			mask: null,
		});
		return;
	}

	if (node instanceof EffectLayerNode) {
		const passes = node.resolved?.passes.filter(
			(pass) => pass.shader !== HAND_DRAW_SHADER,
		);
		if (!passes || passes.length === 0) {
			return;
		}
		items.push({
			type: "sceneEffect",
			effectPassGroups: [passes],
		});
		return;
	}

	if (node instanceof BlurBackgroundNode) {
		if (!node.resolved) {
			return;
		}
		const textureId = `${path}:blur-background`;
		const { width, height } = renderer;
		const { backdropSource, passes } = node.resolved;
		// Backdrop pixels come from a decoded video/image frame whose identity
		// already changes when it changes. Hashing the source reference is
		// enough to let us skip redraws on frozen frames.
		const contentHash = `blur:${identityKey(backdropSource.source)}:${backdropSource.width}x${backdropSource.height}:${width}x${height}`;
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash,
			width,
			height,
			draw: (ctx) => {
				const coverScale = Math.max(
					width / backdropSource.width,
					height / backdropSource.height,
				);
				const scaledWidth = backdropSource.width * coverScale;
				const scaledHeight = backdropSource.height * coverScale;
				const offsetX = (width - scaledWidth) / 2;
				const offsetY = (height - scaledHeight) / 2;
				ctx.drawImage(
					backdropSource.source,
					offsetX,
					offsetY,
					scaledWidth,
					scaledHeight,
				);
			},
		});
		items.push({
			type: "layer",
			textureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [passes],
			mask: null,
		});
		return;
	}

	if (
		node instanceof VideoNode ||
		node instanceof ImageNode ||
		node instanceof StickerNode ||
		node instanceof GraphicNode
	) {
		await collectVisualSourceNode({
			node,
			renderer,
			path,
			items,
			textures,
			handDrawPasses,
		});
		return;
	}

	if (node instanceof TextNode) {
		collectTextNode({
			node,
			renderer,
			path,
			items,
			textures,
		});
	}
}

async function collectVisualSourceNode({
	node,
	renderer,
	path,
	items,
	textures,
	handDrawPasses,
}: {
	node: VideoNode | ImageNode | StickerNode | GraphicNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
	handDrawPasses: EffectPass[];
}) {
	if (!node.resolved) {
		return;
	}

	const source =
		node instanceof GraphicNode
			? node.getSource({ resolvedParams: node.resolved.resolvedParams })
			: node.resolved.source;
	if (!source) {
		return;
	}

	const sourceWidth =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceWidth;
	const sourceHeight =
		node instanceof GraphicNode
			? DEFAULT_GRAPHIC_SOURCE_SIZE
			: (node.resolved as ResolvedVisualSourceNodeState).sourceHeight;

	const textureId = `${path}:source`;
	const handDrawPass = handDrawPasses.at(-1);
	if (handDrawPass) {
		textures.set(textureId, {
			kind: "rendered",
			id: textureId,
			contentHash: `hand-draw:${identityKey(source)}:${sourceWidth}x${sourceHeight}:${JSON.stringify(handDrawPass.uniforms)}`,
			width: sourceWidth,
			height: sourceHeight,
			draw: (ctx) =>
				drawHandDrawReveal({
					ctx,
					source,
					width: sourceWidth,
					height: sourceHeight,
					pass: handDrawPass,
				}),
		});
	} else {
		textures.set(textureId, {
			kind: "external",
			id: textureId,
			source,
			width: sourceWidth,
			height: sourceHeight,
		});
	}

	const transform = computeVisualTransform({
		renderer,
		resolved: node.resolved,
		sourceWidth,
		sourceHeight,
	});
	const { mask, strokeLayer } = buildMaskArtifacts({
		node,
		renderer,
		path,
		transform,
		textures,
	});

	items.push({
		type: "layer",
		textureId,
		transform,
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask,
	});
	if (strokeLayer) {
		items.push(strokeLayer);
	}
}

function collectActiveHandDrawPasses({
	node,
}: {
	node: AnyBaseNode;
}): EffectPass[] {
	if (!(node instanceof RootNode)) {
		return [];
	}

	return node.children.flatMap((child) =>
		child instanceof EffectLayerNode
			? (child.resolved?.passes ?? []).filter(
					(pass) => pass.shader === HAND_DRAW_SHADER,
				)
			: [],
	);
}

function drawHandDrawReveal({
	ctx,
	source,
	width,
	height,
	pass,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	source: CanvasImageSource;
	width: number;
	height: number;
	pass: EffectPass;
}) {
	const progress = clampUnit(pass.uniforms.u_progress);
	const colorDelay = clampUnit(pass.uniforms.u_color_delay);
	const roughness = clampUnit(pass.uniforms.u_roughness);
	const lineStrength = clampUnit(pass.uniforms.u_line_strength);
	const drawOrder = Math.round(
		clampUnit(pass.uniforms.u_draw_order) * 3,
	);
	const drawRegions = readHandDrawRegions({ value: pass.uniforms.u_draw_regions });
	const sketch = getPencilSketch({
		source,
		width,
		height,
		lineStrength,
		drawOrder,
		drawRegions,
	});
	// The renderer's final frame sits just before the timeline endpoint, so it
	// does not always receive an exact progress of 1. Finish a little earlier
	// to guarantee the pen is gone once the drawing is complete.
	if (progress >= 0.985) {
		ctx.drawImage(source, 0, 0, width, height);
		return;
	}
	// Only trace contours that were extracted from the picture. This prevents
	// the reveal from behaving like a wipe: every new mark belongs to the image.
	// Leave a very short blank-paper beat at the start, then accelerate gently.
	// A linear reveal makes even a 10 second effect look like a wipe: enough
	// small contours are visible in the first few frames to read as the whole
	// picture. This timing instead behaves like a person finding the first line
	// and building momentum while drawing it.
	const drawingProgress = smoothStep({
		edge0: 0.025,
		edge1: 1,
		value: progress,
	}) ** 1.85;
	const visiblePointCount = Math.ceil(drawingProgress * sketch.totalPoints);
	const brushWidth = Math.max(
		1.3,
		(Math.min(width, height) / 420) * (1 + roughness * 0.45),
	);
	const maskCanvas = updateProgressMask({
		sketch,
		kind: "line",
		pointCount: visiblePointCount,
		lineWidth: brushWidth,
	});
	const lastDrawnPoint = getCursorAtPointCount({
		strokes: sketch.strokes,
		pointCount: visiblePointCount,
	});

	const { canvas: revealCanvas, context: revealCtx } = createCanvasSurface({
		width,
		height,
	});
	revealCtx.drawImage(sketch.canvas, 0, 0);
	revealCtx.globalCompositeOperation = "destination-in";
	revealCtx.drawImage(maskCanvas, 0, 0);

	// The outline is drawn first. A wide, semi-transparent crayon follows the
	// same already-traced path later, so the picture gains colour progressively
	// instead of the original bitmap suddenly fading in.
	const colourProgress =
		colorDelay >= 1 ? 0 : clampUnit((progress - colorDelay) / (1 - colorDelay));
	if (colourProgress > 0) {
		const paintedPoints = Math.ceil(
			drawingProgress * sketch.totalPoints * colourProgress,
		);
		// The colour brush starts narrow, then opens up only around the strokes
		// which are already complete. This is the key distinction from a global
		// crossfade: an unfinished area remains white even near the end.
		const paintMaskCanvas = updateProgressMask({
			sketch,
			kind: "paint",
			pointCount: paintedPoints,
			lineWidth: Math.max(brushWidth * 8, Math.min(width, height) / 80),
		});
		const { canvas: colourCanvas, context: colourCtx } = createCanvasSurface({
			width,
			height,
		});
		colourCtx.globalAlpha = 0.72;
		colourCtx.drawImage(source, 0, 0, width, height);
		colourCtx.globalCompositeOperation = "destination-in";
		colourCtx.globalAlpha = 1;
		colourCtx.drawImage(paintMaskCanvas, 0, 0);
		revealCtx.globalCompositeOperation = "source-over";
		revealCtx.drawImage(colourCanvas, 0, 0);
	}
	ctx.fillStyle = "#ffffff";
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(revealCanvas, 0, 0);
	if (progress > 0 && progress < 1 && lastDrawnPoint) {
		drawMarkerPen({
			ctx,
			cursor: lastDrawnPoint,
			size: Math.max(12, Math.min(width, height) / 34),
			opacity: 1 - smoothStep({ edge0: 0.92, edge1: 0.98, value: progress }),
		});
	}
}

function getPencilSketch({
	source,
	width,
	height,
	lineStrength,
	drawOrder,
	drawRegions,
}: {
	source: CanvasImageSource;
	width: number;
	height: number;
	lineStrength: number;
	drawOrder: number;
	drawRegions: HandDrawRegion[];
}): PencilSketchCacheEntry {
	const cacheKey = typeof source === "object" && source !== null ? source : null;
	const regionsKey = JSON.stringify(drawRegions);
	const cached = cacheKey ? pencilSketchCache.get(cacheKey) : undefined;
	if (
		cached &&
		cached.width === width &&
		cached.height === height &&
		cached.lineStrength === lineStrength &&
		cached.drawOrder === drawOrder &&
		cached.regionsKey === regionsKey
	) {
		return cached;
	}

	const { canvas, context } = createCanvasSurface({ width, height });
	context.drawImage(source, 0, 0, width, height);
	const sourcePixels = context.getImageData(0, 0, width, height);
	const sketchPixels = context.createImageData(width, height);
	const edges = new Uint8Array(width * height);
	const threshold = 18 + (1 - lineStrength) * 38;
	const luminanceAt = ({ x, y }: { x: number; y: number }) => {
		const pixel = (y * width + x) * 4;
		return (
			sourcePixels.data[pixel] * 0.2126 +
			sourcePixels.data[pixel + 1] * 0.7152 +
			sourcePixels.data[pixel + 2] * 0.0722
		);
	};
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const edge =
				Math.abs(
					luminanceAt({ x: x - 1, y }) - luminanceAt({ x: x + 1, y }),
				) +
				Math.abs(
					luminanceAt({ x, y: y - 1 }) - luminanceAt({ x, y: y + 1 }),
				);
			if (edge <= threshold) continue;
			const pixel = (y * width + x) * 4;
			const alpha = Math.min(255, Math.round((edge - threshold) * 4.2));
			sketchPixels.data[pixel] = 24;
			sketchPixels.data[pixel + 1] = 31;
			sketchPixels.data[pixel + 2] = 42;
			sketchPixels.data[pixel + 3] = alpha;
			edges[y * width + x] = alpha > 96 ? 1 : 0;
		}
	}
	context.clearRect(0, 0, width, height);
	context.putImageData(sketchPixels, 0, 0);
	const strokes = tracePencilStrokes({
		edges,
		width,
		height,
		drawOrder,
		drawRegions,
	});
	const entry = {
		canvas,
		width,
		height,
		lineStrength,
		drawOrder,
		regionsKey,
		strokes,
		totalPoints: strokes.reduce((total, stroke) => total + stroke.points.length, 0),
		lineMaskPoints: 0,
		paintMaskPoints: 0,
	};
	if (cacheKey) {
		pencilSketchCache.set(cacheKey, entry);
	}
	return entry;
}

type DrawCursor = {
	x: number;
	y: number;
	angle: number;
};

function getDrawCursor({
	points,
	pointIndex,
}: {
	points: PencilStroke["points"];
	pointIndex: number;
}): DrawCursor {
	const point = points[pointIndex];
	const previous = points[Math.max(0, pointIndex - 3)] ?? point;
	return {
		x: point.x,
		y: point.y,
		angle: Math.atan2(point.y - previous.y, point.x - previous.x),
	};
}

function updateProgressMask({
	sketch,
	kind,
	pointCount,
	lineWidth,
}: {
	sketch: PencilSketchCacheEntry;
	kind: "line" | "paint";
	pointCount: number;
	lineWidth: number;
}): OffscreenCanvas {
	const canvasKey = kind === "line" ? "lineMaskCanvas" : "paintMaskCanvas";
	const pointKey = kind === "line" ? "lineMaskPoints" : "paintMaskPoints";
	let canvas = sketch[canvasKey];
	let renderedPointCount = sketch[pointKey];
	if (!canvas || pointCount < renderedPointCount) {
		canvas = createCanvasSurface({ width: sketch.width, height: sketch.height }).canvas;
		renderedPointCount = 0;
	}
	if (pointCount > renderedPointCount) {
		const context = canvas.getContext("2d");
		if (!context) throw new Error("Could not create hand-draw mask context");
		context.strokeStyle = "white";
		context.lineCap = "round";
		context.lineJoin = "round";
		context.lineWidth = lineWidth;
		drawStrokePointRange({
			ctx: context,
			strokes: sketch.strokes,
			startPoint: renderedPointCount,
			endPoint: pointCount,
		});
	}
	sketch[canvasKey] = canvas;
	sketch[pointKey] = pointCount;
	return canvas;
}

function drawStrokePointRange({
	ctx,
	strokes,
	startPoint,
	endPoint,
}: {
	ctx: OffscreenCanvasRenderingContext2D;
	strokes: PencilStroke[];
	startPoint: number;
	endPoint: number;
}) {
	let offset = 0;
	for (const stroke of strokes) {
		const localStart = Math.max(0, startPoint - offset);
		const localEnd = Math.min(stroke.points.length, endPoint - offset);
		if (localEnd > localStart) {
			const begin = Math.max(0, localStart - 1);
			ctx.beginPath();
			ctx.moveTo(stroke.points[begin].x, stroke.points[begin].y);
			for (let index = Math.max(1, localStart); index < localEnd; index++) {
				ctx.lineTo(stroke.points[index].x, stroke.points[index].y);
			}
			ctx.stroke();
		}
		offset += stroke.points.length;
		if (offset >= endPoint) break;
	}
}

function getCursorAtPointCount({
	strokes,
	pointCount,
}: {
	strokes: PencilStroke[];
	pointCount: number;
}): DrawCursor | null {
	if (pointCount < 1) return null;
	let remaining = pointCount;
	for (const stroke of strokes) {
		if (remaining <= stroke.points.length) {
			return getDrawCursor({
				points: stroke.points,
				pointIndex: Math.max(0, remaining - 1),
			});
		}
		remaining -= stroke.points.length;
	}
	const finalStroke = strokes.at(-1);
	return finalStroke
		? getDrawCursor({
				points: finalStroke.points,
				pointIndex: finalStroke.points.length - 1,
			})
		: null;
}

function drawMarkerPen({
	ctx,
	cursor,
	size,
	opacity,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	cursor: DrawCursor;
	size: number;
	opacity: number;
}) {
	// Keep the cursor deliberately simple: one well-defined marker pen, with
	// its nib locked to the newest ink point. A hand illustration hides the
	// artwork and reads as an unrelated coloured blob on small canvases.
	const markerLength = size * 2.65;
	ctx.save();
	ctx.translate(cursor.x, cursor.y);
	ctx.rotate(cursor.angle);
	ctx.globalAlpha = opacity;
	// Nib: its point is exactly at (0, 0), matching the newest ink position.
	ctx.fillStyle = "#101114";
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(size * 0.72, -size * 0.28);
	ctx.lineTo(size * 0.72, size * 0.28);
	ctx.closePath();
	ctx.fill();
	const barrelStart = size * 0.56;
	ctx.fillStyle = "#fbfaf7";
	ctx.beginPath();
	ctx.roundRect(barrelStart, -size * 0.3, markerLength, size * 0.6, size * 0.18);
	ctx.fill();
	ctx.strokeStyle = "#25282d";
	ctx.lineWidth = Math.max(0.75, size * 0.045);
	ctx.stroke();
	ctx.fillStyle = "#15171b";
	ctx.beginPath();
	ctx.roundRect(
		barrelStart + markerLength - size * 0.48,
		-size * 0.34,
		size * 0.62,
		size * 0.68,
		size * 0.16,
	);
	ctx.fill();
	ctx.fillStyle = "#cfa544";
	ctx.fillRect(barrelStart + size * 0.25, -size * 0.31, size * 0.1, size * 0.62);
	ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
	ctx.fillRect(barrelStart + size * 0.58, -size * 0.16, markerLength * 0.45, size * 0.08);
	ctx.restore();
}

function tracePencilStrokes({
	edges,
	width,
	height,
	drawOrder,
	drawRegions,
}: {
	edges: Uint8Array;
	width: number;
	height: number;
	drawOrder: number;
	drawRegions: HandDrawRegion[];
}): PencilStroke[] {
	const visited = new Uint8Array(edges.length);
	const strokes: PencilStroke[] = [];
	const neighbours = [
		[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1],
	] as const;
	for (let startY = 1; startY < height - 1; startY++) {
		for (let startX = 1; startX < width - 1; startX++) {
			const start = startY * width + startX;
			if (!edges[start] || visited[start]) continue;
			const points: Array<{ x: number; y: number }> = [];
			let x = startX;
			let y = startY;
			for (let step = 0; step < 180; step++) {
				const current = y * width + x;
				if (!edges[current] || visited[current]) break;
				visited[current] = 1;
				points.push({ x, y });
				let next: { x: number; y: number } | undefined;
				for (const [offsetX, offsetY] of neighbours) {
					const candidateX = x + offsetX;
					const candidateY = y + offsetY;
					if (
						candidateX < 1 ||
						candidateX >= width - 1 ||
						candidateY < 1 ||
						candidateY >= height - 1
					) {
						continue;
					}
					const candidate = candidateY * width + candidateX;
					if (edges[candidate] && !visited[candidate]) {
						next = { x: candidateX, y: candidateY };
						break;
					}
				}
				if (!next) break;
				x = next.x;
				y = next.y;
			}
			const simplifiedPoints = simplifyPencilPoints({ points });
			if (simplifiedPoints.length >= 3) {
				const bounds = simplifiedPoints.reduce(
					(result, point) => ({
						minX: Math.min(result.minX, point.x),
						maxX: Math.max(result.maxX, point.x),
						minY: Math.min(result.minY, point.y),
						maxY: Math.max(result.maxY, point.y),
					}),
					{
						minX: simplifiedPoints[0].x,
						maxX: simplifiedPoints[0].x,
						minY: simplifiedPoints[0].y,
						maxY: simplifiedPoints[0].y,
					},
				);
				strokes.push({ points: simplifiedPoints, ...bounds });
			}
		}
	}
	return orderPencilStrokes({
		strokes,
		width,
		height,
		drawOrder,
		drawRegions,
	});
}

function simplifyPencilPoints({
	points,
}: {
	points: Array<{ x: number; y: number }>;
}): Array<{ x: number; y: number }> {
	// Edge detection produces one point for every raster pixel. Keeping all of
	// them gives no visible quality benefit at preview scale, but makes the last
	// frames disproportionately expensive because nearly every contour has been
	// revealed. Retain a point only after it has moved about 3 pixels; Canvas
	// joins the retained points into the same continuous pencil line.
	if (points.length < 4) return points;
	const simplified = [points[0]];
	let previous = points[0];
	for (let index = 1; index < points.length - 1; index++) {
		const point = points[index];
		const deltaX = point.x - previous.x;
		const deltaY = point.y - previous.y;
		if (deltaX * deltaX + deltaY * deltaY < 25) continue;
		simplified.push(point);
		previous = point;
	}
	const finalPoint = points.at(-1);
	if (finalPoint && finalPoint !== previous) simplified.push(finalPoint);
	return simplified;
}

function orderPencilStrokes({
	strokes,
	width,
	height,
	drawOrder,
	drawRegions,
}: {
	strokes: PencilStroke[];
	width: number;
	height: number;
	drawOrder: number;
	drawRegions: HandDrawRegion[];
}): PencilStroke[] {
	// Sobel edges are necessarily fragmented (each letter and each side of a
	// shape is a separate contour). Ordering only by contour length therefore
	// hops all around the canvas. Divide the picture into broad drawing rows,
	// then finish every contour in the current row from left to right before
	// moving downward. This makes the animation read as one completed section
	// at a time instead of a scattering of independent pixels.
	const rowHeight = Math.max(48, Math.round(height / 9));
	const columnWidth = Math.max(144, Math.round(width / 3));
	const orderedSlices = strokes.flatMap((stroke) =>
		splitStrokeIntoDrawingRows({ stroke, rowHeight }),
	);
	return orderedSlices.sort((left, right) => {
		const leftRegion = findDrawRegion({ stroke: left, width, height, regions: drawRegions });
		const rightRegion = findDrawRegion({ stroke: right, width, height, regions: drawRegions });
		if (leftRegion?.order !== rightRegion?.order) {
			return (leftRegion?.order ?? Number.MAX_SAFE_INTEGER) - (rightRegion?.order ?? Number.MAX_SAFE_INTEGER);
		}
		const activeDrawOrder = leftRegion?.drawOrder ?? drawOrder;
		const leftRow = Math.floor(((left.minY + left.maxY) / 2) / rowHeight);
		const rightRow = Math.floor(((right.minY + right.maxY) / 2) / rowHeight);
		const leftColumn = Math.floor(
			((left.minX + left.maxX) / 2) / columnWidth,
		);
		const rightColumn = Math.floor(
			((right.minX + right.maxX) / 2) / columnWidth,
		);
		const columnDirection = activeDrawOrder === 1 ? -1 : 1;
		const rowDirection = activeDrawOrder === 3 ? -1 : 1;
		const columnFirst = activeDrawOrder === 0 || activeDrawOrder === 1;
		if (columnFirst && leftColumn !== rightColumn) {
			return (leftColumn - rightColumn) * columnDirection;
		}
		if (!columnFirst && leftRow !== rightRow) {
			return (leftRow - rightRow) * rowDirection;
		}
		if (columnFirst && leftRow !== rightRow) {
			return (leftRow - rightRow) * rowDirection;
		}
		if (!columnFirst && leftColumn !== rightColumn) {
			return (leftColumn - rightColumn) * columnDirection;
		}

		// In the same local area, long contours establish the outer shape first,
		// then the small details inside it.
		if (left.points.length !== right.points.length) {
			return right.points.length - left.points.length;
		}
		const leftCenterY = (left.minY + left.maxY) / 2;
		const rightCenterY = (right.minY + right.maxY) / 2;
		return leftCenterY - rightCenterY;
	});
}

function splitStrokeIntoDrawingRows({
	stroke,
	rowHeight,
}: {
	stroke: PencilStroke;
	rowHeight: number;
}): PencilStroke[] {
	const slices: PencilStroke[] = [];
	let activePoints: PencilStroke["points"] = [];
	let activeRow: number | null = null;
	for (const point of stroke.points) {
		const pointRow = Math.floor(point.y / rowHeight);
		if (activeRow !== null && pointRow !== activeRow) {
			if (activePoints.length >= 3) {
				slices.push(createPencilStroke({ points: activePoints }));
			}
			// Keep the boundary point so the next section starts precisely where
			// the pen crossed into it, without exposing any later-row ink early.
			activePoints = [activePoints.at(-1) ?? point, point];
		}
		activePoints.push(point);
		activeRow = pointRow;
	}
	if (activePoints.length >= 3) {
		slices.push(createPencilStroke({ points: activePoints }));
	}
	return slices.length > 0 ? slices : [stroke];
}

function createPencilStroke({
	points,
}: {
	points: PencilStroke["points"];
}): PencilStroke {
	const bounds = points.reduce(
		(result, point) => ({
			minX: Math.min(result.minX, point.x),
			maxX: Math.max(result.maxX, point.x),
			minY: Math.min(result.minY, point.y),
			maxY: Math.max(result.maxY, point.y),
		}),
		{ minX: points[0].x, maxX: points[0].x, minY: points[0].y, maxY: points[0].y },
	);
	return { points, ...bounds };
}

function smoothStep({
	edge0,
	edge1,
	value,
}: {
	edge0: number;
	edge1: number;
	value: number;
}): number {
	const t = clampUnit((value - edge0) / (edge1 - edge0));
	return t * t * (3 - 2 * t);
}

function clampUnit(value: EffectPass["uniforms"][string] | undefined): number {
	const number = typeof value === "number" ? value : 0;
	return Math.min(Math.max(number, 0), 1);
}

function readHandDrawRegions({
	value,
}: {
	value: EffectPass["uniforms"][string] | undefined;
}): HandDrawRegion[] {
	if (!Array.isArray(value)) return [];
	const regions: HandDrawRegion[] = [];
	for (let index = 0; index + 5 < value.length; index += 6) {
		const [x, y, width, height, order, drawOrder] = value.slice(index, index + 6);
		if (![x, y, width, height, order, drawOrder].every(Number.isFinite)) continue;
		regions.push({
			x: clampUnit(x),
			y: clampUnit(y),
			width: Math.min(1, Math.max(0.01, width)),
			height: Math.min(1, Math.max(0.01, height)),
			order: Math.max(1, Math.round(order)),
			drawOrder: Math.min(3, Math.max(0, Math.round(drawOrder))),
		});
	}
	return regions.sort((left, right) => left.order - right.order);
}

function findDrawRegion({
	stroke,
	width,
	height,
	regions,
}: {
	stroke: PencilStroke;
	width: number;
	height: number;
	regions: HandDrawRegion[];
}): HandDrawRegion | null {
	if (regions.length === 0) return null;
	const centerX = (stroke.minX + stroke.maxX) / (2 * width);
	const centerY = (stroke.minY + stroke.maxY) / (2 * height);
	return (
		regions.find(
			(region) =>
				centerX >= region.x &&
				centerX <= region.x + region.width &&
				centerY >= region.y &&
				centerY <= region.y + region.height,
		) ?? null
	);
}

function collectTextNode({
	node,
	renderer,
	path,
	items,
	textures,
}: {
	node: TextNode;
	renderer: CanvasRenderer;
	path: string;
	items: FrameItemDescriptor[];
	textures: Map<string, TextureUploadDescriptor>;
}) {
	if (!node.resolved) {
		return;
	}

	const textureId = `${path}:text`;
	const { width, height } = renderer;
	// Text output is fully determined by node.params + node.resolved. Both are
	// plain data we can stringify cheaply; the resolved measured layout is the
	// expensive part of text setup, so stringifying it here is orders of
	// magnitude cheaper than re-rasterizing when nothing changed.
	const contentHash = `text:${width}x${height}:${JSON.stringify({
		params: node.params,
		resolved: node.resolved,
	})}`;
	textures.set(textureId, {
		kind: "rendered",
		id: textureId,
		contentHash,
		width,
		height,
		draw: (ctx) => {
			renderTextToContext({ node, ctx });
		},
	});
	items.push({
		type: "layer",
		textureId,
		transform: fullCanvasTransform(renderer),
		opacity: node.resolved.opacity,
		blendMode: node.params.blendMode ?? "normal",
		effectPassGroups: node.resolved.effectPasses,
		mask: null,
	});
}

function computeVisualTransform({
	renderer,
	resolved,
	sourceWidth,
	sourceHeight,
}: {
	renderer: CanvasRenderer;
	resolved: ResolvedVisualSourceNodeState | ResolvedGraphicNodeState;
	sourceWidth: number;
	sourceHeight: number;
}): QuadTransformDescriptor {
	const containScale = Math.min(
		renderer.width / sourceWidth,
		renderer.height / sourceHeight,
	);
	const scaledWidth = sourceWidth * containScale * resolved.transform.scaleX;
	const scaledHeight = sourceHeight * containScale * resolved.transform.scaleY;
	const absWidth = Math.abs(scaledWidth);
	const absHeight = Math.abs(scaledHeight);

	return {
		centerX: renderer.width / 2 + resolved.transform.position.x,
		centerY: renderer.height / 2 + resolved.transform.position.y,
		width: absWidth,
		height: absHeight,
		rotationDegrees: resolved.transform.rotate,
		flipX: scaledWidth < 0,
		flipY: scaledHeight < 0,
	};
}

function fullCanvasTransform(
	renderer: CanvasRenderer,
): QuadTransformDescriptor {
	return {
		centerX: renderer.width / 2,
		centerY: renderer.height / 2,
		width: renderer.width,
		height: renderer.height,
		rotationDegrees: 0,
		flipX: false,
		flipY: false,
	};
}

function buildMaskArtifacts({
	node,
	renderer,
	path,
	transform,
	textures,
}: {
	node: VideoNode | ImageNode | StickerNode | GraphicNode;
	renderer: CanvasRenderer;
	path: string;
	transform: QuadTransformDescriptor;
	textures: Map<string, TextureUploadDescriptor>;
}): {
	mask: LayerMaskDescriptor | null;
	strokeLayer: FrameItemDescriptor | null;
} {
	const mask = node.params.masks?.[0];
	if (!mask) {
		return { mask: null, strokeLayer: null };
	}

	const definition = getMaskDefinition(mask.type);

	if (definition.isActive?.(mask.params) === false) {
		return { mask: null, strokeLayer: null };
	}

	const { body } = definition.renderer;
	const usesOpaqueFastPath =
		body.kind === "drawWithFeather" &&
		mask.params.feather === 0 &&
		Boolean(body.opaqueFastPath);
	// drawWithFeather renderers encode feathering analytically in their canvas output
	// (e.g. split mask uses a linear gradient instead of JFA). The descriptor feather is
	// zeroed so the GPU compositor copies the mask texture as-is and does not run a second
	// JFA feather pass on top of an already-soft texture.
	const feather = body.kind === "drawWithFeather" ? 0 : mask.params.feather;

	const maskTextureId = `${path}:mask`;
	const { width: canvasWidth, height: canvasHeight } = renderer;
	const maskContentHash = `mask:${mask.type}:${JSON.stringify(mask.params)}:${transformHash(transform)}:${canvasWidth}x${canvasHeight}:body=${body.kind}:fastPath=${usesOpaqueFastPath}`;
	const drawMask: TextureCanvasDrawFn = (ctx) => {
		const { canvas: elementMaskCanvas, context: elementMaskCtx } =
			createCanvasSurface({
				width: Math.round(transform.width),
				height: Math.round(transform.height),
			});

		switch (body.kind) {
			case "fillPath": {
				const path2d = body.buildPath({
					resolvedParams: mask.params,
					width: transform.width,
					height: transform.height,
				});
				elementMaskCtx.fillStyle = "white";
				elementMaskCtx.fill(path2d);
				break;
			}
			case "drawOpaque":
				body.drawOpaque({
					resolvedParams: mask.params,
					ctx: elementMaskCtx,
					width: Math.round(transform.width),
					height: Math.round(transform.height),
				});
				break;
			case "drawWithFeather":
				if (usesOpaqueFastPath && body.opaqueFastPath) {
					const path2d = body.opaqueFastPath.buildPath({
						resolvedParams: mask.params,
						width: transform.width,
						height: transform.height,
					});
					elementMaskCtx.fillStyle = "white";
					elementMaskCtx.fill(path2d);
				} else {
					body.drawWithFeather({
						resolvedParams: mask.params,
						ctx: elementMaskCtx,
						width: Math.round(transform.width),
						height: Math.round(transform.height),
						feather: mask.params.feather,
					});
				}
				break;
		}

		drawTransformedCanvas({ ctx, source: elementMaskCanvas, transform });
	};
	textures.set(maskTextureId, {
		kind: "rendered",
		id: maskTextureId,
		contentHash: maskContentHash,
		width: canvasWidth,
		height: canvasHeight,
		draw: drawMask,
	});

	const stroke = definition.renderer.stroke;
	const hasStroke = mask.params.strokeWidth > 0 && Boolean(stroke);
	let strokeLayer: FrameItemDescriptor | null = null;
	if (hasStroke && stroke) {
		const strokeTextureId = `${path}:mask-stroke`;
		const strokeContentHash = `stroke:${mask.type}:${JSON.stringify(mask.params)}:${transformHash(transform)}:${canvasWidth}x${canvasHeight}:stroke=${stroke.kind}`;
		const drawStroke: TextureCanvasDrawFn = (ctx) => {
			const { canvas: strokeCanvas, context: strokeCtx } = createCanvasSurface({
				width: Math.round(transform.width),
				height: Math.round(transform.height),
			});

			switch (stroke.kind) {
				case "renderStroke":
					stroke.renderStroke({
						resolvedParams: mask.params,
						ctx: strokeCtx,
						width: transform.width,
						height: transform.height,
					});
					break;
				case "strokeFromPath": {
					const strokePath = stroke.buildStrokePath({
						resolvedParams: mask.params,
						width: transform.width,
						height: transform.height,
					});
					strokeCtx.strokeStyle = mask.params.strokeColor;
					strokeCtx.lineWidth = mask.params.strokeWidth;
					strokeCtx.stroke(strokePath);
					break;
				}
			}

			drawTransformedCanvas({ ctx, source: strokeCanvas, transform });
		};
		textures.set(strokeTextureId, {
			kind: "rendered",
			id: strokeTextureId,
			contentHash: strokeContentHash,
			width: canvasWidth,
			height: canvasHeight,
			draw: drawStroke,
		});
		strokeLayer = {
			type: "layer",
			textureId: strokeTextureId,
			transform: fullCanvasTransform(renderer),
			opacity: 1,
			blendMode: "normal",
			effectPassGroups: [],
			mask: null,
		};
	}

	return {
		mask: {
			textureId: maskTextureId,
			feather,
			inverted: mask.params.inverted,
		},
		strokeLayer,
	};
}

function drawTransformedCanvas({
	ctx,
	source,
	transform,
}: {
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	source: CanvasImageSource;
	transform: QuadTransformDescriptor;
}) {
	const x = transform.centerX - transform.width / 2;
	const y = transform.centerY - transform.height / 2;
	const flipX = transform.flipX ? -1 : 1;
	const flipY = transform.flipY ? -1 : 1;
	const requiresTransform =
		transform.rotationDegrees !== 0 || flipX !== 1 || flipY !== 1;

	ctx.save();
	if (requiresTransform) {
		ctx.translate(transform.centerX, transform.centerY);
		ctx.rotate((transform.rotationDegrees * Math.PI) / 180);
		ctx.scale(flipX, flipY);
		ctx.translate(-transform.centerX, -transform.centerY);
	}
	ctx.drawImage(source, x, y, transform.width, transform.height);
	ctx.restore();
}

function transformHash(transform: QuadTransformDescriptor): string {
	return `${transform.centerX}:${transform.centerY}:${transform.width}:${transform.height}:${transform.rotationDegrees}:${transform.flipX ? 1 : 0}:${transform.flipY ? 1 : 0}`;
}

// Stable identity key for CanvasImageSource. Using a WeakMap → counter keeps
// hash string length bounded and avoids holding sources alive.
const identityKeys = new WeakMap<object, number>();
let nextIdentity = 1;
function identityKey(source: CanvasImageSource): string {
	if (typeof source === "object" && source !== null) {
		let key = identityKeys.get(source);
		if (key === undefined) {
			key = nextIdentity++;
			identityKeys.set(source, key);
		}
		return `@${key}`;
	}
	return "@?";
}
