import type { TranscriptionSegment, CaptionChunk } from "@/transcription/types";
import {
	DEFAULT_WORDS_PER_CAPTION,
	MIN_CAPTION_DURATION_SECONDS,
} from "@/transcription/caption-defaults";

export function buildCaptionChunks({
	segments,
	wordsPerChunk = DEFAULT_WORDS_PER_CAPTION,
	minDuration = MIN_CAPTION_DURATION_SECONDS,
}: {
	segments: TranscriptionSegment[];
	wordsPerChunk?: number;
	minDuration?: number;
}): CaptionChunk[] {
	const captions: CaptionChunk[] = [];
	let globalEndTime = 0;

	for (const segment of segments) {
		const chunks = splitCaptionText({ text: segment.text, wordsPerChunk });
		if (chunks.length === 0) continue;

		const segmentDuration = segment.end - segment.start;
		const totalWeight = chunks.reduce(
			(total, chunk) => total + captionWeight(chunk),
			0,
		);
		const minimumCueDuration = Math.min(
			minDuration,
			segmentDuration / chunks.length,
		);
		const remainingDuration = Math.max(
			0,
			segmentDuration - minimumCueDuration * chunks.length,
		);

		let chunkStartTime = segment.start;
		for (const chunk of chunks) {
			// A small readable baseline plus proportional time keeps every cue
			// inside the original source segment.
			const chunkDuration =
				minimumCueDuration +
				(remainingDuration * captionWeight(chunk)) / totalWeight;
			const adjustedStartTime = Math.max(chunkStartTime, globalEndTime);

			captions.push({
				text: chunk,
				startTime: adjustedStartTime,
				duration: chunkDuration,
			});

			globalEndTime = adjustedStartTime + chunkDuration;
			chunkStartTime += chunkDuration;
		}
	}

	return captions;
}

function captionWeight(text: string): number {
	// CJK characters carry more timing information than whitespace alone.
	return Math.max(1, [...text.replace(/\s/g, "")].length);
}

function splitCaptionText({
	text,
	wordsPerChunk,
}: {
	text: string;
	wordsPerChunk: number;
}): string[] {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return [];
	// SenseVoice already returns timestamped, screen-sized CJK cues. Keep each
	// cue intact so the token timestamps are not replaced by a second estimate.
	if (/[\u3400-\u9fff]/u.test(normalized)) return [normalized];

	// Chinese transcripts normally have no spaces. Split at natural punctuation
	// first, then break unusually long clauses into readable screen-sized cues.
	if (/[\u3400-\u9fff]/u.test(normalized)) {
		const clauses = normalized.match(/[^，。！？；,.!?;]+[，。！？；,.!?;]?/gu) ?? [normalized];
		const result: string[] = [];
		for (const clause of clauses) {
			const value = clause.trim();
			if (!value) continue;
			const characters = [...value];
			for (let offset = 0; offset < characters.length; offset += 18) {
				result.push(characters.slice(offset, offset + 18).join("").trim());
			}
		}
		return result;
	}

	const words = normalized.split(/\s+/);
	const result: string[] = [];
	for (let i = 0; i < words.length; i += wordsPerChunk) {
		result.push(words.slice(i, i + wordsPerChunk).join(" "));
	}
	return result;
}
