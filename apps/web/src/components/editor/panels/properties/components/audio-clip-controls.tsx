"use client";

import { useRef, useState } from "react";
import { useEditor } from "@/editor/use-editor";
import { NumberField } from "@/components/ui/number-field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
	SectionHeader,
	SectionTitle,
} from "@/components/section";
import { usePropertyDraft } from "../hooks/use-property-draft";
import {
	DEFAULT_PITCH_SEMITONES,
	DEFAULT_RETIME_RATE,
	MAX_PITCH_SEMITONES,
	MAX_RETIME_RATE,
	MIN_PITCH_SEMITONES,
	MIN_RETIME_RATE,
	buildConstantRetime,
	clampPitchSemitones,
	clampRetimeRate,
} from "@/retime";
import { VOLUME_DB_MAX, VOLUME_DB_MIN } from "@/timeline/audio-constants";
import type { AudioElement, RetimeConfig } from "@/timeline";
import {
	formatNumberForDisplay,
	getFractionDigitsForStep,
	snapToStep,
} from "@/utils/math";

const VOLUME_STEP = 0.1;
const RATE_STEP = 0.01;
const PITCH_STEP = 0.1;
const VOLUME_DIGITS = getFractionDigitsForStep({ step: VOLUME_STEP });
const RATE_DIGITS = getFractionDigitsForStep({ step: RATE_STEP });
const PITCH_DIGITS = getFractionDigitsForStep({ step: PITCH_STEP });

function display({
	value,
	fractionDigits,
}: {
	value: number;
	fractionDigits: number;
}): string {
	return formatNumberForDisplay({ value, fractionDigits });
}

function clampVolume(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, value));
}

function parseNumber({
	input,
	step,
	clamp,
}: {
	input: string;
	step: number;
	clamp: (value: number) => number;
}): number | null {
	const value = Number.parseFloat(input);
	return Number.isNaN(value) ? null : clamp(snapToStep({ value, step }));
}

function buildRetime({
	rate,
	maintainPitch,
	pitchSemitones,
}: {
	rate: number;
	maintainPitch: boolean;
	pitchSemitones: number;
}): RetimeConfig | undefined {
	if (
		rate === DEFAULT_RETIME_RATE &&
		!maintainPitch &&
		pitchSemitones === DEFAULT_PITCH_SEMITONES
	) {
		return undefined;
	}
	return buildConstantRetime({ rate, maintainPitch, pitchSemitones });
}

/** All controls that affect one audio clip, deliberately kept in one panel. */
export function AudioClipControls({
	element,
	trackId,
}: {
	element: AudioElement;
	trackId: string;
}) {
	const editor = useEditor();
	const volume = clampVolume(
		typeof element.params.volume === "number" ? element.params.volume : 0,
	);
	const muted = element.params.muted === true;
	const rate = clampRetimeRate({
		rate: element.retime?.rate ?? DEFAULT_RETIME_RATE,
	});
	const maintainPitch = element.retime?.maintainPitch ?? false;
	const pitchSemitones = clampPitchSemitones({
		semitones: element.retime?.pitchSemitones ?? DEFAULT_PITCH_SEMITONES,
	});
	const pendingVolumeRef = useRef(volume);
	const pendingRateRef = useRef(rate);
	const pendingPitchRef = useRef(pitchSemitones);
	const [sliderVolume, setSliderVolume] = useState(volume);
	const [sliderRate, setSliderRate] = useState(rate);
	const [sliderPitch, setSliderPitch] = useState(pitchSemitones);
	const [isVolumeSliderDragging, setIsVolumeSliderDragging] = useState(false);
	const [isRateSliderDragging, setIsRateSliderDragging] = useState(false);
	const [isPitchSliderDragging, setIsPitchSliderDragging] = useState(false);
	const [isVolumeFieldEditing, setIsVolumeFieldEditing] = useState(false);
	const [isRateFieldEditing, setIsRateFieldEditing] = useState(false);
	const [isPitchFieldEditing, setIsPitchFieldEditing] = useState(false);
	const displayedVolume = isVolumeSliderDragging ? sliderVolume : volume;
	const displayedRate = isRateSliderDragging ? sliderRate : rate;
	const displayedPitch = isPitchSliderDragging ? sliderPitch : pitchSemitones;

	const commitParams = (params: Record<string, number | boolean>) => {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, patch: { params } }],
		});
	};
	const commitRetime = (next: RetimeConfig | undefined) => {
		editor.timeline.updateElementRetime({
			trackId,
			elementId: element.id,
			retime: next,
		});
	};

	const volumeDraft = usePropertyDraft({
		displayValue: display({ value: volume, fractionDigits: VOLUME_DIGITS }),
		parse: (input) =>
			parseNumber({ input, step: VOLUME_STEP, clamp: clampVolume }),
		onPreview: (next) => {
			pendingVolumeRef.current = next;
			setSliderVolume(next);
		},
		onCommit: () => commitParams({ volume: pendingVolumeRef.current }),
	});
	const rateDraft = usePropertyDraft({
		displayValue: display({ value: rate, fractionDigits: RATE_DIGITS }),
		parse: (input) =>
			parseNumber({
				input,
				step: RATE_STEP,
				clamp: (value) => clampRetimeRate({ rate: value }),
			}),
		onPreview: (next) => {
			pendingRateRef.current = next;
			setSliderRate(next);
		},
		onCommit: () =>
			commitRetime(
				buildRetime({
					rate: pendingRateRef.current,
					maintainPitch,
					pitchSemitones,
				}),
			),
	});
	const pitchDraft = usePropertyDraft({
		displayValue: display({
			value: pitchSemitones,
			fractionDigits: PITCH_DIGITS,
		}),
		parse: (input) =>
			parseNumber({
				input,
				step: PITCH_STEP,
				clamp: (value) => clampPitchSemitones({ semitones: value }),
			}),
		onPreview: (next) => {
			pendingPitchRef.current = next;
			setSliderPitch(next);
		},
		onCommit: () =>
			commitRetime(
				buildRetime({
					rate,
					maintainPitch,
					pitchSemitones: pendingPitchRef.current,
				}),
			),
	});

	return (
		<Section sectionKey={`${element.id}:audio-controls`}>
			<SectionHeader>
				<SectionTitle>音频控制</SectionTitle>
			</SectionHeader>
			<SectionContent>
				<SectionFields>
					<SectionField
						label={`音量：${display({ value: displayedVolume, fractionDigits: VOLUME_DIGITS })} dB`}
					>
						<div className="grid max-w-[22rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
							<Slider
								className="cursor-pointer"
								value={[displayedVolume]}
								min={VOLUME_DB_MIN}
								max={VOLUME_DB_MAX}
								step={VOLUME_STEP}
								onValueChange={([next]) => {
									setIsVolumeSliderDragging(true);
									pendingVolumeRef.current = next;
									setSliderVolume(next);
								}}
								onValueCommit={() => {
									setIsVolumeSliderDragging(false);
									commitParams({ volume: pendingVolumeRef.current });
								}}
							/>
							<div className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
								<NumberField
									className="w-20"
									value={
										isVolumeFieldEditing
											? volumeDraft.displayValue
											: display({
													value: displayedVolume,
													fractionDigits: VOLUME_DIGITS,
												})
									}
									scrubClamp={{ min: VOLUME_DB_MIN, max: VOLUME_DB_MAX }}
									scrubRanges={[
										{
											from: VOLUME_DB_MIN,
											to: VOLUME_DB_MAX,
											pixelsPerUnit: 3,
										},
									]}
									onFocus={() => {
										pendingVolumeRef.current = volume;
										setIsVolumeFieldEditing(true);
										volumeDraft.onFocus();
									}}
									onChange={volumeDraft.onChange}
									onBlur={(event) => {
										volumeDraft.onBlur(event);
										setIsVolumeFieldEditing(false);
									}}
									onScrub={volumeDraft.scrubTo}
									onScrubEnd={volumeDraft.commitScrub}
									onReset={() => commitParams({ volume: 0 })}
									isDefault={volume === 0}
								/>
								<span>dB</span>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							0 dB 为原始音量；-60 dB 接近静音；+20 dB 为增强。
						</p>
					</SectionField>

					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm">静音</p>
							<p className="text-xs text-muted-foreground">
								关闭声音但保留片段和音量设置。
							</p>
						</div>
						<Switch
							checked={muted}
							onCheckedChange={(next) => commitParams({ muted: next })}
						/>
					</div>

					<SectionField
						label={`速度：${display({ value: displayedRate, fractionDigits: RATE_DIGITS })}×`}
					>
						<div className="grid max-w-[22rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
							<Slider
								className="cursor-pointer"
								value={[displayedRate]}
								min={MIN_RETIME_RATE}
								max={MAX_RETIME_RATE}
								step={RATE_STEP}
								onValueChange={([next]) => {
									setIsRateSliderDragging(true);
									pendingRateRef.current = next;
									setSliderRate(next);
								}}
								onValueCommit={() => {
									setIsRateSliderDragging(false);
									commitRetime(
										buildRetime({
											rate: pendingRateRef.current,
											maintainPitch,
											pitchSemitones,
										}),
									);
								}}
							/>
							<div className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
								<NumberField
									className="w-20"
									value={
										isRateFieldEditing
											? rateDraft.displayValue
											: display({
													value: displayedRate,
													fractionDigits: RATE_DIGITS,
												})
									}
									scrubClamp={{ min: MIN_RETIME_RATE, max: MAX_RETIME_RATE }}
									scrubRanges={[
										{ from: MIN_RETIME_RATE, to: 1, pixelsPerUnit: 160 },
										{ from: 1, to: MAX_RETIME_RATE, pixelsPerUnit: 48 },
									]}
									onFocus={() => {
										pendingRateRef.current = rate;
										setIsRateFieldEditing(true);
										rateDraft.onFocus();
									}}
									onChange={rateDraft.onChange}
									onBlur={(event) => {
										rateDraft.onBlur(event);
										setIsRateFieldEditing(false);
									}}
									onScrub={rateDraft.scrubTo}
									onScrubEnd={rateDraft.commitScrub}
									onReset={() =>
										commitRetime(
											buildRetime({ rate: 1, maintainPitch, pitchSemitones }),
										)
									}
									isDefault={rate === DEFAULT_RETIME_RATE}
								/>
								<span>×</span>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							1.00× 为正常速度；可调范围 0.01×（最慢）到 5.00×（最快）。
						</p>
					</SectionField>

					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm">调速时保持原音调</p>
							<p className="text-xs text-muted-foreground">
								开启后，变快或变慢不会同时变尖或变低。
							</p>
						</div>
						<Switch
							checked={maintainPitch}
							onCheckedChange={(next) =>
								commitRetime(
									buildRetime({ rate, maintainPitch: next, pitchSemitones }),
								)
							}
						/>
					</div>

					<SectionField
						label={`音调：${display({ value: displayedPitch, fractionDigits: PITCH_DIGITS })} 半音`}
					>
						<div className="grid max-w-[22rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
							<Slider
								className="cursor-pointer"
								value={[displayedPitch]}
								min={MIN_PITCH_SEMITONES}
								max={MAX_PITCH_SEMITONES}
								step={PITCH_STEP}
								onValueChange={([next]) => {
									setIsPitchSliderDragging(true);
									pendingPitchRef.current = next;
									setSliderPitch(next);
								}}
								onValueCommit={() => {
									setIsPitchSliderDragging(false);
									commitRetime(
										buildRetime({
											rate,
											maintainPitch,
											pitchSemitones: pendingPitchRef.current,
										}),
									);
								}}
							/>
							<div className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
								<NumberField
									className="w-20"
									value={
										isPitchFieldEditing
											? pitchDraft.displayValue
											: display({
													value: displayedPitch,
													fractionDigits: PITCH_DIGITS,
												})
									}
									scrubClamp={{
										min: MIN_PITCH_SEMITONES,
										max: MAX_PITCH_SEMITONES,
									}}
									scrubRanges={[
										{
											from: MIN_PITCH_SEMITONES,
											to: MAX_PITCH_SEMITONES,
											pixelsPerUnit: 18,
										},
									]}
									onFocus={() => {
										pendingPitchRef.current = pitchSemitones;
										setIsPitchFieldEditing(true);
										pitchDraft.onFocus();
									}}
									onChange={pitchDraft.onChange}
									onBlur={(event) => {
										pitchDraft.onBlur(event);
										setIsPitchFieldEditing(false);
									}}
									onScrub={pitchDraft.scrubTo}
									onScrubEnd={pitchDraft.commitScrub}
									onReset={() =>
										commitRetime(
											buildRetime({ rate, maintainPitch, pitchSemitones: 0 }),
										)
									}
									isDefault={pitchSemitones === DEFAULT_PITCH_SEMITONES}
								/>
								<span>半音</span>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							0 半音为原调；-12 半音约低一个八度；+12 半音约高一个八度。
						</p>
					</SectionField>

					<p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">
						时间线两端可直接拖拽：向外拉长会变慢，向内缩短会变快；不会裁掉原始音频。速度会自动限制在
						0.01×–5.00×。
					</p>
				</SectionFields>
			</SectionContent>
		</Section>
	);
}
