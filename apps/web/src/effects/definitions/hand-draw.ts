import type { EffectDefinition, EffectPass } from "@/effects/types";

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
	const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp({ value, min, max }: { value: number; min: number; max: number }): number {
	return Math.min(Math.max(value, min), max);
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
	const requestedDuration = numberParam({ params: effectParams, key: "drawDuration", fallback: 0 });
	const drawDuration = requestedDuration > 0
		? requestedDuration
		: Math.max(duration ?? 2.5, 0.1);
	const progress = localTime == null ? 1 : clamp({ value: localTime / drawDuration, min: 0, max: 1 });

	return [{
		shader: HAND_DRAW_SHADER,
		uniforms: {
			u_progress: progress,
			u_line_strength: clamp({ value: numberParam({ params: effectParams, key: "lineStrength", fallback: 0.82 }), min: 0, max: 1 }),
			u_color_delay: clamp({ value: numberParam({ params: effectParams, key: "colorDelay", fallback: 0.46 }), min: 0, max: 0.9 }),
			u_roughness: clamp({ value: numberParam({ params: effectParams, key: "roughness", fallback: 0.65 }), min: 0, max: 1 }),
		},
	}];
}

export const handDrawEffectDefinition: EffectDefinition = {
	type: "hand-draw",
	name: "手绘显现",
	keywords: ["手绘", "素描", "涂鸦", "白板", "绘制", "线稿"],
	params: [
		{ key: "drawDuration", label: "绘制时长（0=整段）", type: "number", default: 0, min: 0, max: 60, step: 0.1, keyframable: false },
		{ key: "lineStrength", label: "线条强度", type: "number", default: 0.82, min: 0, max: 1, step: 0.01, unit: "percent" },
		{ key: "colorDelay", label: "上色延迟", type: "number", default: 0.46, min: 0, max: 0.9, step: 0.01, unit: "percent" },
		{ key: "roughness", label: "笔触粗糙度", type: "number", default: 0.65, min: 0, max: 1, step: 0.01, unit: "percent" },
	],
	renderer: { passes: [], buildPasses: buildHandDrawPasses },
};
