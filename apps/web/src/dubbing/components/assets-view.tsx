"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { useEditor } from "@/editor/use-editor";
import { processMediaAssets } from "@/media/processing";
import { buildElementFromMedia } from "@/timeline/element-utils";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import { toast } from "sonner";
import { PlayIcon, Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type CloudTtsResult = {
	name: string;
	base64: string;
	mimeType: string;
	path: string;
};

type TtsBridge = {
	cloudTtsStatus: () => Promise<{ configured: boolean; shared: boolean }>;
	saveCloudTtsApiKey: (params: { apiKey: string }) => Promise<{ configured: boolean }>;
	generateCloudTts: (params: { text: string; model: string; voice: string }) => Promise<CloudTtsResult>;
};

const SAMPLE_TEXT = "你好，这是一段通义高质量角色配音试听示例。";
const VOICES_BY_MODEL: Record<string, Array<{ id: string; label: string }>> = {
	"qwen-audio-3.0-tts-flash": [
		{ id: "longanhuan_v3.6", label: "龙安欢 · 清晰女声" },
		{ id: "longanlingxin", label: "龙安灵心 · 温柔女声" },
	],
	"qwen-audio-3.0-tts-plus": [
		{ id: "longanlingxin", label: "龙安灵心 · 温柔女声" },
		{ id: "longanhuan_v3.6", label: "龙安欢 · 清晰女声" },
	],
	"gemini-2.5-flash-preview-tts": [
		["Zephyr", "明亮女声"], ["Puck", "活泼少年"], ["Charon", "资讯男声"], ["Kore", "坚定女声"], ["Fenrir", "激昂男声"], ["Leda", "青春女声"], ["Orus", "沉稳男声"], ["Aoede", "轻快女声"], ["Callirrhoe", "随和女声"], ["Autonoe", "明亮女声"], ["Enceladus", "气声男声"], ["Iapetus", "清晰男声"], ["Umbriel", "柔和男声"], ["Algieba", "成熟男声"], ["Despina", "柔和女声"], ["Erinome", "温柔女声"], ["Algenib", "干练男声"], ["Rasalgethi", "知性女声"], ["Laomedeia", "活力女声"], ["Achernar", "平静男声"], ["Alnilam", "温和男声"], ["Schedar", "叙事女声"], ["Gacrux", "低沉男声"], ["Pulcherrima", "优雅女声"], ["Achird", "亲切男声"], ["Zubenelgenubi", "沉静女声"], ["Vindemiatrix", "专业女声"], ["Sadachbia", "随和男声"], ["Sadaltager", "稳重男声"], ["Sulafat", "柔美女声"],
	].map(([id, label]) => ({ id, label })),
	"gemini-2.5-pro-preview-tts": [],
	"gpt-4o-mini-tts": [
		["alloy", "中性平衡"], ["ash", "清晰专业"], ["ballad", "温暖叙事"], ["coral", "亲切自然"], ["echo", "明亮男声"], ["fable", "戏剧表达"], ["onyx", "低沉权威"], ["nova", "活力女声"], ["sage", "成熟知性"], ["shimmer", "柔和女声"], ["verse", "清晰通用"], ["marin", "自然亲和"], ["cedar", "稳定男声"],
	].map(([id, label]) => ({ id, label })),
};
VOICES_BY_MODEL["gemini-2.5-pro-preview-tts"] = VOICES_BY_MODEL["gemini-2.5-flash-preview-tts"];

function getDesktopBridge(): TtsBridge | null {
	return (window as Window & { opencutDesktop?: TtsBridge }).opencutDesktop ?? null;
}

function fileFromResult(result: CloudTtsResult) {
	const binary = atob(result.base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return new File([bytes], result.name, { type: result.mimeType || "audio/mpeg" });
}

export function DubbingView() {
	const editor = useEditor();
	const activeProject = useEditor((state) => state.project.getActive());
	const [ready, setReady] = useState(false);
	const [shared, setShared] = useState(false);
	const [text, setText] = useState("");
	const [model, setModel] = useState("qwen-audio-3.0-tts-flash");
	const [voice, setVoice] = useState(VOICES_BY_MODEL["qwen-audio-3.0-tts-flash"][0].id);
	const [apiKey, setApiKey] = useState("");
	const [busy, setBusy] = useState<"save" | "preview" | "add" | null>(null);
	const previewUrl = useRef<string | null>(null);
	const previewAudio = useRef<HTMLAudioElement | null>(null);
	const voices = VOICES_BY_MODEL[model] ?? [];

	const changeModel = (nextModel: string) => {
		setModel(nextModel);
		setVoice((VOICES_BY_MODEL[nextModel] ?? [])[0]?.id ?? "");
	};

	useEffect(() => {
		const bridge = getDesktopBridge();
		let mounted = true;
		void bridge?.cloudTtsStatus()
			.then((status) => {
				if (!mounted) return;
				setReady(status.configured);
				setShared(status.shared);
			})
			.catch(() => mounted && setReady(false));
		return () => {
			mounted = false;
			previewAudio.current?.pause();
			if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
		};
	}, []);

	const generate = async ({ useSampleText = false } = {}) => {
		const bridge = getDesktopBridge();
		if (!bridge) throw new Error("角色配音只能在桌面版中使用。");
		const input = text.trim() || (useSampleText ? SAMPLE_TEXT : "");
		if (!input) throw new Error("请输入需要配音的文字。");
		return bridge.generateCloudTts({ text: input, model, voice });
	};

	const saveApiKey = async () => {
		const bridge = getDesktopBridge();
		if (!bridge) return;
		setBusy("save");
		try {
			await bridge.saveCloudTtsApiKey({ apiKey });
			setApiKey("");
			setReady(true);
			setShared(false);
			toast.success("API Key 已安全保存到本机。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "API Key 保存失败。");
		} finally {
			setBusy(null);
		}
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
			const processed = await processMediaAssets({ files: [fileFromResult(result)] });
			const asset = processed[0];
			if (!asset) throw new Error("生成的音频无法导入项目。");
			const savedAsset = await editor.media.addMediaAsset({ projectId: activeProject.metadata.id, asset });
			if (!savedAsset) throw new Error("生成的音频保存失败。");
			const element = buildElementFromMedia({
				mediaId: savedAsset.id,
				mediaType: savedAsset.type,
				name: savedAsset.name,
				duration: savedAsset.duration ?? DEFAULT_NEW_ELEMENT_DURATION,
				startTime: editor.playback.getCurrentTime(),
			});
			editor.timeline.insertElement({ element, placement: { mode: "auto" } });
			toast.success("角色配音已加入时间线。");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "角色配音生成失败。");
		} finally {
			setBusy(null);
		}
	};

	return (
		<PanelView title="角色配音">
			<div className="space-y-4 p-2 pb-5">
				<div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
					通义在线高质量角色配音。{ready ? (shared ? "共享免费额度可用：每次最多 500 字。" : "正在使用本机 API Key。") : "共享服务暂未配置。"}
				</div>
				<div className="space-y-2">
					<Label htmlFor="cloud-tts-model">配音质量</Label>
					<select id="cloud-tts-model" className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm" value={model} onChange={(event) => changeModel(event.target.value)} disabled={busy !== null}>
						<option value="qwen-audio-3.0-tts-flash">通义 Flash（推荐，速度快）</option>
						<option value="qwen-audio-3.0-tts-plus">通义 Plus（更自然）</option>
						<option value="gemini-2.5-flash-preview-tts">Gemini Flash（30 个角色）</option>
						<option value="gemini-2.5-pro-preview-tts">Gemini Pro（30 个角色，更细腻）</option>
						<option value="gpt-4o-mini-tts">GPT-4o mini（13 个角色）</option>
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="cloud-tts-voice">角色音色</Label>
					<select id="cloud-tts-voice" className="border-input bg-input h-9 w-full rounded-md border px-3 text-sm" value={voice} onChange={(event) => setVoice(event.target.value)} disabled={busy !== null}>
						{voices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
					</select>
				</div>
				<div className="space-y-2">
					<Label htmlFor="dubbing-text">配音文字</Label>
					<Textarea id="dubbing-text" value={text} onChange={(event) => setText(event.target.value)} placeholder="输入要让角色朗读的文字…" className="min-h-32" maxLength={500} disabled={!ready || busy !== null} />
					<div className="text-right text-xs text-muted-foreground">{text.length} / 500</div>
				</div>
				{!ready && (
					<div className="flex gap-2">
						<Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="AIHUBMIX API Key" disabled={busy !== null} />
						<Button variant="outline" onClick={saveApiKey} disabled={!apiKey.trim() || busy !== null}>保存</Button>
					</div>
				)}
				<div className="grid grid-cols-2 gap-2 pt-1">
					<Button variant="outline" onClick={preview} disabled={!ready || busy !== null}>
						<HugeiconsIcon icon={PlayIcon} className="mr-1 size-4" />{busy === "preview" ? "正在生成…" : text.trim() ? "试听" : "试听示例"}
					</Button>
					<Button onClick={addToTimeline} disabled={!ready || busy !== null || !text.trim()}>
						<HugeiconsIcon icon={Add01Icon} className="mr-1 size-4" />{busy === "add" ? "正在生成…" : "生成并加入"}
					</Button>
				</div>
				<p className="text-[11px] leading-4 text-muted-foreground">请仅使用有权使用的文本与声音。在线配音会将文字发送到通义语音服务。</p>
			</div>
		</PanelView>
	);
}
