export const DEFAULT_RETIME_RATE = 1;
export const MIN_RETIME_RATE = 0.01;
export const MAX_RETIME_RATE = 5;
export const DEFAULT_PITCH_SEMITONES = 0;
export const MIN_PITCH_SEMITONES = -12;
export const MAX_PITCH_SEMITONES = 12;

export function clampRetimeRate({ rate }: { rate: number }): number {
	if (!Number.isFinite(rate) || rate <= 0) {
		return DEFAULT_RETIME_RATE;
	}

	return Math.min(Math.max(rate, MIN_RETIME_RATE), MAX_RETIME_RATE);
}

export function canMaintainPitch({ rate }: { rate: number }): boolean {
	return Number.isFinite(rate) && rate > 0;
}

export function shouldMaintainPitch({
	rate,
	maintainPitch,
}: {
	rate: number;
	maintainPitch?: boolean;
}): boolean {
	return maintainPitch === true && canMaintainPitch({ rate });
}

export function clampPitchSemitones({
	semitones,
}: {
	semitones: number;
}): number {
	if (!Number.isFinite(semitones)) return DEFAULT_PITCH_SEMITONES;
	return Math.min(
		Math.max(semitones, MIN_PITCH_SEMITONES),
		MAX_PITCH_SEMITONES,
	);
}

export function hasPitchShift({ semitones }: { semitones?: number }): boolean {
	return Math.abs(clampPitchSemitones({ semitones: semitones ?? 0 })) > 1e-6;
}

export function shouldRenderRetimeAudio({
	rate,
	maintainPitch,
	pitchSemitones,
}: {
	rate: number;
	maintainPitch?: boolean;
	pitchSemitones?: number;
}): boolean {
	return (
		shouldMaintainPitch({ rate, maintainPitch }) ||
		hasPitchShift({ semitones: pitchSemitones })
	);
}
