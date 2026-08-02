import { upsertPathKeyframe } from "@/animation";
import type { ElementAnimations } from "@/animation/types";
import { NUMBER_CHANNEL_LAYOUT } from "@/params";
import type { VisualElement } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

export type TransitionId =
	| "fade"
	| "zoom"
	| "slide-left"
	| "slide-right"
	| "slide-up"
	| "slide-down"
	| "slide-left-out"
	| "slide-right-out"
	| "slide-up-out"
	| "slide-down-out";

/** Where a transition can safely be used. A cut always owns both clips. */
export type TransitionUsage = "cut" | "in" | "out";
export type TransitionPlacement = "in" | "out";

export type TransitionDefinition = {
	id: TransitionId;
	name: string;
	description: string;
	usages: readonly TransitionUsage[];
	defaultOutDuration: number;
	defaultInDuration: number;
};

export const TRANSITIONS: readonly TransitionDefinition[] = [
	{
		id: "fade",
		name: "淡入淡出",
		description: "平滑显示或隐藏片段",
		usages: ["cut", "in", "out"],
		defaultOutDuration: 0.9,
		defaultInDuration: 0.9,
	},
	{
		id: "zoom",
		name: "缩放淡入",
		description: "以轻微缩放方式显示或隐藏",
		usages: ["cut", "in", "out"],
		defaultOutDuration: 0.8,
		defaultInDuration: 0.8,
	},
	{
		id: "slide-left",
		name: "向左推进",
		description: "从右侧推进画面（仅入场）",
		usages: ["in"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-right",
		name: "向右推进",
		description: "从左侧推进画面（仅入场）",
		usages: ["in"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-up",
		name: "向上推进",
		description: "从下方推进画面（仅入场）",
		usages: ["in"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-down",
		name: "向下推进",
		description: "从上方推进画面（仅入场）",
		usages: ["in"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-left-out",
		name: "向左推出",
		description: "画面向左离开（仅出场）",
		usages: ["out"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-right-out",
		name: "向右推出",
		description: "画面向右离开（仅出场）",
		usages: ["out"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-up-out",
		name: "向上推出",
		description: "画面向上离开（仅出场）",
		usages: ["out"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
	{
		id: "slide-down-out",
		name: "向下推出",
		description: "画面向下离开（仅出场）",
		usages: ["out"],
		defaultOutDuration: 0.7,
		defaultInDuration: 0.7,
	},
];

export const DEFAULT_TRANSITION_DURATION_SECONDS = 0.9;
const MIN_DURATION_SECONDS = 0.08;
const SLIDE_DISTANCE = 360;
const ZOOM_SCALE = 1.16;
export const TRANSITION_KEYFRAME_PREFIX = "__opencut_transition__:";

function readNumberParam({
	element,
	key,
	fallback,
}: {
	element: VisualElement;
	key: string;
	fallback: number;
}): number {
	const value = element.params[key];
	return typeof value === "number" ? value : fallback;
}

function setNumberKeyframe({
	animations,
	propertyPath,
	time,
	value,
	keyframeId,
}: {
	animations: ElementAnimations | undefined;
	propertyPath: string;
	time: MediaTime;
	value: number;
	keyframeId: string;
}): ElementAnimations | undefined {
	return upsertPathKeyframe({
		animations,
		propertyPath,
		time,
		value,
		keyframeId,
		interpolation: "linear",
		channelLayout: NUMBER_CHANNEL_LAYOUT,
		coerceValue: ({ value: nextValue }) =>
			typeof nextValue === "number" ? nextValue : null,
	});
}

function setTransitionKeyframes({
	animations,
	propertyPath,
	normalValue,
	edgeValue,
	placement,
	duration,
	transitionDuration,
}: {
	animations: ElementAnimations | undefined;
	propertyPath: string;
	normalValue: number;
	edgeValue: number;
	placement: TransitionPlacement;
	duration: MediaTime;
	transitionDuration: MediaTime;
}): ElementAnimations | undefined {
	const prefix = `${TRANSITION_KEYFRAME_PREFIX}${placement}:${propertyPath}:`;
	if (placement === "in") {
		const withEdge = setNumberKeyframe({
			animations,
			propertyPath,
			time: ZERO_MEDIA_TIME,
			value: edgeValue,
			keyframeId: `${prefix}edge`,
		});
		return setNumberKeyframe({
			animations: withEdge,
			propertyPath,
			time: transitionDuration,
			value: normalValue,
			keyframeId: `${prefix}normal`,
		});
	}
	const withNormal = setNumberKeyframe({
		animations,
		propertyPath,
		time: roundMediaTime({ time: duration - transitionDuration }),
		value: normalValue,
		keyframeId: `${prefix}normal`,
	});
	return setNumberKeyframe({
		animations: withNormal,
		propertyPath,
		time: duration,
		value: edgeValue,
		keyframeId: `${prefix}edge`,
	});
}

/** Builds renderer-native keyframes. Durations accepted here are seconds. */
export function buildTransitionAnimations({
	element,
	transitionId,
	placement,
	transitionDuration: requestedTransitionDuration,
}: {
	element: VisualElement;
	transitionId: TransitionId;
	placement: TransitionPlacement;
	transitionDuration?: number;
}): ElementAnimations | undefined {
	const elementDurationSeconds = mediaTimeToSeconds({ time: element.duration });
	const transitionDurationSeconds = Math.min(
		requestedTransitionDuration ?? DEFAULT_TRANSITION_DURATION_SECONDS,
		elementDurationSeconds / 2,
	);
	if (transitionDurationSeconds < MIN_DURATION_SECONDS) return element.animations;
	const transitionDuration = mediaTimeFromSeconds({
		seconds: transitionDurationSeconds,
	});

	const opacity = readNumberParam({ element, key: "opacity", fallback: 1 });
	const positionX = readNumberParam({
		element,
		key: "transform.positionX",
		fallback: 0,
	});
	const positionY = readNumberParam({
		element,
		key: "transform.positionY",
		fallback: 0,
	});
	const scaleX = readNumberParam({
		element,
		key: "transform.scaleX",
		fallback: 1,
	});
	const scaleY = readNumberParam({
		element,
		key: "transform.scaleY",
		fallback: 1,
	});
	let animations = element.animations;
	const animate = ({
		propertyPath,
		normalValue,
		edgeValue,
	}: {
		propertyPath: string;
		normalValue: number;
		edgeValue: number;
	}) => {
		animations = setTransitionKeyframes({
			animations,
			propertyPath,
			normalValue,
			edgeValue,
			placement,
			duration: element.duration,
			transitionDuration,
		});
	};

	if (transitionId === "fade") {
		animate({ propertyPath: "opacity", normalValue: opacity, edgeValue: 0 });
		return animations;
	}
	if (transitionId === "slide-left" || transitionId === "slide-left-out") {
		animate({ propertyPath: "opacity", normalValue: opacity, edgeValue: 0 });
		animate({
			propertyPath: "transform.positionX",
			normalValue: positionX,
			edgeValue: placement === "in" ? positionX + SLIDE_DISTANCE : positionX - SLIDE_DISTANCE,
		});
		return animations;
	}
	if (transitionId === "slide-right" || transitionId === "slide-right-out") {
		animate({ propertyPath: "opacity", normalValue: opacity, edgeValue: 0 });
		animate({
			propertyPath: "transform.positionX",
			normalValue: positionX,
			edgeValue: placement === "in" ? positionX - SLIDE_DISTANCE : positionX + SLIDE_DISTANCE,
		});
		return animations;
	}
	if (
		transitionId === "slide-up" ||
		transitionId === "slide-down" ||
		transitionId === "slide-up-out" ||
		transitionId === "slide-down-out"
	) {
		const movesUp = transitionId === "slide-up" || transitionId === "slide-up-out";
		animate({ propertyPath: "opacity", normalValue: opacity, edgeValue: 0 });
		animate({
			propertyPath: "transform.positionY",
			normalValue: positionY,
			edgeValue:
				placement === "in"
					? positionY + (movesUp ? SLIDE_DISTANCE : -SLIDE_DISTANCE)
					: positionY + (movesUp ? -SLIDE_DISTANCE : SLIDE_DISTANCE),
		});
		return animations;
	}
	animate({ propertyPath: "opacity", normalValue: opacity, edgeValue: 0 });
	animate({
		propertyPath: "transform.scaleX",
		normalValue: scaleX,
		edgeValue: scaleX * ZOOM_SCALE,
	});
	animate({
		propertyPath: "transform.scaleY",
		normalValue: scaleY,
		edgeValue: scaleY * ZOOM_SCALE,
	});
	return animations;
}
