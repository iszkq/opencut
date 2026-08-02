"use client";

import { useState } from "react";
import { FileVideo, LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConversionBridge = {
	selectConversionFiles: () => Promise<string[]>;
	convertMedia: (payload: {
		inputPath: string;
		profileId: string;
		quality: string;
		width: number;
		height: number;
		scaleMode: string;
		fps: number;
		targetMb: number;
	}) => Promise<{ outputPath: string; name: string; size: number }>;
};

const formats = [
	["mp4_h264", "MP4 视频（通用 H.264）"], ["mp4_hevc", "MP4 视频（高压缩 H.265）"],
	["mkv_h264", "MKV 视频（H.264）"], ["mkv_hevc", "MKV 视频（H.265）"], ["mov", "MOV 视频"], ["avi", "AVI 视频"],
	["webm_vp9", "WebM 视频（VP9）"], ["webm_av1", "WebM 视频（AV1）"], ["mpeg", "MPEG 视频"], ["ts", "MPEG-TS 视频"], ["m2ts", "M2TS 视频"], ["flv", "FLV 视频"], ["wmv", "WMV 视频"], ["ogv", "OGV 视频"], ["threegp", "3GP 视频"], ["vob", "VOB 视频"],
	["gif", "GIF 动图"], ["webp_anim", "WebP 动图"],
	["mp3", "MP3 音频"], ["wav", "WAV 音频（无损）"], ["flac", "FLAC 音频（无损）"], ["m4a", "M4A 音频（AAC）"], ["aac", "AAC 音频"], ["ogg", "OGG 音频"], ["opus", "Opus 音频"], ["wma", "WMA 音频"], ["ac3", "AC3 音频"], ["aiff", "AIFF 音频"], ["alac", "ALAC 音频"],
	["png", "PNG 图片"], ["jpg", "JPG 图片"], ["webp", "WebP 图片"], ["bmp", "BMP 图片"], ["tiff", "TIFF 图片"], ["tga", "TGA 图片"], ["avif", "AVIF 图片"], ["jxl", "JPEG XL 图片"],
] as const;

function desktopBridge() {
	return (window as Window & { opencutDesktop?: ConversionBridge }).opencutDesktop;
}

export function MediaConversionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
	const [files, setFiles] = useState<string[]>([]);
	const [profileId, setProfileId] = useState("mp4_h264");
	const [quality, setQuality] = useState("balanced");
	const [targetMb, setTargetMb] = useState(0);
	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
	const [scaleMode, setScaleMode] = useState("fit");
	const [fps, setFps] = useState(0);
	const [isConverting, setIsConverting] = useState(false);
	const [status, setStatus] = useState("选择电脑中的文件后，输出会保存在原文件同目录。");
	const [outputs, setOutputs] = useState<string[]>([]);

	const chooseFiles = async () => {
		const bridge = desktopBridge();
		if (!bridge) return toast.error("格式转换仅在桌面版可用。");
		const selected = await bridge.selectConversionFiles();
		if (selected.length) {
			setFiles((current) => [...new Set([...current, ...selected])]);
			setOutputs([]);
			setStatus(`已选择 ${files.length + selected.length} 个文件。`);
		}
	};

	const convert = async () => {
		const bridge = desktopBridge();
		if (!bridge || files.length === 0) return;
		setIsConverting(true);
		setOutputs([]);
		const completed: string[] = [];
		try {
			for (const [index, inputPath] of files.entries()) {
				setStatus(`正在转换 ${index + 1}/${files.length}：${inputPath.split(/[/\\]/).pop()}`);
				const result = await bridge.convertMedia({ inputPath, profileId, quality, width, height, scaleMode, fps, targetMb });
				completed.push(result.outputPath);
				setOutputs([...completed]);
			}
			setStatus(`转换完成，共生成 ${completed.length} 个文件。`);
			toast.success("格式转换完成", { description: "新文件已保存到各原文件所在目录。" });
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "转换失败。请检查格式或编码器支持情况。");
			toast.error("格式转换失败");
		} finally {
			setIsConverting(false);
		}
	};

	return <Dialog open={open} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-3xl">
			<DialogHeader><DialogTitle>格式转换与压缩</DialogTitle><DialogDescription>直接处理电脑本地文件，不会先导入项目。输出文件自动保存在原文件同目录。</DialogDescription></DialogHeader>
			<DialogBody className="grid max-h-[68vh] overflow-y-auto md:grid-cols-[minmax(0,1fr)_16rem]">
				<div className="min-w-0 space-y-3">
					<Button variant="outline" onClick={chooseFiles} disabled={isConverting}><Plus />添加本地文件</Button>
					<div className="min-h-48 space-y-1 rounded border p-2 text-sm">
						{files.length === 0 ? <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground"><FileVideo className="size-7" />尚未选择文件</div> : files.map((file) => <div key={file} className="truncate rounded px-2 py-1 hover:bg-muted" title={file}>{file.split(/[/\\]/).pop()}</div>)}
					</div>
					{outputs.length ? <div className="space-y-1 border-t pt-3 text-xs text-muted-foreground">{outputs.map((file) => <div key={file} className="truncate" title={file}>已生成：{file}</div>)}</div> : null}
				</div>
				<div className="space-y-3">
					<div className="space-y-1"><Label>输出格式</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={profileId} onChange={(event) => setProfileId(event.target.value)} disabled={isConverting}>{formats.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
					<div className="space-y-1"><Label>质量</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={quality} onChange={(event) => setQuality(event.target.value)} disabled={isConverting}><option value="high">高质量</option><option value="balanced">平衡</option><option value="small">小文件</option></select></div>
					<div className="space-y-1"><Label>目标大小（MB，0 表示不限制）</Label><Input type="number" min={0} value={targetMb || ""} onChange={(event) => setTargetMb(Number(event.target.value) || 0)} disabled={isConverting} /><p className="text-xs text-muted-foreground">会按时长计算输出码率；无损格式不限制目标大小。</p></div>
					<div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label>宽（0 保持）</Label><Input type="number" min={0} value={width || ""} onChange={(event) => setWidth(Number(event.target.value) || 0)} disabled={isConverting} /></div><div className="space-y-1"><Label>高（0 保持）</Label><Input type="number" min={0} value={height || ""} onChange={(event) => setHeight(Number(event.target.value) || 0)} disabled={isConverting} /></div></div>
					<div className="space-y-1"><Label>缩放方式</Label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={scaleMode} onChange={(event) => setScaleMode(event.target.value)} disabled={isConverting}><option value="fit">等比缩放</option><option value="pad">适应并补边</option><option value="crop">填满并裁剪</option><option value="stretch">拉伸到尺寸</option></select></div>
					<div className="space-y-1"><Label>限制帧率（0 表示保持）</Label><Input type="number" min={0} max={240} value={fps || ""} onChange={(event) => setFps(Number(event.target.value) || 0)} disabled={isConverting} /></div>
				</div>
			</DialogBody>
			<DialogFooter className="sm:items-center"><span className="mr-auto text-sm text-muted-foreground">{status}</span><Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConverting}>关闭</Button><Button onClick={convert} disabled={isConverting || files.length === 0}>{isConverting ? <><LoaderCircle className="animate-spin" />正在转换</> : "开始转换"}</Button></DialogFooter>
		</DialogContent>
	</Dialog>;
}
