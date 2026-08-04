import type { RetimeConfig } from "@/timeline";
import {
	clampPitchSemitones,
	clampRetimeRate,
	DEFAULT_PITCH_SEMITONES,
} from "@/retime/rate";

export function buildConstantRetime({
	rate,
	maintainPitch = false,
	pitchSemitones = DEFAULT_PITCH_SEMITONES,
}: {
	rate: number;
	maintainPitch?: boolean;
	pitchSemitones?: number;
}): RetimeConfig {
	return {
		rate: clampRetimeRate({ rate }),
		maintainPitch,
		pitchSemitones: clampPitchSemitones({ semitones: pitchSemitones }),
	};
}
