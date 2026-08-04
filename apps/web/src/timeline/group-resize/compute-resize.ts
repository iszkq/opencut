import {
	buildConstantRetime,
	MAX_RETIME_RATE,
	MIN_RETIME_RATE,
	getSourceSpanAtClipTime,
	getTimelineDurationForSourceSpan,
} from "@/retime";
import {
	addMediaTime,
	clampMediaTime,
	maxMediaTime,
	type MediaTime,
	mediaTime,
	minMediaTime,
	roundFrameTicks,
	roundMediaTime,
	subMediaTime,
	TICKS_PER_SECOND,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type {
	ComputeGroupResizeArgs,
	GroupResizeMember,
	GroupResizeResult,
	GroupResizeUpdate,
	ResizeSide,
} from "./types";

export function computeGroupResize({
	members,
	side,
	deltaTime,
	fps,
}: ComputeGroupResizeArgs): GroupResizeResult {
	if (members.length === 0) {
		return { deltaTime: ZERO_MEDIA_TIME, updates: [] };
	}

	const minDuration = mediaTime({
		ticks: Math.round((TICKS_PER_SECOND * fps.denominator) / fps.numerator),
	});
	let minimumDeltaTime = getMinimumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});
	let maximumDeltaTime = getMaximumAllowedDeltaTime({
		member: members[0],
		side,
		minDuration,
	});

	for (const member of members.slice(1)) {
		minimumDeltaTime = maxMediaTime({
			a: minimumDeltaTime,
			b: getMinimumAllowedDeltaTime({
				member,
				side,
				minDuration,
			}),
		});
		const memberMaximum = getMaximumAllowedDeltaTime({
			member,
			side,
			minDuration,
		});
		if (memberMaximum !== null) {
			maximumDeltaTime =
				maximumDeltaTime === null
					? memberMaximum
					: minMediaTime({ a: maximumDeltaTime, b: memberMaximum });
		}
	}

	const clampedDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: deltaTime })
			: clampMediaTime({
					time: deltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	// Snap the drag delta to a frame exactly once, then derive every patch
	// field from that single snapped value. This keeps the invariant
	// `trimStart + duration*rate + trimEnd == sourceDuration` exact: the same
	// delta is added on one side of the element and removed from the other,
	// so the rounding cancels by construction. Per-field rounding (the old
	// approach) couldn't preserve this because the individual rounds don't
	// compose when `sourceDuration` isn't frame-aligned.
	const isAudioStretch = members.every(
		(member) => member.elementType === "audio",
	);
	// Audio waveforms should follow the pointer continuously. Frame snapping is
	// useful for video cuts, but makes short audio clips visibly jump while the
	// user drags an edge to retime them.
	const snappedDeltaTime = isAudioStretch
		? clampedDeltaTime
		: mediaTime({
				ticks: roundFrameTicks({ ticks: clampedDeltaTime, fps }),
			});
	// Re-clamp after rounding. Bounds derived from other elements are
	// frame-aligned, so this is normally a no-op; at the source-extent limit
	// the bound may not be frame-aligned, and honouring the bound takes
	// precedence over frame alignment (you can't extend past real content).
	const finalDeltaTime =
		maximumDeltaTime === null
			? maxMediaTime({ a: minimumDeltaTime, b: snappedDeltaTime })
			: clampMediaTime({
					time: snappedDeltaTime,
					min: minimumDeltaTime,
					max: maximumDeltaTime,
				});

	return {
		deltaTime: Object.is(finalDeltaTime, -0) ? ZERO_MEDIA_TIME : finalDeltaTime,
		updates: members.map((member) =>
			buildResizeUpdate({
				member,
				side,
				deltaTime: finalDeltaTime,
			}),
		),
	};
}

function buildResizeUpdate({
	member,
	side,
	deltaTime,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	deltaTime: MediaTime;
}): GroupResizeUpdate {
	if (member.elementType === "audio") {
		return buildAudioStretchUpdate({ member, side, deltaTime });
	}

	const sourceDelta = getSourceDeltaForClipDelta({
		member,
		clipDelta: deltaTime,
	});

	if (side === "left") {
		return {
			trackId: member.trackId,
			elementId: member.elementId,
			patch: {
				trimStart: maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: addMediaTime({ a: member.trimStart, b: sourceDelta }),
				}),
				trimEnd: member.trimEnd,
				startTime: addMediaTime({ a: member.startTime, b: deltaTime }),
				duration: subMediaTime({ a: member.duration, b: deltaTime }),
			},
		};
	}

	return {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: member.trimStart,
			trimEnd: maxMediaTime({
				a: ZERO_MEDIA_TIME,
				b: subMediaTime({ a: member.trimEnd, b: sourceDelta }),
			}),
			startTime: member.startTime,
			duration: addMediaTime({ a: member.duration, b: deltaTime }),
		},
	};
}

function buildAudioStretchUpdate({
	member,
	side,
	deltaTime,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	deltaTime: MediaTime;
}): GroupResizeUpdate {
	const sourceSpan = getAudioVisibleSourceSpan({ member });
	const desiredDuration =
		side === "left"
			? subMediaTime({ a: member.duration, b: deltaTime })
			: addMediaTime({ a: member.duration, b: deltaTime });
	const rate = sourceSpan / desiredDuration;
	const retime = buildConstantRetime({
		rate,
		maintainPitch: member.retime?.maintainPitch ?? false,
		pitchSemitones: member.retime?.pitchSemitones,
	});
	const nextRetime =
		Math.abs(retime.rate - (member.retime?.rate ?? 1)) < 1e-6
			? member.retime
			: retime;
	const duration = roundMediaTime({
		time: getTimelineDurationForSourceSpan({ sourceSpan, retime }),
	});
	const startTime =
		side === "left"
			? subMediaTime({
					a: addMediaTime({ a: member.startTime, b: member.duration }),
					b: duration,
				})
			: member.startTime;

	return {
		trackId: member.trackId,
		elementId: member.elementId,
		patch: {
			trimStart: member.trimStart,
			trimEnd: member.trimEnd,
			startTime,
			duration,
			...(nextRetime !== undefined ? { retime: nextRetime } : {}),
		},
	};
}

function getMinimumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime {
	if (member.elementType === "audio") {
		const minAudioDuration = maxMediaTime({
			a: minDuration,
			b: getAudioMinimumTimelineDuration({ member }),
		});

		if (side === "right") {
			// Right-edge movement has the opposite meaning to the left edge:
			// moving it left shortens the clip. Its negative limit must therefore
			// be measured from the *current* duration to the 5x minimum duration.
			// Using the slow-motion maximum here let the pointer cross the valid
			// range, after which the retime pipeline could clamp/reset the rate.
			return subMediaTime({ a: minAudioDuration, b: member.duration });
		}

		const maxDuration = getAudioMaximumTimelineDuration({ member });
		const stretchFloor = subMediaTime({ a: member.duration, b: maxDuration });
		const leftNeighborFloor =
			member.leftNeighborBound !== null
				? subMediaTime({ a: member.leftNeighborBound, b: member.startTime })
				: subMediaTime({ a: ZERO_MEDIA_TIME, b: member.startTime });
		return maxMediaTime({ a: stretchFloor, b: leftNeighborFloor });
	}

	if (side === "right") {
		return subMediaTime({ a: minDuration, b: member.duration });
	}

	const leftNeighborFloor =
		member.leftNeighborBound !== null
			? subMediaTime({ a: member.leftNeighborBound, b: member.startTime })
			: subMediaTime({ a: ZERO_MEDIA_TIME, b: member.startTime });
	if (member.sourceDuration == null) {
		return leftNeighborFloor;
	}

	const maximumSourceExtension = subMediaTime({
		a: getDurationForVisibleSourceSpan({
			member,
			sourceSpan: addMediaTime({
				a: getVisibleSourceSpanForDuration({
					member,
					duration: member.duration,
				}),
				b: member.trimStart,
			}),
		}),
		b: member.duration,
	});
	return maxMediaTime({
		a: leftNeighborFloor,
		b: subMediaTime({ a: ZERO_MEDIA_TIME, b: maximumSourceExtension }),
	});
}

function getMaximumAllowedDeltaTime({
	member,
	side,
	minDuration,
}: {
	member: GroupResizeMember;
	side: ResizeSide;
	minDuration: MediaTime;
}): MediaTime | null {
	if (member.elementType === "audio") {
		const minAudioDuration = maxMediaTime({
			a: minDuration,
			b: getAudioMinimumTimelineDuration({ member }),
		});
		if (side === "left") {
			// Moving the left edge right shortens the clip, so its positive
			// limit is the shortest permitted timeline duration.
			return subMediaTime({ a: member.duration, b: minAudioDuration });
		}
		// Moving the right edge right lengthens the clip. This must use the
		// slowest permitted rate (the maximum timeline duration), not the
		// minimum duration used by the left-edge shortening case.
		const stretchCeiling = subMediaTime({
			a: getAudioMaximumTimelineDuration({ member }),
			b: member.duration,
		});
		const rightNeighborCeiling =
			member.rightNeighborBound === null
				? null
				: subMediaTime({
						a: member.rightNeighborBound,
						b: addMediaTime({ a: member.startTime, b: member.duration }),
					});
		return rightNeighborCeiling === null
			? stretchCeiling
			: minMediaTime({ a: stretchCeiling, b: rightNeighborCeiling });
	}

	if (side === "left") {
		return subMediaTime({ a: member.duration, b: minDuration });
	}

	const rightNeighborCeiling =
		member.rightNeighborBound === null
			? null
			: subMediaTime({
					a: member.rightNeighborBound,
					b: addMediaTime({ a: member.startTime, b: member.duration }),
				});
	if (member.sourceDuration == null) {
		return rightNeighborCeiling;
	}

	const maximumVisibleSourceSpan = subMediaTime({
		a: getSourceDuration({ member }),
		b: member.trimStart,
	});
	const maximumDuration = getDurationForVisibleSourceSpan({
		member,
		sourceSpan: maximumVisibleSourceSpan,
	});
	const sourceDurationCeiling = subMediaTime({
		a: maximumDuration,
		b: member.duration,
	});
	return rightNeighborCeiling === null
		? sourceDurationCeiling
		: minMediaTime({ a: rightNeighborCeiling, b: sourceDurationCeiling });
}

function getAudioVisibleSourceSpan({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	return maxMediaTime({
		a: ZERO_MEDIA_TIME,
		b: subMediaTime({
			a: subMediaTime({
				a: getSourceDuration({ member }),
				b: member.trimStart,
			}),
			b: member.trimEnd,
		}),
	});
}

function getAudioMinimumTimelineDuration({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	return roundMediaTime({
		time: getTimelineDurationForSourceSpan({
			sourceSpan: getAudioVisibleSourceSpan({ member }),
			retime: { rate: MAX_RETIME_RATE },
		}),
	});
}

function getAudioMaximumTimelineDuration({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	return roundMediaTime({
		time: getTimelineDurationForSourceSpan({
			sourceSpan: getAudioVisibleSourceSpan({ member }),
			retime: { rate: MIN_RETIME_RATE },
		}),
	});
}

function getSourceDeltaForClipDelta({
	member,
	clipDelta,
}: {
	member: GroupResizeMember;
	clipDelta: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return clipDelta;
	}

	const sourceDelta =
		clipDelta >= 0
			? getSourceSpanAtClipTime({
					clipTime: clipDelta,
					retime: member.retime,
				})
			: -getSourceSpanAtClipTime({
					clipTime: Math.abs(clipDelta),
					retime: member.retime,
				});
	return roundMediaTime({ time: sourceDelta });
}

function getVisibleSourceSpanForDuration({
	member,
	duration,
}: {
	member: GroupResizeMember;
	duration: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return duration;
	}

	return roundMediaTime({
		time: getSourceSpanAtClipTime({
			clipTime: duration,
			retime: member.retime,
		}),
	});
}

function getDurationForVisibleSourceSpan({
	member,
	sourceSpan,
}: {
	member: GroupResizeMember;
	sourceSpan: MediaTime;
}): MediaTime {
	if (!member.retime) {
		return sourceSpan;
	}

	return roundMediaTime({
		time: getTimelineDurationForSourceSpan({
			sourceSpan,
			retime: member.retime,
		}),
	});
}

function getSourceDuration({
	member,
}: {
	member: GroupResizeMember;
}): MediaTime {
	if (member.sourceDuration != null) {
		return member.sourceDuration;
	}

	return addMediaTime({
		a: addMediaTime({
			a: member.trimStart,
			b: getVisibleSourceSpanForDuration({
				member,
				duration: member.duration,
			}),
		}),
		b: member.trimEnd,
	});
}
