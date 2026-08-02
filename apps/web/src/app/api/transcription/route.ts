import { NextResponse } from "next/server";
import path from "node:path";

export const runtime = "nodejs";

type SenseVoiceResult = {
	text: string;
	timestamps?: number[];
	tokens?: string[];
};

let recognizer: {
	createStream: () => unknown;
	decode: (stream: unknown) => void;
	getResult: (stream: unknown) => SenseVoiceResult;
} | null = null;

function getRecognizer() {
	if (recognizer) return recognizer;
	// sherpa-onnx is a local WASM runtime. It never sends audio to a server.
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const sherpa = require("sherpa-onnx") as typeof import("sherpa-onnx");
	const modelDirectory = path.join(process.cwd(), "public", "models", "sensevoice");
	recognizer = sherpa.createOfflineRecognizer({
		modelConfig: {
			senseVoice: {
				model: path.join(modelDirectory, "model.int8.onnx"),
				language: "zh",
				useInverseTextNormalization: 1,
			},
			tokens: path.join(modelDirectory, "tokens.txt"),
		},
	});
	return recognizer;
}

function cleanText(text: string): string {
	return text.replace(/<\|[^|]+\|>/g, "").trim();
}

function cleanToken(token: string): string {
	return cleanText(token.replaceAll("▁", " "));
}

function buildTimedCaptionSegments({
	result,
	range,
	sampleRate,
}: {
	result: SenseVoiceResult;
	range: SpeechRange;
	sampleRate: number;
}): Array<{ text: string; start: number; end: number }> {
	const tokens = result.tokens ?? [];
	const timestamps = result.timestamps ?? [];
	const fallback = {
		text: cleanText(result.text),
		start: range.start / sampleRate,
		end: range.end / sampleRate,
	};
	if (tokens.length !== timestamps.length || tokens.length === 0) {
		return fallback.text ? [fallback] : [];
	}

	const timedTokens = tokens
		.map((token, index) => ({ text: cleanToken(token), start: timestamps[index] }))
		.filter((token) => token.text && Number.isFinite(token.start));
	if (timedTokens.length === 0) return fallback.text ? [fallback] : [];

	const groups: Array<{ text: string; firstToken: number }> = [];
	let text = "";
	let firstToken = 0;
	const flush = () => {
		const value = text.replace(/\s+/g, " ").trim();
		if (value) groups.push({ text: value, firstToken });
		text = "";
	};

	for (let index = 0; index < timedTokens.length; index += 1) {
		if (!text) firstToken = index;
		text += timedTokens[index].text;
		const isSentenceEnd = /[\u3002\uFF01\uFF1F!?]/u.test(
			timedTokens[index].text,
		);
		// Keep a complete spoken sentence in one timed cue. Visual line wrapping is
		// handled separately, so a word can never be split across two subtitle cues.
		if (isSentenceEnd) {
			flush();
		}
	}
	flush();

	const rangeStart = range.start / sampleRate;
	const rangeEnd = range.end / sampleRate;
	const averageTokenDuration =
		timedTokens.length > 1
			? Math.max(
				0.12,
				(timedTokens.at(-1)!.start - timedTokens[0].start) /
					(timedTokens.length - 1),
			)
			: 0.35;

	return groups.map((group, index) => {
		const start = rangeStart + timedTokens[group.firstToken].start;
		const nextGroup = groups[index + 1];
		const end = nextGroup
			? rangeStart + timedTokens[nextGroup.firstToken].start
			: Math.min(
				rangeEnd,
				rangeStart +
					timedTokens.at(-1)!.start +
					averageTokenDuration * 1.5,
			);
		return { text: group.text, start, end: Math.max(end, start + 0.12) };
	});
}

type SpeechRange = { start: number; end: number };

function findSpeechRanges({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): SpeechRange[] {
	const frameSize = Math.max(1, Math.floor(sampleRate / 10));
	const levels: number[] = [];
	for (let start = 0; start < samples.length; start += frameSize) {
		let energy = 0;
		const end = Math.min(samples.length, start + frameSize);
		for (let index = start; index < end; index += 1) energy += samples[index] ** 2;
		levels.push(Math.sqrt(energy / Math.max(1, end - start)));
	}

	const sorted = [...levels].sort((a, b) => a - b);
	const noiseFloor = sorted[Math.floor(sorted.length * 0.1)] ?? 0;
	const speechLevel = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
	if (speechLevel < 0.004) return [];
	const threshold = Math.max(0.0035, noiseFloor + (speechLevel - noiseFloor) * 0.2);
	const pauseFrames = 4; // 400 ms is enough to separate most spoken phrases.
	const maxRangeSize = sampleRate * 7;
	const ranges: SpeechRange[] = [];
	let speechStart = -1;
	let silenceStart = -1;

	const addRange = (start: number, end: number) => {
		for (let offset = start; offset < end; offset += maxRangeSize) {
			const rangeEnd = Math.min(end, offset + maxRangeSize);
			if (rangeEnd - offset >= sampleRate * 0.35) {
				ranges.push({ start: offset, end: rangeEnd });
			}
		}
	};

	for (let frame = 0; frame < levels.length; frame += 1) {
		if (levels[frame] >= threshold) {
			if (speechStart < 0) speechStart = Math.max(0, (frame - 1) * frameSize);
			silenceStart = -1;
			continue;
		}

		if (speechStart < 0) continue;
		if (silenceStart < 0) silenceStart = frame;
		if (frame - silenceStart + 1 >= pauseFrames) {
			addRange(
				speechStart,
				// Keep the measured pause as trailing context. SenseVoice timestamps
				// punctuation slightly after the last voiced frame.
				Math.min(samples.length, (silenceStart + pauseFrames + 1) * frameSize),
			);
			speechStart = -1;
			silenceStart = -1;
		}
	}

	if (speechStart >= 0) addRange(speechStart, samples.length);
	return ranges;
}

export async function POST(request: Request) {
	try {
		const formData = await request.formData();
		const audio = formData.get("audio");
		if (!(audio instanceof File)) {
			return NextResponse.json({ error: "Missing WAV audio" }, { status: 400 });
		}

		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const sherpa = require("sherpa-onnx") as typeof import("sherpa-onnx");
		const wave = sherpa.readWaveFromBinaryData(
			new Uint8Array(await audio.arrayBuffer()),
		);
		const engine = getRecognizer();
		const segments: Array<{ text: string; start: number; end: number }> = [];

		for (const range of findSpeechRanges({
			samples: wave.samples,
			sampleRate: wave.sampleRate,
		})) {
			const samples = wave.samples.slice(range.start, range.end);
			const stream = engine.createStream() as {
				acceptWaveform: (sampleRate: number, data: Float32Array) => void;
				free: () => void;
			};
			stream.acceptWaveform(wave.sampleRate, samples);
			engine.decode(stream);
			const result = engine.getResult(stream);
			stream.free();
			segments.push(
				...buildTimedCaptionSegments({
					result,
					range,
					sampleRate: wave.sampleRate,
				}),
			);
		}

		return NextResponse.json({ text: segments.map((item) => item.text).join(" "), segments });
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "SenseVoice transcription failed" },
			{ status: 500 },
		);
	}
}
