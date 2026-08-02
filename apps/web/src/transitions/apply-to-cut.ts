import {
	buildTransitionAnimations,
	DEFAULT_TRANSITION_DURATION_SECONDS,
	type TransitionDefinition,
	type TransitionPlacement,
} from "./definitions";
import { isVisualElement } from "@/timeline";
import type { SceneTracks, TimelineTrack, VisualElement } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	roundMediaTime,
	TICKS_PER_SECOND,
} from "@/wasm";

const CUT_ALIGNMENT_TOLERANCE_SECONDS = 0.08;

export type TransitionCut = {
	outgoing: TransitionClip;
	incoming: TransitionClip;
};

type TransitionClip = {
	trackId: string;
	element: VisualElement;
};

function endTime(element: VisualElement): number {
	return element.startTime + element.duration;
}

/** The original cut position remains authoritative after clips are overlapped. */
function cutStartTime(element: VisualElement): number {
	return element.transitionIn?.restoreStartTime ?? element.startTime;
}

function getVisualTracks({ tracks }: { tracks: SceneTracks }): TimelineTrack[] {
	return [tracks.main, ...tracks.overlay].filter(
		(track) => track.type === "video" || track.type === "text" || track.type === "graphic",
	);
}

function canShareTransition({
	from,
	candidate,
}: {
	from: VisualElement;
	candidate: VisualElement;
}): boolean {
	const fromMedia = from.type === "video" || from.type === "image";
	const candidateMedia = candidate.type === "video" || candidate.type === "image";
	return fromMedia ? candidateMedia : candidate.type === from.type;
}

function findClosestVisualElement({
	tracks,
	time,
	exclude,
	from,
	match,
}: {
	tracks: TimelineTrack[];
	time: number;
	exclude: TransitionClip;
	from: VisualElement;
	match: (element: VisualElement) => number;
}): TransitionClip | null {
	const candidates = tracks
		.flatMap((track) =>
			track.elements
				.filter(isVisualElement)
				.map((element) => ({ trackId: track.id, element })),
		)
		.filter(
			(candidate) =>
				candidate.trackId === exclude.trackId && candidate.element.id !== exclude.element.id,
		)
		.filter((candidate) => canShareTransition({ from, candidate: candidate.element }))
		.map((candidate) => ({
			...candidate,
			distance: Math.abs(match(candidate.element) - time),
		}))
		.filter(({ distance }) => distance <= CUT_ALIGNMENT_TOLERANCE_SECONDS * TICKS_PER_SECOND)
		.sort((a, b) => a.distance - b.distance);
	const closest = candidates[0];
	return closest ? { trackId: closest.trackId, element: closest.element } : null;
}

/** Finds two compatible visual clips that meet at the same cut. */
export function findTransitionCut({
	tracks,
	trackId,
	element,
	placement,
}: {
	tracks: SceneTracks;
	trackId: string;
	element: VisualElement;
	placement: TransitionPlacement;
}): TransitionCut | null {
	const allVisualTracks = getVisualTracks({ tracks });
	const current: TransitionClip = { trackId, element };
	if (placement === "out") {
		const incoming = findClosestVisualElement({
			tracks: allVisualTracks,
			time: endTime(element),
			exclude: current,
			from: element,
			match: cutStartTime,
		});
		return incoming ? { outgoing: current, incoming } : null;
	}
	const outgoing = findClosestVisualElement({
		tracks: allVisualTracks,
		time: cutStartTime(element),
		exclude: current,
		from: element,
		match: endTime,
	});
	return outgoing ? { outgoing, incoming: current } : null;
}

function safeDurationTicks({ element, seconds }: { element: VisualElement; seconds: number }) {
	const safeSeconds = Math.max(
		0.08,
		Math.min(seconds, mediaTimeToSeconds({ time: element.duration }) / 2),
	);
	return mediaTimeFromSeconds({ seconds: safeSeconds });
}

/** Applies a true cross-transition. Both clips become visible around the cut. */
export function buildTransitionCutUpdates({
	cut,
	transition,
	outDurationSeconds,
	inDurationSeconds,
}: {
	cut: TransitionCut;
	transition: TransitionDefinition;
	outDurationSeconds?: number;
	inDurationSeconds?: number;
}) {
	const outDuration = safeDurationTicks({
		element: cut.outgoing.element,
		seconds: outDurationSeconds ?? transition.defaultOutDuration ?? DEFAULT_TRANSITION_DURATION_SECONDS,
	});
	const inDuration = safeDurationTicks({
		element: cut.incoming.element,
		seconds: inDurationSeconds ?? transition.defaultInDuration ?? DEFAULT_TRANSITION_DURATION_SECONDS,
	});
	const transitionInfo = {
		id: transition.id,
		name: transition.name,
		kind: "cut" as const,
		duration: outDuration >= inDuration ? outDuration : inDuration,
		outDuration,
		inDuration,
	};
	const outgoingBaseAnimations =
		cut.outgoing.element.transitionOut?.restoreAnimations ?? cut.outgoing.element.animations;
	const incomingBaseAnimations =
		cut.incoming.element.transitionIn?.restoreAnimations ?? cut.incoming.element.animations;
	const incomingOriginalStart =
		cut.incoming.element.transitionIn?.restoreStartTime ?? cut.incoming.element.startTime;

	return [
		{
			trackId: cut.outgoing.trackId,
			elementId: cut.outgoing.element.id,
			patch: {
				animations: buildTransitionAnimations({
					element: { ...cut.outgoing.element, animations: outgoingBaseAnimations },
					transitionId: transition.id,
					placement: "out",
					transitionDuration: mediaTimeToSeconds({ time: outDuration }),
				}),
				transitionOut: { ...transitionInfo, restoreAnimations: outgoingBaseAnimations },
			},
		},
		{
			trackId: cut.incoming.trackId,
			elementId: cut.incoming.element.id,
			patch: {
				// Start early so the two clips overlap automatically; the user never
				// needs to drag a hidden keyframe to make the transition work.
				startTime: roundMediaTime({ time: Math.max(0, incomingOriginalStart - inDuration) }),
				animations: buildTransitionAnimations({
					element: { ...cut.incoming.element, animations: incomingBaseAnimations },
					transitionId: transition.id,
					placement: "in",
					transitionDuration: mediaTimeToSeconds({ time: inDuration }),
				}),
				transitionIn: {
					...transitionInfo,
					restoreAnimations: incomingBaseAnimations,
					restoreStartTime: incomingOriginalStart,
				},
			},
		},
	];
}

/** Applies a safe one-sided entrance or exit effect to a single clip. */
export function buildSingleClipTransitionUpdates({
	trackId,
	element,
	transition,
	placement,
	durationSeconds,
}: {
	trackId: string;
	element: VisualElement;
	transition: TransitionDefinition;
	placement: TransitionPlacement;
	durationSeconds?: number;
}) {
	const duration = safeDurationTicks({
		element,
		seconds:
			durationSeconds ??
			(placement === "in" ? transition.defaultInDuration : transition.defaultOutDuration),
	});
	const existing = placement === "in" ? element.transitionIn : element.transitionOut;
	const baseAnimations = existing?.restoreAnimations ?? element.animations;
	const transitionInfo = {
		id: transition.id,
		name: transition.name,
		kind: placement,
		duration,
		outDuration: placement === "out" ? duration : undefined,
		inDuration: placement === "in" ? duration : undefined,
		restoreAnimations: baseAnimations,
	};
	return [
		{
			trackId,
			elementId: element.id,
			patch:
				placement === "in"
					? {
						animations: buildTransitionAnimations({
							element: { ...element, animations: baseAnimations },
							transitionId: transition.id,
							placement,
							transitionDuration: mediaTimeToSeconds({ time: duration }),
						}),
						transitionIn: transitionInfo,
					}
					: {
						animations: buildTransitionAnimations({
							element: { ...element, animations: baseAnimations },
							transitionId: transition.id,
							placement,
							transitionDuration: mediaTimeToSeconds({ time: duration }),
						}),
						transitionOut: transitionInfo,
					},
		},
	];
}

/** Restores both clips to their exact pre-transition state. */
export function buildRemoveTransitionCutUpdates({ cut }: { cut: TransitionCut }) {
	const outgoingTransition = cut.outgoing.element.transitionOut;
	const incomingTransition = cut.incoming.element.transitionIn;
	return [
		{
			trackId: cut.outgoing.trackId,
			elementId: cut.outgoing.element.id,
			patch: {
				animations: outgoingTransition?.restoreAnimations,
				transitionOut: undefined,
			},
		},
		{
			trackId: cut.incoming.trackId,
			elementId: cut.incoming.element.id,
			patch: {
				animations: incomingTransition?.restoreAnimations,
				startTime: incomingTransition?.restoreStartTime ?? cut.incoming.element.startTime,
				transitionIn: undefined,
			},
		},
	];
}

export function buildRemoveSingleClipTransitionUpdates({
	trackId,
	element,
	placement,
}: {
	trackId: string;
	element: VisualElement;
	placement: TransitionPlacement;
}) {
	const transition = placement === "in" ? element.transitionIn : element.transitionOut;
	return [
		{
			trackId,
			elementId: element.id,
			patch:
				placement === "in"
					? { animations: transition?.restoreAnimations, transitionIn: undefined }
					: { animations: transition?.restoreAnimations, transitionOut: undefined },
		},
	];
}
