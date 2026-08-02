import type { MaskableElement, VisualElement } from "./types";
import type { ParamValues } from "@/params";
import type { TransitionId, TransitionUsage } from "@/transitions/definitions";

interface BaseDragData {
	id: string;
	name: string;
}

export interface MediaDragData extends BaseDragData {
	type: "media";
	mediaType: "image" | "video" | "audio";
	targetElementTypes?: MaskableElement["type"][];
}

export interface TextDragData extends BaseDragData {
	type: "text";
	content: string;
	params?: Partial<ParamValues>;
}

export interface StickerDragData extends BaseDragData {
	type: "sticker";
	stickerId: string;
}

export interface GraphicDragData extends BaseDragData {
	type: "graphic";
	definitionId: string;
	params: Partial<ParamValues>;
}

export interface EffectDragData extends BaseDragData {
	type: "effect";
	effectType: string;
	targetElementTypes: VisualElement["type"][];
}

/** A transition is dropped on a visual clip's left or right timeline edge. */
export interface TransitionDragData extends BaseDragData {
	type: "transition";
	transitionId: TransitionId;
	transitionUsage: TransitionUsage;
}

export type TimelineDragData =
	| MediaDragData
	| TextDragData
	| StickerDragData
	| GraphicDragData
	| EffectDragData
	| TransitionDragData;
