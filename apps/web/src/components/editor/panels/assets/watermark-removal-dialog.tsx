"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, MousePointer2 } from "lucide-react";
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
import type { MediaAsset } from "@/media/types";

type RelativeRect = { x: number; y: number; width: number; height: number };

type DesktopWatermarkBridge = {
	removeWatermark: (payload: {
		video: ArrayBuffer;
		fileName: string;
		width: number;
		height: number;
		x: number;
		y: number;
		maskWidth: number;
		maskHeight: number;
		padding: number;
		mode: "smart" | "fast";
	}) => Promise<{ video: ArrayBuffer; encoder: string }>;
};

const defaultRect: RelativeRect = { x: 0.72, y: 0.04, width: 0.2, height: 0.12 };

function clamp(value: number, min = 0, max = 1) {
	return Math.min(max, Math.max(min, value));
}

function normalizeRect(startX: number, startY: number, endX: number, endY: number): RelativeRect {
	const x = clamp(Math.min(startX, endX));
	const y = clamp(Math.min(startY, endY));
	return {
		x,
		y,
		width: Math.max(0.01, clamp(Math.abs(endX - startX), 0.01, 1 - x)),
		height: Math.max(0.01, clamp(Math.abs(endY - startY), 0.01, 1 - y)),
	};
}

export function WatermarkRemovalDialog({
	asset,
	onOpenChange,
	onComplete,
}: {
	asset: MediaAsset | null;
	onOpenChange: (open: boolean) => void;
	onComplete: (file: File) => Promise<void>;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const drawingStart = useRef<{ x: number; y: number } | null>(null);
	const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
	const [rect, setRect] = useState<RelativeRect>(defaultRect);
	const [mode, setMode] = useState<"smart" | "fast">("smart");
	const [edgePadding, setEdgePadding] = useState(2);
	const [isRemoving, setIsRemoving] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [resultFile, setResultFile] = useState<File | null>(null);
	const [resultUrl, setResultUrl] = useState<string | null>(null);

	useEffect(() => {
		setRect(defaultRect);
		setDimensions(
			asset?.width && asset?.height ? { width: asset.width, height: asset.height } : null,
		);
		setStatus(null);
		setErrorMessage(null);
		setResultFile(null);
		setResultUrl(null);
		setEdgePadding(2);
	}, [asset?.id, asset?.height, asset?.width]);

	useEffect(() => {
		return () => {
			if (resultUrl) URL.revokeObjectURL(resultUrl);
		};
	}, [resultUrl]);

	const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
		const bounds = videoRef.current?.getBoundingClientRect();
		if (!bounds) return null;
		return {
			x: clamp((event.clientX - bounds.left) / bounds.width),
			y: clamp((event.clientY - bounds.top) / bounds.height),
		};
	};

	const setPixelField = (field: keyof RelativeRect, value: string) => {
		if (!dimensions) return;
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const divisor = field === "x" || field === "width" ? dimensions.width : dimensions.height;
		setRect((current) => {
			const next = { ...current, [field]: numeric / divisor };
			next.x = clamp(next.x);
			next.y = clamp(next.y);
			next.width = clamp(next.width, 0.01, 1 - next.x);
			next.height = clamp(next.height, 0.01, 1 - next.y);
			return next;
		});
	};

	const removeWithDesktopEngine = async ({
		x,
		y,
		width,
		height,
	}: {
		x: number;
		y: number;
		width: number;
		height: number;
	}): Promise<File | null> => {
		if (!asset) return null;
		const desktop = (window as Window & { opencutDesktop?: DesktopWatermarkBridge })
			.opencutDesktop;
		if (!desktop) return null;
		setStatus("正在准备本机视频引擎...");
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const video = await asset.file.arrayBuffer();
		setStatus("正在使用本机硬件修复...");
		const result = await desktop.removeWatermark({
			video,
			fileName: asset.name,
			width: dimensions?.width ?? 0,
			height: dimensions?.height ?? 0,
			x,
			y,
			maskWidth: width,
			maskHeight: height,
			padding: edgePadding,
			mode,
		});
		const baseName = asset.name.replace(/\.[^.]+$/, "");
		return new File([result.video], `去水印-${baseName}.mp4`, { type: "video/mp4" });
	};

	const handleRemove = async () => {
		if (!asset || !dimensions) {
			toast.error("视频信息尚未读取完成，请稍候。");
			return;
		}
		const x = Math.round(rect.x * dimensions.width);
		const y = Math.round(rect.y * dimensions.height);
		const width = Math.max(2, Math.round(rect.width * dimensions.width));
		const height = Math.max(2, Math.round(rect.height * dimensions.height));
		if (width < 8 || height < 8) {
			toast.error("框选区域太小，请重新框选水印。");
			return;
		}

		setIsRemoving(true);
		setErrorMessage(null);
		setStatus("正在准备本机视频引擎...");
		try {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			const directFile = await removeWithDesktopEngine({
				x,
				y,
				width: Math.min(width, dimensions.width - x),
				height: Math.min(height, dimensions.height - y),
			});
			if (directFile) {
				setResultFile(directFile);
				setResultUrl(URL.createObjectURL(directFile));
				setStatus("修复完成，请播放预览确认效果。");
				return;
			}
			const formData = new FormData();
			formData.set("video", asset.file, asset.name);
			formData.set("videoWidth", String(dimensions.width));
			formData.set("videoHeight", String(dimensions.height));
			formData.set("x", String(x));
			formData.set("y", String(y));
			formData.set("width", String(Math.min(width, dimensions.width - x)));
			formData.set("height", String(Math.min(height, dimensions.height - y)));
			formData.set("mode", mode);
			setStatus("正在使用本机视频引擎修复...");
			const response = await fetch("/api/watermark/remove", { method: "POST", body: formData });
			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(data?.error || "本地修复失败。");
			}
			setStatus("正在准备修复后的视频预览...");
			const baseName = asset.name.replace(/\.[^.]+$/, "");
			const file = new File([await response.blob()], `去水印-${baseName}.mp4`, {
				type: "video/mp4",
			});
			setResultFile(file);
			setResultUrl(URL.createObjectURL(file));
			setStatus("修复完成，请播放预览确认效果。");
		} catch (error) {
			const message = error instanceof Error ? error.message : "请重新尝试。";
			setErrorMessage(message);
			toast.error("去水印失败", { description: message });
		} finally {
			setIsRemoving(false);
			setStatus(null);
		}
	};

	const handleApplyResult = async () => {
		if (!resultFile) return;
		setIsRemoving(true);
		setErrorMessage(null);
		setStatus("正在应用修复后的视频...");
		try {
			await onComplete(resultFile);
			toast.success("已应用去水印视频", { description: "当前片段已替换，原素材仍保留。" });
			onOpenChange(false);
		} catch (error) {
			const message = error instanceof Error ? error.message : "请重新尝试。";
			setErrorMessage(message);
			toast.error("应用修复视频失败", { description: message });
		} finally {
			setIsRemoving(false);
		}
	};

	return (
		<Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-4xl">
				<DialogHeader>
					<DialogTitle>本地去水印</DialogTitle>
					<DialogDescription>
						拖拽框选固定位置的台标或角标。修复在本机完成，不会上传到云端。
					</DialogDescription>
				</DialogHeader>
				<DialogBody className="grid max-h-[72vh] overflow-y-auto md:grid-cols-[minmax(0,1fr)_13rem]">
					<div className="min-w-0">
						<div
							className="relative inline-block max-w-full cursor-crosshair overflow-hidden bg-black touch-none"
							onPointerDown={(event) => {
								if (isRemoving || resultFile) return;
								const point = updateFromPointer(event);
								if (!point) return;
								event.currentTarget.setPointerCapture(event.pointerId);
								drawingStart.current = point;
								setRect({ x: point.x, y: point.y, width: 0.01, height: 0.01 });
							}}
							onPointerMove={(event) => {
								if (!drawingStart.current) return;
								const point = updateFromPointer(event);
								if (point) setRect(normalizeRect(drawingStart.current.x, drawingStart.current.y, point.x, point.y));
							}}
							onPointerUp={() => {
								drawingStart.current = null;
							}}
						>
							<video
								ref={videoRef}
								src={resultUrl ?? asset?.url}
								muted
								controls
								className="block max-h-[52vh] max-w-full"
								onLoadedMetadata={(event) => setDimensions({ width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })}
							/>
							{!resultFile ? (
								<div
									className="pointer-events-none absolute border-2 border-red-500 bg-red-500/15"
									style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
								/>
							) : null}
						</div>
						<p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><MousePointer2 className="size-3.5" />{resultFile ? "这是修复后的预览，确认后再应用到时间线。" : "在画面上拖拽可重新框选区域"}</p>
					</div>
					<div className="space-y-4">
						<div className="grid grid-cols-2 gap-2">
							{(["x", "y", "width", "height"] as const).map((field) => (
								<div key={field} className="space-y-1.5">
									<Label htmlFor={`watermark-${field}`}>{({ x: "左", y: "上", width: "宽", height: "高" })[field]}（像素）</Label>
									<Input id={`watermark-${field}`} type="number" min={0} disabled={!dimensions || isRemoving || Boolean(resultFile)} value={dimensions ? Math.round(rect[field] * (field === "x" || field === "width" ? dimensions.width : dimensions.height)) : ""} onChange={(event) => setPixelField(field, event.target.value)} />
								</div>
							))}
						</div>
						<div className="space-y-2">
							<Label>修复方式</Label>
							<label className="flex cursor-pointer gap-2 rounded border p-2 text-sm"><input type="radio" checked={mode === "smart"} onChange={() => setMode("smart")} disabled={isRemoving || Boolean(resultFile)} /><span><b>智能修复</b><br /><span className="text-xs text-muted-foreground">适合小型固定水印，边缘更自然</span></span></label>
							<label className="flex cursor-pointer gap-2 rounded border p-2 text-sm"><input type="radio" checked={mode === "fast"} onChange={() => setMode("fast")} disabled={isRemoving || Boolean(resultFile)} /><span><b>快速修复</b><br /><span className="text-xs text-muted-foreground">速度更快，可能有轻微模糊</span></span></label>
						</div>
						<div className="space-y-2">
							<Label htmlFor="watermark-edge-padding">边缘扩展：{edgePadding} 像素</Label>
							<input id="watermark-edge-padding" className="w-full accent-foreground" type="range" min={0} max={24} step={1} value={edgePadding} disabled={isRemoving || Boolean(resultFile)} onChange={(event) => setEdgePadding(Number(event.target.value))} />
							<p className="text-xs text-muted-foreground">水印边缘残留时适当增加；影响附近画面时减小。</p>
						</div>
					</div>
				</DialogBody>
				<DialogFooter className="sm:items-center">
					<div className="mr-auto text-sm">
						{status ? <span className="text-muted-foreground">{status}</span> : null}
						{!isRemoving && errorMessage ? <span className="text-destructive">{errorMessage}</span> : null}
					</div>
					<Button variant="outline" onClick={() => onOpenChange(false)} disabled={isRemoving}>取消</Button>
					{resultFile ? <><Button variant="outline" onClick={() => { setResultFile(null); setResultUrl(null); setStatus(null); }} disabled={isRemoving}>重新框选</Button><Button onClick={handleApplyResult} disabled={isRemoving}>应用到时间线</Button></> : <Button onClick={handleRemove} disabled={!dimensions || isRemoving}>{isRemoving ? <><LoaderCircle className="animate-spin" />正在本地修复</> : "开始修复"}</Button>}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
