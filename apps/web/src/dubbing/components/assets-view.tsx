"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { mediaTimeFromSeconds } from "@/wasm";
import { toast } from "sonner";
import { PlayIcon, Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type SpeechResult = {
	name: string;
	base64: string;
	mimeType: string;
	path: string;
};

type TtsBridge = {
	generateSelfHostedEdgeTts: (params: {
		text: string;
		voice: string;
		speed: number;
		pitch: number;
		style: string;
	}) => Promise<SpeechResult>;
};

const SAMPLE_TEXT = "你好，这是一段高质量角色配音试听示例。";
const EDGE_TTS_VOICES = [
	["zh-CN-XiaoxiaoNeural", "晓晓 · 温柔女声"],
	["zh-CN-XiaoyiNeural", "晓伊 · 活泼女声"],
	["zh-CN-XiaohanNeural", "晓涵 · 成熟知性"],
	["zh-CN-XiaomengNeural", "晓梦 · 少女声"],
	["zh-CN-XiaomoNeural", "晓墨 · 轻柔女声"],
	["zh-CN-XiaoruiNeural", "晓睿 · 清晰女声"],
	["zh-CN-XiaoxuanNeural", "晓萱 · 自然女声"],
	["zh-CN-XiaoyanNeural", "晓颜 · 温暖女声"],
	["zh-CN-XiaoyouNeural", "晓悠 · 亲切女声"],
	["zh-CN-XiaozhenNeural", "晓甄 · 新闻女声"],
	["zh-CN-YunxiNeural", "云希 · 阳光男声"],
	["zh-CN-YunyangNeural", "云扬 · 专业男声"],
	["zh-CN-YunjianNeural", "云健 · 沉稳男声"],
	["zh-CN-YunfengNeural", "云枫 · 磁性男声"],
	["zh-CN-YunhaoNeural", "云皓 · 旁白男声"],
	["zh-CN-YunxiaNeural", "云夏 · 少年男声"],
	["zh-CN-YunyeNeural", "云野 · 活力男声"],
	["zh-CN-YunzeNeural", "云泽 · 成熟男声"],
] as const;

const SPEEDS = [
	[0.5, "🐌 很慢"],
	[0.75, "🚶 慢速"],
	[1, "⚡ 正常"],
	[1.25, "🏃 快速"],
	[1.5, "🚀 很快"],
	[2, "💨 极速"],
] as const;

const PITCHES = [
	[-50, "📉 很低沉"],
	[-25, "📊 低沉"],
	[0, "🎵 标准"],
	[25, "📈 高亢"],
	[50, "🎶 很高亢"],
] as const;

const STYLES = [
	["general", "🎭 通用风格"],
	["assistant", "🤖 智能助手"],
	["chat", "💬 聊天对话"],
	["customerservice", "📞 客服专业"],
	["newscast", "📺 新闻播报"],
	["affectionate", "💕 亲切温暖"],
	["calm", "😌 平静舒缓"],
	["cheerful", "😊 愉快欢乐"],
	["gentle", "🌸 温和柔美"],
	["lyrical", "🎼 抒情诗意"],
	["serious", "🎯 严肃正式"],
] as const;

function getDesktopBridge(): TtsBridge | null {
	return (
		(window as Window & { opencutDesktop?: TtsBridge }).opencutDesktop ?? null
	);
}

function fileFromResult(result: SpeechResult) {
	const binary = atob(result.base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1)
		bytes[index] = binary.charCodeAt(index);
	return new File([bytes], result.name, {
		type: result.mimeType || "audio/mpeg",
	});
}

export function DubbingView() {
	const editor = useEditor();
	const activeProject = useEditor((state) => state.project.getActive());
	const [text, setText] = useState("");
	const [voice, setVoice] = useState(EDGE_TTS_VOICES[0][0]);
	const [speed, setSpeed] = useState(1);
	const [pitch, setPitch] = useState(0);
	const [style, setStyle] = useState("general");
	const [busy, setBusy] = useState<"preview" | "add" | null>(null);
	const previewUrl = useRef<string | null>(null);
	const previewAudio = useRef<HTMLAudioElement | null>(null);

	const generate = async ({ useSampleText = false } = {}) => {
		const bridge = getDesktopBridge();
		if (!bridge) throw new Error("角色配音只能在桌面版中使用。");
		const input = text.trim() || (useSampleText ? SAMPLE_TEXT : "");
		if (!input) throw new Error("请输入需要配音的文字。");
		return bridge.generateSelfHostedEdgeTts({
			text: input,
			voice,
			speed,
			pitch,
			style,
		});
	};

	const preview = async () => {
		setBusy("preview");
		try {
			const result = await generate({ useSampleText: true });
			previewAudio.current?.pause();
			if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
			previewUrl.current = URL.createObjectURL(fileFromResult(result));
			previewAudio.current = new Audio(previewUrl.current);
			await previewAudio.current.play();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "试听生成失败。");
		} finally {
			setBusy(null);
		}
	};

	const addToTimeline = async () => {
		if (!activeProject) return toast.error("请先打开一个项目。");
		setBusy("add");
		try {
			const result = await generate();
			const processed = await processMediaAssets({
				files: [fileFromResult(result)],
			});
			const asset = processed[0];
			if (!asset) throw new Error("生成的音频无法导入项目。");
			const savedAsset = await editor.media.addMediaAsset({
				projectId: activeProject.metadata.id,
				asset,
			});
			if (!savedAsset) throw new Error("生成的音频保存失败。");
			const duration =
				typeof savedAsset.duration === "number" &&
				Number.isFinite(savedAsset.duration) &&
				savedAsset.duration > 0
					? mediaTimeFromSeconds({ seconds: savedAsset.duration })
					: DEFAULT_NEW_ELEMENT_DURATION;
			const element = buildElementFromMedia({
				mediaId: savedAsset.id,
				mediaType: savedAsset.type,
				name: savedAsset.name,
				duration,
				startTime: editor.playback.getCurrentTime(),
			});
			editor.timeline.insertElement({
				element,
				placement: { mode: "auto", trackType: "audio" },
			});
			toast.success("角色配音已加入时间线。");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "角色配音生成失败。",
			);
		} finally {
			setBusy(null);
		}
	};

	return (
		<PanelView title="角色配音">
			<div className="space-y-4 p-2 pb-5">
				<div className="space-y-2">
					<Label htmlFor="dubbing-text">输入文本</Label>
					<Textarea
						id="dubbing-text"
						value={text}
						onChange={(event) => setText(event.target.value)}
						placeholder="输入要让角色朗读的文字…"
						className="min-h-32"
						maxLength={500}
						disabled={busy !== null}
					/>
					<div className="text-right text-xs text-muted-foreground">
						{text.length} / 500
					</div>
				</div>
				<div className="grid grid-cols-3 gap-2">
					<div className="space-y-2">
						<Label htmlFor="edge-tts-voice">语音选择</Label>
						<select
							id="edge-tts-voice"
							className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm"
							value={voice}
							onChange={(event) => setVoice(event.target.value)}
							disabled={busy !== null}
						>
							{EDGE_TTS_VOICES.map(([id, label]) => (
								<option key={id} value={id}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edge-tts-speed">语速调节</Label>
						<select
							id="edge-tts-speed"
							className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm"
							value={speed}
							onChange={(event) => setSpeed(Number(event.target.value))}
							disabled={busy !== null}
						>
							{SPEEDS.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="edge-tts-pitch">音调高低</Label>
						<select
							id="edge-tts-pitch"
							className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm"
							value={pitch}
							onChange={(event) => setPitch(Number(event.target.value))}
							disabled={busy !== null}
						>
							{PITCHES.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="w-full space-y-2 sm:w-1/3">
					<Label htmlFor="edge-tts-style">语音风格</Label>
					<select
						id="edge-tts-style"
						className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm"
						value={style}
						onChange={(event) => setStyle(event.target.value)}
						disabled={busy !== null}
					>
						{STYLES.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</div>
				<div className="grid grid-cols-2 gap-2 pt-1">
					<Button variant="outline" onClick={preview} disabled={busy !== null}>
						<HugeiconsIcon icon={PlayIcon} className="mr-1 size-4" />
						{busy === "preview"
							? "正在生成…"
							: text.trim()
								? "试听"
								: "试听示例"}
					</Button>
					<Button
						onClick={addToTimeline}
						disabled={busy !== null || !text.trim()}
					>
						<HugeiconsIcon icon={Add01Icon} className="mr-1 size-4" />
						{busy === "add" ? "正在生成…" : "生成并加入音轨"}
					</Button>
				</div>
				<p className="text-[11px] leading-4 text-muted-foreground">
					请仅使用有权使用的文本与声音。生成的语音会直接加入当前项目时间线。
				</p>
			</div>
		</PanelView>
	);
}
