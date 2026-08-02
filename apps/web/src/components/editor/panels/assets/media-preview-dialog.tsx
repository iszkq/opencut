"use client";

import Image from "next/image";
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
import type { MediaAsset } from "@/media/types";

export function MediaPreviewDialog({ asset, onOpenChange }: { asset: MediaAsset | null; onOpenChange: (open: boolean) => void }) {
	return <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
		<DialogContent className="max-w-4xl">
			<DialogHeader><DialogTitle>素材预览</DialogTitle><DialogDescription className="truncate" title={asset?.name}>{asset?.name}</DialogDescription></DialogHeader>
			<DialogBody className="items-center bg-black/95">
				{asset?.type === "video" ? <video src={asset.url} controls autoPlay className="max-h-[65vh] max-w-full" /> : null}
				{asset?.type === "audio" ? <audio src={asset.url} controls autoPlay className="w-full" /> : null}
				{asset?.type === "image" ? <div className="relative h-[60vh] w-full"><Image src={asset.url ?? ""} alt={asset.name} fill sizes="80vw" className="object-contain" unoptimized /></div> : null}
			</DialogBody>
			<DialogFooter><Button onClick={() => onOpenChange(false)}>关闭预览</Button></DialogFooter>
		</DialogContent>
	</Dialog>;
}
