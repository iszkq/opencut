import type { EffectDefinition, EffectPass } from "@/effects/types";
import {
	handDrawDirectionCode,
	parseHandDrawRegions,
} from "@/effects/hand-draw-regions";
import { mediaTimeToSeconds } from "@/wasm";

export const HAND_DRAW_SHADER = "hand-draw";

function numberParam({
	params,
	key,
	fallback,
}: {
	params: Record<string, unknown>;
	key: string;
	fallback: number;
}): number {
	const value = params[key];
	const parsed =
		typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	return Math.min(Math.max(value, min), max);
}

function drawOrderParam({
	params,
}: {
	params: Record<string, unknown>;
}): number {
	// The renderer only accepts numeric uniforms. Keep the user-facing option a
	// descriptive string and map it to a stable ordering code here.
	switch (params.drawOrder) {
		case "right-to-left":
			return 1;
		case "top-to-bottom":
			return 2;
		case "bottom-to-top":
			return 3;
		default:
			return 0;
	}
}

function drawRegionsParam({
	params,
}: {
	params: Record<string, unknown>;
}): number[] {
	return parseHandDrawRegions({ value: params.drawRegions }).flatMap(
		(region) => [
			region.x,
			region.y,
			region.width,
			region.height,
			region.order,
			handDrawDirectionCode({ direction: region.direction }),
			region.durationSeconds,
			region.pauseSeconds,
		],
	);
}

function buildHandDrawPasses({
	effectParams,
	localTime,
	duration,
}: {
	effectParams: Record<string, unknown>;
	localTime?: number;
	duration?: number;
}): EffectPass[] {
	// The effect layer's own length is the drawing duration. This makes trimming
	// its edges on the timeline immediately adjust the reveal speed.
	const drawDuration = Math.max(duration ?? 2.5, 0.1);
	const progress =
		localTime == null
			? 1
			: clamp({ value: localTime / drawDuration, min: 0, max: 1 });

	return [
		{
			shader: HAND_DRAW_SHADER,
			uniforms: {
				u_progress: progress,
				// Region timings are expressed in real seconds. Keep this separate
				// from u_progress, which intentionally follows the effect layer's
				// length for the legacy, unpartitioned hand-draw animation.
				u_local_time:
					localTime == null
						? Number.MAX_SAFE_INTEGER
						: mediaTimeToSeconds({ time: localTime }),
				u_draw_order: drawOrderParam({ params: effectParams }) / 3,
				u_draw_regions: drawRegionsParam({ params: effectParams }),
				u_line_strength: clamp({
					value: numberParam({
						params: effectParams,
						key: "lineStrength",
						fallback: 0.82,
					}),
					min: 0,
					max: 1,
				}),
				u_color_delay: clamp({
					value: numberParam({
						params: effectParams,
						key: "colorDelay",
						fallback: 0.46,
					}),
					min: 0,
					max: 0.9,
				}),
				u_roughness: clamp({
					value: numberParam({
						params: effectParams,
						key: "roughness",
						fallback: 0.65,
					}),
					min: 0,
					max: 1,
				}),
			},
		},
	];
}

export const handDrawEffectDefinition: EffectDefinition = {
	type: "hand-draw",
	name: "手绘显现",
	keywords: ["手绘", "素描", "涂鸦", "白板", "绘制", "线稿"],
	params: [
		{
			key: "regionEditing",
			label: "编辑分区（在预览中拖拽）",
			type: "boolean",
			default: false,
			keyframable: false,
		},
		{
			key: "drawRegions",
			label: "分区数据",
			type: "text",
			default: "[]",
			keyframable: false,
		},
		{
			key: "drawOrder",
			label: "绘制顺序",
			type: "select",
			default: "left-to-right",
			keyframable: false,
			options: [
				{ value: "left-to-right", label: "左→右（每栏从上到下）" },
				{ value: "right-to-left", label: "右→左（每栏从上到下）" },
				{ value: "top-to-bottom", label: "上→下（每行从左到右）" },
				{ value: "bottom-to-top", label: "下→上（每行从左到右）" },
			],
		},
		{
			key: "drawDuration",
			label: "绘制时长（0=整段）",
			type: "number",
			default: 0,
			min: 0,
			max: 60,
			step: 0.1,
			keyframable: false,
		},
		{
			key: "lineStrength",
			label: "线条强度",
			type: "number",
			default: 0.82,
			min: 0,
			max: 100,
			step: 1,
			displayMultiplier: 100,
			unit: "percent",
		},
		{
			key: "colorDelay",
			label: "上色延迟",
			type: "number",
			default: 0.46,
			min: 0,
			max: 90,
			step: 1,
			displayMultiplier: 100,
			unit: "percent",
		},
		{
			key: "roughness",
			label: "笔触粗糙度",
			type: "number",
			default: 0.65,
			min: 0,
			max: 100,
			step: 1,
			displayMultiplier: 100,
			unit: "percent",
		},
	],
	renderer: { passes: [], buildPasses: buildHandDrawPasses },
};
