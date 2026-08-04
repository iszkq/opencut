"use client";

import { useState } from "react";
import { TransitionTopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download, FolderOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Section, SectionContent, SectionHeader, SectionTitle } from "@/components/section";
import { cn } from "@/utils/ui";
import { exportRenderedTimeline, revealNativeExport, tryNativeExport } from "@/export/native";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";

type ExportKind = "video" | "audio";
type AudioFormat = "mp3" | "wav";
type VideoResult = { outputPath: string; mode: "hardware" | "cpu" };

export function ExportButton() {
	const [open, setOpen] = useState(false);
	const hasProject = Boolean(useEditor((store) => store.project.getActiveOrNull()));

	return (
		<Popover
			open={open}
			// Closing a popover is ordinary navigation, not an export cancellation.
			// The render/export job is owned by ProjectManager and must continue
			// while the user selects clips, edits the timeline, or switches panels.
			onOpenChange={setOpen}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={!hasProject}
					onClick={hasProject ? () => setOpen(true) : undefined}
					className={cn(
						"flex items-center gap-1.5 rounded-md bg-[#38BDF8] px-[0.5rem] py-[0.12rem] text-white",
						hasProject ? "cursor-pointer" : "cursor-not-allowed opacity-50",
					)}
				>
					<HugeiconsIcon icon={TransitionTopIcon} className="size-3.5" />
					<span className="text-[0.875rem]">导出</span>
				</button>
			</PopoverTrigger>
			{hasProject && <ExportPopover onClose={() => setOpen(false)} />}
		</Popover>
	);
}

function ExportPopover({ onClose }: { onClose: () => void }) {
	const editor = useEditor();
	const project = useEditor((store) => store.project.getActive());
	const [kind, setKind] = useState<ExportKind>("video");
	const [audioFormat, setAudioFormat] = useState<AudioFormat>("mp3");
	const [includeAudio, setIncludeAudio] = useState(true);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [videoResult, setVideoResult] = useState<VideoResult | null>(null);
	const [audioFinished, setAudioFinished] = useState(false);

	const exportVideo = async () => {
		const scene = editor.scenes.getActiveScene();
		if (!scene) return setError("当前项目没有可导出的时间线。");
		setError(null);
		setVideoResult(null);
		setIsWorking(true);
		try {
			let result = await tryNativeExport({
				scene,
				mediaAssets: editor.media.getAssets(),
				includeAudio,
				projectName: project.metadata.name,
			});

			// Fast path handles normal video cuts entirely in FFmpeg. Complex scenes
			// retain every editor element, then their rendered picture is handed back
			// to Electron for final local hardware/CPU encoding and file saving.
			if (!result) {
				const rendered = await editor.project.export({
					options: { format: "mp4", quality: "high", includeAudio },
				});
				if (!rendered.success || !rendered.buffer) {
					throw new Error(rendered.error || "工程画面合成失败。");
				}
				result = await exportRenderedTimeline({
					projectName: project.metadata.name,
					includeAudio,
					video: rendered.buffer,
				});
				if (!result) {
					throw new Error("未检测到桌面本地编码器。请使用 OpenCut 中文版桌面应用导出。");
				}
			}

			if (!result.cancelled && result.outputPath) {
				setVideoResult({
					outputPath: result.outputPath,
					mode: result.mode === "cpu" ? "cpu" : "hardware",
				});
			}
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "本地视频导出失败。");
		} finally {
			setIsWorking(false);
		}
	};

	const exportAudio = async () => {
		const scene = editor.scenes.getActiveScene();
		if (!scene) return setError("当前项目没有可导出的时间线。");
		setError(null);
		setAudioFinished(false);
		setIsWorking(true);
		try {
			const audio = await extractTimelineAudio({
				tracks: scene.tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});
			const formData = new FormData();
			formData.append("audio", audio, "timeline.wav");
			formData.append("format", audioFormat);
			const response = await fetch("/api/export/audio", { method: "POST", body: formData });
			if (!response.ok) throw new Error("本地音频编码失败。");
			const blob = new Blob([await response.arrayBuffer()], {
				type: audioFormat === "mp3" ? "audio/mpeg" : "audio/wav",
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${project.metadata.name}.${audioFormat}`;
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			setAudioFinished(true);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "本地音频导出失败。");
		} finally {
			setIsWorking(false);
		}
	};

	if (videoResult) {
		return (
			<PopoverContent className="mr-4 w-80 p-4">
				<div className="space-y-3">
					<p className="font-medium text-constructive">
						视频已由本地{videoResult.mode === "hardware" ? "硬件" : "CPU"}编码完成
					</p>
					<p className="text-xs text-muted-foreground">文件已保存到你选择的位置。</p>
					<Button className="w-full gap-2" onClick={() => void revealNativeExport({ outputPath: videoResult.outputPath })}>
						<FolderOpen className="size-4" />在文件夹中显示
					</Button>
					<Button variant="outline" className="w-full" onClick={onClose}>完成</Button>
				</div>
			</PopoverContent>
		);
	}

	if (audioFinished) {
		return <PopoverContent className="mr-4 w-80 p-4"><div className="space-y-3"><p className="font-medium text-constructive">音频已由本地编码完成</p><p className="text-xs text-muted-foreground">已开始下载 {audioFormat.toUpperCase()} 文件。</p><Button className="w-full" onClick={onClose}>完成</Button></div></PopoverContent>;
	}

	return (
		<PopoverContent className="mr-4 w-80 p-0">
			<div className="border-b p-3"><h3 className="font-medium text-sm">{isWorking ? "正在本地导出" : "导出项目"}</h3></div>
			{isWorking ? <div className="p-4 text-sm text-muted-foreground">{kind === "video" ? "正在合成工程画面，并交由本地硬件/CPU 编码器保存…" : "正在混合并编码本地音频…"}</div> : <div className="flex flex-col gap-4"><div className="flex flex-col"><Section collapsible defaultOpen showTopBorder={false}><SectionHeader><SectionTitle>导出内容</SectionTitle></SectionHeader><SectionContent><RadioGroup value={kind} onValueChange={(value) => (value === "video" || value === "audio") && setKind(value)}><div className="flex items-center space-x-2"><RadioGroupItem value="video" id="native-video" /><Label htmlFor="native-video">本地视频导出（MP4）</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="audio" id="native-audio" /><Label htmlFor="native-audio">仅导出音频</Label></div></RadioGroup></SectionContent></Section>{kind === "video" ? <Section collapsible defaultOpen><SectionHeader><SectionTitle>视频编码</SectionTitle></SectionHeader><SectionContent><p className="text-xs text-muted-foreground">文字、字幕、贴纸、表情、转场和滤镜都会导出。纯视频会直接本地快速编码；带效果的工程会先合成画面，再由桌面版的 NVIDIA、Intel、AMD 或 CPU 编码器保存，不会触发浏览器下载。</p><div className="mt-3 flex items-center space-x-2"><Checkbox id="native-include-audio" checked={includeAudio} onCheckedChange={(checked) => setIncludeAudio(Boolean(checked))} /><Label htmlFor="native-include-audio">视频中包含音频</Label></div></SectionContent></Section> : <Section collapsible defaultOpen><SectionHeader><SectionTitle>音频格式</SectionTitle></SectionHeader><SectionContent><RadioGroup value={audioFormat} onValueChange={(value) => (value === "mp3" || value === "wav") && setAudioFormat(value)}><div className="flex items-center space-x-2"><RadioGroupItem value="mp3" id="audio-mp3" /><Label htmlFor="audio-mp3">MP3（通用、体积较小）</Label></div><div className="flex items-center space-x-2"><RadioGroupItem value="wav" id="audio-wav" /><Label htmlFor="audio-wav">WAV（无压缩）</Label></div></RadioGroup></SectionContent></Section>}</div><div className="px-3 pb-3"><Button className="w-full gap-2" onClick={() => void (kind === "video" ? exportVideo() : exportAudio())}><Download className="size-4" />开始本地导出</Button></div>{error && <div className="mx-3 mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}</div>}
		</PopoverContent>
	);
}
